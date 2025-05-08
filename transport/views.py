# transport/views.py

import os
import json
import csv
import subprocess
import tempfile
import hashlib
import shutil
import traceback
import zipfile
import xmltodict
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal # Import Decimal
from io import StringIO, BytesIO
from django.db.models import Case, When, Sum, Count, Q, F, Value, CharField, DecimalField # Import DecimalField, Value, F
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

from django.http import HttpResponse, JsonResponse, FileResponse
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db import transaction
from django.db.models.functions import Coalesce, TruncDate, TruncMonth
from django.contrib.auth.models import User
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from rest_framework import viewsets, status, mixins
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .serializers import (
    # User
    BatchUploadXMLSerializer, UserSerializer, UserUpdateSerializer,
    # CT-e
    UploadXMLSerializer, CTeDocumentoListSerializer, CTeDocumentoDetailSerializer,
    # MDF-e
    MDFeDocumentoListSerializer, MDFeDocumentoDetailSerializer, MDFeCancelamentoEncerramentoSerializer,
    # Veículos e Manutenção
    VeiculoSerializer, ManutencaoVeiculoSerializer,
    # Pagamentos
    FaixaKMSerializer, PagamentoAgregadoSerializer, PagamentoProprioSerializer,
    # Dashboard/Painéis
    DashboardGeralDataSerializer, FinanceiroPainelSerializer,
    CtePainelSerializer, MdfePainelSerializer, GeograficoPainelSerializer,
    # Configurações do Sistema
    ParametroSistemaSerializer, ConfiguracaoEmpresaSerializer, RegistroBackupSerializer,
    # Alertas
    AlertaPagamentoSerializer
)

from .models import (
    # CT-e
    CTeDocumento, CTeIdentificacao, CTePrestacaoServico, CTeComponenteValor,
    CTeCancelamento, # Adicionado CTeCancelamento aqui
    # MDF-e
    MDFeDocumento, MDFeIdentificacao, MDFeDocumentosVinculados,
    MDFeCancelamentoEncerramento, MDFeCancelamento, # Adicionado MDFeCancelamento
    # Veículos e Manutenção
    Veiculo, ManutencaoVeiculo,
    # Pagamentos
    FaixaKM, PagamentoAgregado, PagamentoProprio,
    # Configurações do Sistema
    ParametroSistema, ConfiguracaoEmpresa, RegistroBackup, CTeVeiculoRodoviario,
)

# Serviços para processamento de XML
from .services.parser_cte import parse_cte_completo
from .services.parser_mdfe import parse_mdfe_completo
from .services.parser_eventos import parse_evento

# ===============================================================
# ==> USUÁRIOS e AUTENTICAÇÃO
# ===============================================================

class CurrentUserAPIView(APIView):
    """API para obter e atualizar os dados do usuário autenticado."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, format=None):
        """Retorna os dados do usuário autenticado."""
        user = request.user
        data = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'last_login': user.last_login,
            'date_joined': user.date_joined
        }
        return Response(data)
    
    def patch(self, request, format=None):
        """Atualiza os dados do usuário autenticado."""
        user = request.user
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserViewSet(viewsets.ModelViewSet):
    """API para administração de usuários (somente admin)."""
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminUser]
    
    def get_serializer_class(self):
        if self.action == 'me' and self.request.method in ['PUT', 'PATCH']:
            return UserUpdateSerializer
        return UserSerializer
    
    @action(detail=False, methods=['get', 'put', 'patch'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Endpoint para o usuário logado gerenciar seu próprio perfil."""
        user = request.user
        
        if request.method == 'GET':
            serializer = self.get_serializer(user)
            return Response(serializer.data)
        elif request.method in ['PUT', 'PATCH']:
            serializer = self.get_serializer(user, data=request.data, partial=request.method=='PATCH')
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)


# Função auxiliar para gerar CSV
def _gerar_csv_response(queryset, serializer_class, filename):
    """Gera uma HttpResponse com CSV a partir de um queryset e serializer."""
    if not queryset.exists():
        return Response({"error": "Não há dados para gerar o relatório CSV."},
                       status=status.HTTP_404_NOT_FOUND)

    serializer = serializer_class(queryset, many=True)
    dados = serializer.data

    # Usa o primeiro item para obter as chaves (cabeçalhos)
    if not dados:
        return Response({"error": "Não há dados serializados para gerar o relatório CSV."},
                       status=status.HTTP_404_NOT_FOUND)

    field_names = list(dados[0].keys())

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'

    writer = csv.DictWriter(response, fieldnames=field_names)
    writer.writeheader()
    writer.writerows(dados)

    return response


# ===============================================================
# ==> UPLOAD e PROCESSAMENTO de XML
# ===============================================================

class UnifiedUploadViewSet(viewsets.ViewSet):
    """
    API para upload e processamento unificado de arquivos XML.
    Detecta automaticamente o tipo de XML e direciona para o parser correto.
    """
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]

    @swagger_auto_schema(
        operation_description="Envie arquivos XML para processamento automático",
        request_body=UploadXMLSerializer,
        responses={
            200: openapi.Response('Processado com sucesso (Atualização)', examples={'application/json': {'message': 'CT-e reprocessado com sucesso', 'id': 'uuid', 'chave': '...', 'reprocessamento': True}}),
            201: openapi.Response('Processado com sucesso (Criação)', examples={'application/json': {'message': 'CT-e processado com sucesso', 'id': 'uuid', 'chave': '...', 'reprocessamento': False}}),
            202: openapi.Response('Evento recebido, mas sem ação direta no DB', examples={'application/json': {'message': 'Evento recebido...', 'warning': '...'}}),
            400: openapi.Response('Erro nos dados ou no arquivo (Bad Request)', examples={'application/json': {'error': 'Mensagem de erro detalhada'}}),
            500: openapi.Response('Erro interno no processamento (Internal Server Error)', examples={'application/json': {'error': 'Mensagem de erro interna', 'details': '...'}})
        }
    )
    def create(self, request):
        """Recebe e processa o upload de XML."""
        serializer = UploadXMLSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Obter os arquivos XML
        arquivo_principal = serializer.validated_data['arquivo_xml']
        arquivo_retorno = serializer.validated_data.get('arquivo_xml_retorno')

        try:
            # Ler o conteúdo do XML principal
            try:
                xml_content = arquivo_principal.read().decode('utf-8')
            except UnicodeDecodeError:
                try:
                    arquivo_principal.seek(0)
                    xml_content = arquivo_principal.read().decode('latin-1')
                except Exception as decode_err:
                     return Response({
                        "error": f"Erro ao decodificar o arquivo principal: {str(decode_err)}. "
                                 f"Verifique se o arquivo é um XML válido com encoding UTF-8 ou Latin-1."
                    }, status=status.HTTP_400_BAD_REQUEST)

            # Ler o conteúdo do XML de retorno, se existir
            xml_retorno_content = None
            if arquivo_retorno:
                try:
                    xml_retorno_content = arquivo_retorno.read().decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        arquivo_retorno.seek(0)
                        xml_retorno_content = arquivo_retorno.read().decode('latin-1')
                    except Exception as decode_err:
                        print(f"Warning: Erro ao decodificar arquivo de retorno: {str(decode_err)}")
                        xml_retorno_content = None

            # Parse inicial para detecção de tipo mais robusta
            try:
                xml_dict_preview = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                root_tag = list(xml_dict_preview.keys())[0]

                # Direciona para o processador correto
                if root_tag in ('CTe', 'procCTe', 'cteProc'):
                    return self._process_cte(xml_content, arquivo_principal, xml_dict_preview)
                elif root_tag in ('MDFe', 'procMDFe', 'mdfeProc'):
                    return self._process_mdfe(xml_content, arquivo_principal, xml_dict_preview)
                elif root_tag in ('eventoCTe', 'procEventoCTe', 'eventoMDFe', 'procEventoMDFe',
                                  'retEventoCTe', 'retEventoMDFe'):
                    return self._process_evento(xml_content, xml_retorno_content, arquivo_principal)
                else:
                    return Response({
                        "error": f"Tipo de documento XML não reconhecido (tag raiz: {root_tag}). "
                                 f"Arquivos suportados: CT-e, MDF-e ou Eventos."
                    }, status=status.HTTP_400_BAD_REQUEST)

            except Exception as parse_err:
                print(f"Erro ao parsear XML para detecção de tipo: {parse_err}")
                return Response({
                    "error": f"Não foi possível parsear o XML para identificar o tipo. Erro: {str(parse_err)}. "
                             f"Verifique se o arquivo XML está bem formado e não está corrompido."
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            print(f"Erro inesperado no processamento de upload: {e}")
            return Response({
                "error": f"Erro inesperado ao processar o upload: {str(e)}",
                "details": traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _get_chave_from_dict(self, xml_dict, tipo_doc):
        """
        Tenta extrair a chave de acesso do dicionário XML parseado.
        Tipo_doc: 'CTE' ou 'MDFE'.
        Retorna a chave (44 dígitos) ou None se não encontrar.
        """
        prefixo = tipo_doc
        tag_inf = f'inf{tipo_doc}'

        try:
            # Procura o nó de informação principal em diferentes estruturas
            inf_node = xml_dict.get(f'proc{tipo_doc}', {}).get(tipo_doc, {}).get(tag_inf) or \
                       xml_dict.get(f'{tipo_doc.lower()}Proc', {}).get(tipo_doc, {}).get(tag_inf) or \
                       xml_dict.get(tipo_doc, {}).get(tag_inf)

            if not inf_node or '@Id' not in inf_node:
                return None

            id_completo = inf_node['@Id']
            if not isinstance(id_completo, str) or not id_completo.startswith(prefixo) or len(id_completo) != (len(prefixo) + 44):
                print(f"Warning: Formato do Id {tipo_doc} inesperado: {id_completo}")
                return None

            return id_completo[len(prefixo):]

        except Exception as e:
            print(f"Erro ao extrair chave {tipo_doc} do dicionário: {e}")
            return None

    def _get_chave_from_regex(self, xml_content, tipo_doc):
        """
        Tenta extrair a chave usando regex como fallback.
        """
        prefixo = tipo_doc
        tag_inf = f'inf{tipo_doc}'

        # Regex mais flexível para o atributo Id
        pattern = rf'<{tag_inf}[^>]*\sId\s*=\s*["\']{prefixo}(\d{{44}})["\'][^>]*>'
        chave_match = re.search(pattern, xml_content)

        if chave_match:
            return chave_match.group(1)
        else:
             pattern_sem_prefixo = rf'<{tag_inf}[^>]*\sId\s*=\s*["\'](\d{{44}})["\'][^>]*>'
             chave_match_sem_prefixo = re.search(pattern_sem_prefixo, xml_content)
             if chave_match_sem_prefixo:
                  print(f"Warning: Chave {tipo_doc} encontrada sem prefixo no atributo Id.")
                  return chave_match_sem_prefixo.group(1)
             return None

    def _process_cte(self, xml_content, arquivo, xml_dict=None):
        """Processa um XML de CT-e."""
        chave = None
        if xml_dict:
            chave = self._get_chave_from_dict(xml_dict, 'CTe')

        # Se falhou com xmltodict, tenta regex
        if not chave:
            chave = self._get_chave_from_regex(xml_content, 'CTe')

        if not chave:
            return Response({
                "error": "Não foi possível identificar a chave do CT-e no XML. "
                         "Verifique a tag <infCte> e o atributo Id='CTe...'."
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            cte, created = CTeDocumento.objects.update_or_create(
                chave=chave,
                defaults={
                    'xml_original': xml_content,
                    'arquivo_xml': arquivo,
                    'processado': False,
                    'versao': xml_dict.get('procCTe', {}).get('@versao') or \
                              xml_dict.get('cteProc', {}).get('@versao') or \
                              xml_dict.get('CTe', {}).get('@versao') or \
                              xml_dict.get('CTe', {}).get('infCte', {}).get('@versao', '4.00')
                }
            )
            reprocessamento = not created
        except Exception as db_err:
             return Response({
                 "error": f"Erro ao salvar/atualizar registro do CT-e no banco: {str(db_err)}"
             }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = parse_cte_completo(cte)
            if result:
                return Response({
                    "message": f"CT-e {'reprocessado' if reprocessamento else 'processado'} com sucesso",
                    "id": str(cte.id),
                    "chave": cte.chave,
                    "reprocessamento": reprocessamento
                }, status=status.HTTP_200_OK if reprocessamento else status.HTTP_201_CREATED)
            else:
                return Response({
                    "error": "Falha no processamento detalhado do CT-e. Verifique os logs do servidor."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            cte.processado = False
            cte.save(update_fields=['processado'])
            print(f"Erro detalhado ao processar CT-e {chave}: {parse_err}")
            return Response({
                "error": f"Erro ao processar dados do CT-e: {str(parse_err)}",
                "details": traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _process_mdfe(self, xml_content, arquivo, xml_dict=None):
        """Processa um XML de MDF-e."""
        chave = None
        if xml_dict:
            chave = self._get_chave_from_dict(xml_dict, 'MDFe')

        # Se falhou com xmltodict, tenta regex
        if not chave:
            chave = self._get_chave_from_regex(xml_content, 'MDFe')

        if not chave:
            return Response({
                "error": "Não foi possível identificar a chave do MDF-e no XML. "
                         "Verifique a tag <infMDFe> e o atributo Id='MDFe...'."
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            mdfe, created = MDFeDocumento.objects.update_or_create(
                chave=chave,
                defaults={
                    'xml_original': xml_content,
                    'arquivo_xml': arquivo,
                    'processado': False,
                    'versao': xml_dict.get('procMDFe', {}).get('@versao') or \
                              xml_dict.get('mdfeProc', {}).get('@versao') or \
                              xml_dict.get('MDFe', {}).get('@versao') or \
                              xml_dict.get('MDFe', {}).get('infMDFe', {}).get('@versao', '3.00')
                }
            )
            reprocessamento = not created
        except Exception as db_err:
             return Response({
                 "error": f"Erro ao salvar/atualizar registro do MDF-e no banco: {str(db_err)}"
             }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = parse_mdfe_completo(mdfe)
            if result:
                return Response({
                    "message": f"MDF-e {'reprocessado' if reprocessamento else 'processado'} com sucesso",
                    "id": str(mdfe.id),
                    "chave": mdfe.chave,
                    "reprocessamento": reprocessamento
                }, status=status.HTTP_200_OK if reprocessamento else status.HTTP_201_CREATED)
            else:
                return Response({
                    "error": "Falha no processamento detalhado do MDF-e. Verifique os logs do servidor."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            mdfe.processado = False
            mdfe.save(update_fields=['processado'])
            print(f"Erro detalhado ao processar MDF-e {chave}: {parse_err}")
            return Response({
                "error": f"Erro ao processar dados do MDF-e: {str(parse_err)}",
                "details": traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _process_evento(self, xml_content, xml_retorno_content, arquivo):
        """Processa um XML de evento."""
        try:
            result = parse_evento(xml_content, xml_retorno_content)

            if result is None:
                return Response({
                    "message": "Evento recebido, mas não foi processado ou registrado.",
                    "warning": "Verifique se o evento é suportado e se o documento principal existe."
                }, status=status.HTTP_202_ACCEPTED)

            # Determina a mensagem de sucesso com base no tipo de resultado
            evento_tipo = "Evento"
            doc_chave = "N/A"

            if isinstance(result, CTeCancelamento):
                evento_tipo = "Cancelamento de CT-e"
                doc_chave = result.cte.chave
            elif isinstance(result, MDFeCancelamento):
                evento_tipo = "Cancelamento de MDF-e"
                doc_chave = result.mdfe.chave
            elif isinstance(result, MDFeCancelamentoEncerramento):
                evento_tipo = "Cancelamento de Encerramento de MDF-e"
                doc_chave = result.mdfe.chave
            elif result is True:
                # Eventos como CCE podem retornar True
                evento_tipo = "Evento processado"
                # Tentar extrair a chave do XML original para a resposta
                try:
                    xml_dict = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                    infEvento = xml_dict.get('eventoCTe', {}).get('infEvento') or \
                                xml_dict.get('procEventoCTe', {}).get('eventoCTe', {}).get('infEvento') or \
                                xml_dict.get('eventoMDFe', {}).get('infEvento') or \
                                xml_dict.get('procEventoMDFe', {}).get('eventoMDFe', {}).get('infEvento')
                    if infEvento:
                         doc_chave = infEvento.get('chCTe') or infEvento.get('chMDFe') or "N/A"
                         evento_tipo = f"Evento {infEvento.get('tpEvento', '')} processado"
                except: pass

            return Response({
                "message": f"{evento_tipo} com sucesso.",
                "documento": doc_chave
            }, status=status.HTTP_201_CREATED)

        except ValueError as e:
            # Erros de validação esperados (ex: doc não encontrado)
            return Response({
                "error": str(e),
                "details": "Verifique se o XML do evento está correto e se o documento principal ao qual ele se refere existe no sistema."
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Erros inesperados durante o processamento do evento
            print(f"Erro inesperado ao processar evento: {e}")
            return Response({
                "error": f"Erro inesperado ao processar evento: {str(e)}",
                "details": traceback.format_exc()
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], serializer_class=BatchUploadXMLSerializer)
    def batch_upload(self, request):
        """
        Recebe e processa o upload em lote de múltiplos arquivos XML.
        """
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        arquivos = serializer.validated_data['arquivos_xml']
        resultados = []
        total_success = 0
        total_error = 0

        # Processar cada arquivo individualmente usando a lógica existente
        for arquivo in arquivos:
            resultado_processamento = {}
            try:
                arquivo.seek(0) # Garante que a leitura comece do início
                try:
                    xml_content = arquivo.read().decode('utf-8') # Tenta UTF-8 primeiro
                except UnicodeDecodeError:
                     try:
                         arquivo.seek(0)
                         xml_content = arquivo.read().decode('latin-1')
                     except Exception as decode_err:
                         resultado_processamento = {
                             'arquivo': arquivo.name,
                             'status': 'erro',
                             'erro': f"Erro ao decodificar: {str(decode_err)}"
                         }
                         resultados.append(resultado_processamento)
                         total_error += 1
                         continue # Pula para o próximo arquivo
                except Exception as read_err:
                     resultado_processamento = {
                         'arquivo': arquivo.name,
                         'status': 'erro',
                         'erro': f"Erro ao ler arquivo: {str(read_err)}"
                     }
                     resultados.append(resultado_processamento)
                     total_error += 1
                     continue

                # Tenta processar o conteúdo
                try:
                     # Parse para detectar tipo
                     xml_dict = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                     root_tag = list(xml_dict.keys())[0]

                     # Chama a função de processamento apropriada
                     response = None
                     if root_tag in ('CTe', 'procCTe', 'cteProc'):
                         response = self._process_cte(xml_content, arquivo, xml_dict)
                     elif root_tag in ('MDFe', 'procMDFe', 'mdfeProc'):
                         response = self._process_mdfe(xml_content, arquivo, xml_dict)
                     # Eventos geralmente não são ideais para lote, mas podemos tentar
                     elif root_tag in ('eventoCTe', 'procEventoCTe', 'eventoMDFe', 'procEventoMDFe'):
                          response = self._process_evento(xml_content, None, arquivo)
                     else:
                         response = Response({"error": f"Tipo não reconhecido ({root_tag})"}, status=400)

                     # Analisa a resposta do processamento
                     if status.is_success(response.status_code):
                         resultado_processamento = {
                             'arquivo': arquivo.name,
                             'status': 'sucesso',
                             'mensagem': response.data.get('message', 'Processado'),
                             'chave': response.data.get('chave'),
                             'tipo': response.data.get('tipo', root_tag) # Tenta pegar tipo da resposta
                         }
                         total_success += 1
                     else:
                         resultado_processamento = {
                             'arquivo': arquivo.name,
                             'status': 'erro',
                             'erro': response.data.get('error', f'Status {response.status_code}')
                         }
                         total_error += 1

                except Exception as process_err:
                     resultado_processamento = {
                         'arquivo': arquivo.name,
                         'status': 'erro',
                         'erro': f"Erro crítico no processamento: {str(process_err)}"
                     }
                     total_error += 1

            except Exception as e:
                resultado_processamento = {
                    'arquivo': arquivo.name,
                    'status': 'erro',
                    'erro': f"Erro crítico: {str(e)}"
                }
                total_error += 1

            resultados.append(resultado_processamento)

        # Retorna o resumo do lote
        return Response({
            'message': f"Processamento em lote concluído.",
            'sucesso': total_success,
            'erros': total_error,
            'resultados_detalhados': resultados
        })


# ===============================================================
# ==> APIS PARA CT-e
# ===============================================================

class CTeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """API para consulta de CT-es."""
    queryset = CTeDocumento.objects.all().order_by('-data_upload')
    serializer_class = CTeDocumentoListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CTeDocumentoDetailSerializer
        return CTeDocumentoListSerializer
    
    def get_queryset(self):
        """Permite filtrar os CT-es por diversos parâmetros."""
        queryset = super().get_queryset()
        
        # Filtro por período
        data_inicio = self.request.query_params.get('data_inicio')
        data_fim = self.request.query_params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(identificacao__data_emissao__gte=data_inicio)
        if data_fim:
            # Adiciona 1 dia para incluir todo o dia final
            from datetime import datetime, timedelta
            data_fim_obj = datetime.strptime(data_fim, '%Y-%m-%d') + timedelta(days=1)
            queryset = queryset.filter(identificacao__data_emissao__lt=data_fim_obj)
        
        # Filtro por modalidade (CIF/FOB)
        modalidade = self.request.query_params.get('modalidade')
        if modalidade:
            queryset = queryset.filter(modalidade=modalidade)
        
        # Filtro por emitente
        emitente_cnpj = self.request.query_params.get('emitente_cnpj')
        if emitente_cnpj:
            queryset = queryset.filter(emitente__cnpj=emitente_cnpj)
        
        # Filtro por remetente
        remetente_cnpj = self.request.query_params.get('remetente_cnpj')
        if remetente_cnpj:
            queryset = queryset.filter(remetente__cnpj=remetente_cnpj)
        
        # Filtro por destinatário
        destinatario_cnpj = self.request.query_params.get('destinatario_cnpj')
        if destinatario_cnpj:
            queryset = queryset.filter(destinatario__cnpj=destinatario_cnpj)
        
        # Filtro por origem (UF_ini)
        # Filtro por origem (UF_ini)
        uf_ini = self.request.query_params.get('uf_ini')
        if uf_ini:
            queryset = queryset.filter(identificacao__uf_ini=uf_ini)
        
        # Filtro por destino (UF_fim)
        uf_fim = self.request.query_params.get('uf_fim')
        if uf_fim:
            queryset = queryset.filter(identificacao__uf_fim=uf_fim)
        
        # Filtro por placa
        placa = self.request.query_params.get('placa')
        if placa:
            queryset = queryset.filter(modal_rodoviario__veiculos__placa=placa)
        
        # Filtro por status de processamento
        processado = self.request.query_params.get('processado')
        if processado is not None:
            queryset = queryset.filter(processado=processado.lower() == 'true')
        
        # Filtro por status de autorização
        autorizado = self.request.query_params.get('autorizado')
        if autorizado is not None:
            if autorizado.lower() == 'true':
                queryset = queryset.filter(protocolo__codigo_status=100)
            else:
                queryset = queryset.filter(Q(protocolo__isnull=True) | ~Q(protocolo__codigo_status=100))
        
        # Filtro por status de cancelamento
        cancelado = self.request.query_params.get('cancelado')
        if cancelado is not None:
            if cancelado.lower() == 'true':
                queryset = queryset.filter(cancelamento__isnull=False, cancelamento__c_stat=135)
            else:
                queryset = queryset.filter(Q(cancelamento__isnull=True) | ~Q(cancelamento__c_stat=135))
        
        # Filtro por texto (pesquisa por chave, nomes, etc.)
        texto = self.request.query_params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(chave__icontains=texto) |
                Q(identificacao__numero__icontains=texto) |
                Q(remetente__razao_social__icontains=texto) |
                Q(destinatario__razao_social__icontains=texto)
            )
        
        return queryset.distinct()
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os CT-es filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"ctes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, self.get_serializer_class(), filename)
    
    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        """Endpoint para baixar o XML do CT-e."""
        cte = self.get_object()
        
        # Verifica se o XML existe
        if not cte.xml_original:
            return Response({"error": "XML não disponível para este CT-e"}, status=status.HTTP_404_NOT_FOUND)
        
        response = HttpResponse(cte.xml_original, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename="CTe_{cte.chave}.xml"'
        return response
    
    @action(detail=True, methods=['get'])
    def dacte(self, request, pk=None):
        """Endpoint para gerar o DACTE (PDF) do CT-e."""
        cte = self.get_object()
        
        # Verifica se o CT-e está autorizado
        if not hasattr(cte, 'protocolo') or not cte.protocolo or cte.protocolo.codigo_status != 100:
            return Response({"error": "DACTE disponível apenas para CT-e autorizado"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Implementação básica - retorna JSON com os dados
        # Em produção, aqui geraria o PDF com uma biblioteca como ReportLab
        data = {
            "chave": cte.chave,
            "numero": cte.identificacao.numero if hasattr(cte, 'identificacao') else None,
            "serie": cte.identificacao.serie if hasattr(cte, 'identificacao') else None,
            "data_emissao": cte.identificacao.data_emissao.strftime('%d/%m/%Y %H:%M') 
                if hasattr(cte, 'identificacao') and cte.identificacao.data_emissao else None,
            "remetente": cte.remetente.razao_social if hasattr(cte, 'remetente') else None,
            "destinatario": cte.destinatario.razao_social if hasattr(cte, 'destinatario') else None,
            "valor_total": float(cte.prestacao.valor_total_prestado) if hasattr(cte, 'prestacao') else None,
            "protocolo": cte.protocolo.numero_protocolo if hasattr(cte, 'protocolo') else None,
            "modalidade": cte.modalidade,
        }
        
        # Temporary JSON response - would be PDF in production
        return Response({
            "message": "Funcionalidade de geração de DACTE em implementação",
            "data": data
        })
    
    @action(detail=True, methods=['post'])
    def reprocessar(self, request, pk=None):
        """Endpoint para reprocessar um CT-e."""
        cte = self.get_object()
        
        # Verifica se o XML existe
        if not cte.xml_original:
            return Response({"error": "XML não disponível para reprocessamento"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Marca como não processado e salva para forçar reprocessamento
        cte.processado = False
        cte.save()
        
        try:
            # Reprocessa o CT-e
            parse_cte_completo(cte)
            return Response({"message": "CT-e reprocessado com sucesso"})
        except Exception as e:
            return Response({"error": f"Erro ao reprocessar CT-e: {str(e)}"}, 
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ===============================================================
# ==> APIS PARA MDF-e
# ===============================================================

class MDFeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """API para consulta de MDF-es."""
    queryset = MDFeDocumento.objects.all().order_by('-data_upload')
    serializer_class = MDFeDocumentoListSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return MDFeDocumentoDetailSerializer
        return MDFeDocumentoListSerializer
    
    def get_queryset(self):
        """Permite filtrar os MDF-es por diversos parâmetros."""
        queryset = super().get_queryset()
        
        # Filtro por período
        data_inicio = self.request.query_params.get('data_inicio')
        data_fim = self.request.query_params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(identificacao__dh_emi__gte=data_inicio)
        if data_fim:
            # Adiciona 1 dia para incluir todo o dia final
            from datetime import datetime, timedelta
            data_fim_obj = datetime.strptime(data_fim, '%Y-%m-%d') + timedelta(days=1)
            queryset = queryset.filter(identificacao__dh_emi__lt=data_fim_obj)
        
        # Filtro por emitente
        emitente_cnpj = self.request.query_params.get('emitente_cnpj')
        if emitente_cnpj:
            queryset = queryset.filter(emitente__cnpj=emitente_cnpj)
        
        # Filtro por origem (UF_ini)
        uf_ini = self.request.query_params.get('uf_ini')
        if uf_ini:
            queryset = queryset.filter(identificacao__uf_ini=uf_ini)
        
        # Filtro por destino (UF_fim)
        uf_fim = self.request.query_params.get('uf_fim')
        if uf_fim:
            queryset = queryset.filter(identificacao__uf_fim=uf_fim)
        
        # Filtro por placa
        placa = self.request.query_params.get('placa')
        if placa:
            queryset = queryset.filter(
                Q(modal_rodoviario__veiculo_tracao__placa=placa) | 
                Q(modal_rodoviario__veiculos_reboque__placa=placa)
            ).distinct()
        
        # Filtro por status de processamento
        processado = self.request.query_params.get('processado')
        if processado is not None:
            queryset = queryset.filter(processado=processado.lower() == 'true')
        
        # Filtro por status de autorização
        autorizado = self.request.query_params.get('autorizado')
        if autorizado is not None:
            if autorizado.lower() == 'true':
                queryset = queryset.filter(protocolo__codigo_status=100)
            else:
                queryset = queryset.filter(Q(protocolo__isnull=True) | ~Q(protocolo__codigo_status=100))
        
        # Filtro por status de cancelamento
        cancelado = self.request.query_params.get('cancelado')
        if cancelado is not None:
            if cancelado.lower() == 'true':
                queryset = queryset.filter(cancelamento__isnull=False, cancelamento__c_stat=135)
            else:
                queryset = queryset.filter(Q(cancelamento__isnull=True) | ~Q(cancelamento__c_stat=135))
        
        # Filtro por status de encerramento
        encerrado = self.request.query_params.get('encerrado')
        if encerrado is not None:
            queryset = queryset.filter(encerrado=encerrado.lower() == 'true')
        
        # Filtro por texto (pesquisa por chave, etc.)
        texto = self.request.query_params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(chave__icontains=texto) |
                Q(identificacao__n_mdf__icontains=texto) |
                Q(modal_rodoviario__veiculo_tracao__placa__icontains=texto)
            )
        
        return queryset.distinct()
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os MDF-es filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"mdfes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, self.get_serializer_class(), filename)
    
    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        """Endpoint para baixar o XML do MDF-e."""
        mdfe = self.get_object()
        
        # Verifica se o XML existe
        if not mdfe.xml_original:
            return Response({"error": "XML não disponível para este MDF-e"}, status=status.HTTP_404_NOT_FOUND)
        
        response = HttpResponse(mdfe.xml_original, content_type='application/xml')
        response['Content-Disposition'] = f'attachment; filename="MDFe_{mdfe.chave}.xml"'
        return response
    
    @action(detail=True, methods=['get'])
    def damdfe(self, request, pk=None):
        """Endpoint para gerar o DAMDFE (PDF) do MDF-e."""
        mdfe = self.get_object()
        
        # Verifica se o MDF-e está autorizado
        if not hasattr(mdfe, 'protocolo') or not mdfe.protocolo or mdfe.protocolo.codigo_status != 100:
            return Response({"error": "DAMDFE disponível apenas para MDF-e autorizado"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Implementação básica - retorna JSON com os dados
        # Em produção, aqui geraria o PDF com uma biblioteca como ReportLab
        data = {
            "chave": mdfe.chave,
            "numero": mdfe.identificacao.n_mdf if hasattr(mdfe, 'identificacao') else None,
            "serie": mdfe.identificacao.serie if hasattr(mdfe, 'identificacao') else None,
            "data_emissao": mdfe.identificacao.dh_emi.strftime('%d/%m/%Y %H:%M') 
                if hasattr(mdfe, 'identificacao') and mdfe.identificacao.dh_emi else None,
            "uf_inicio": mdfe.identificacao.uf_ini if hasattr(mdfe, 'identificacao') else None,
            "uf_fim": mdfe.identificacao.uf_fim if hasattr(mdfe, 'identificacao') else None,
            "placa": mdfe.modal_rodoviario.veiculo_tracao.placa 
                if hasattr(mdfe, 'modal_rodoviario') and hasattr(mdfe.modal_rodoviario, 'veiculo_tracao') else None,
            "protocolo": mdfe.protocolo.numero_protocolo if hasattr(mdfe, 'protocolo') else None,
            "encerrado": mdfe.encerrado,
        }
        
        # Temporary JSON response - would be PDF in production
        return Response({
            "message": "Funcionalidade de geração de DAMDFE em implementação",
            "data": data
        })
    
    @action(detail=True, methods=['post'])
    def reprocessar(self, request, pk=None):
        """Endpoint para reprocessar um MDF-e."""
        mdfe = self.get_object()
        
        # Verifica se o XML existe
        if not mdfe.xml_original:
            return Response({"error": "XML não disponível para reprocessamento"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Marca como não processado e salva para forçar reprocessamento
        mdfe.processado = False
        mdfe.save()
        
        try:
            # Reprocessa o MDF-e
            parse_mdfe_completo(mdfe)
            return Response({"message": "MDF-e reprocessado com sucesso"})
        except Exception as e:
            return Response({"error": f"Erro ao reprocessar MDF-e: {str(e)}"}, 
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'])
    def documentos(self, request, pk=None):
        """Endpoint para listar documentos vinculados ao MDF-e."""
        mdfe = self.get_object()
        
        # Obtém os documentos vinculados
        docs = MDFeDocumentosVinculados.objects.filter(mdfe=mdfe).select_related('municipio_descarga', 'cte_relacionado')
        
        # Prepara a resposta
        resultados = []
        
        for doc in docs:
            # Determina o tipo de documento pela chave (posições 20-21)
            tipo_doc = "Desconhecido"
            try:
                modelo = doc.chave_documento[20:22]
                if modelo == '57': tipo_doc = 'CT-e'
                elif modelo == '55': tipo_doc = 'NF-e'
                elif modelo == '67': tipo_doc = 'CT-e OS'
            except: pass
            
            # Prepara dados do documento
            item = {
                'id': doc.id,
                'chave': doc.chave_documento,
                'tipo': tipo_doc,
                'municipio': {
                    'codigo': doc.municipio_descarga.c_mun_descarga,
                    'nome': doc.municipio_descarga.x_mun_descarga
                } if doc.municipio_descarga else None
            }
            
            # Adiciona dados do CT-e relacionado se existir
            if doc.cte_relacionado:
                cte = doc.cte_relacionado
                item['cte'] = {
                    'id': str(cte.id),
                    'emitente': cte.emitente.razao_social if hasattr(cte, 'emitente') else None,
                    'remetente': cte.remetente.razao_social if hasattr(cte, 'remetente') else None,
                    'destinatario': cte.destinatario.razao_social if hasattr(cte, 'destinatario') else None,
                    'valor': float(cte.prestacao.valor_total_prestado) if hasattr(cte, 'prestacao') else None
                }
            
            resultados.append(item)
        
        return Response(resultados)


# ===============================================================
# ==> APIS PARA VEÍCULOS E MANUTENÇÕES
# ===============================================================

class VeiculoViewSet(viewsets.ModelViewSet):
    """API para CRUD de Veículos."""
    queryset = Veiculo.objects.all().order_by('placa')
    serializer_class = VeiculoSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Permite filtrar veículos por diversos parâmetros."""
        queryset = super().get_queryset()
        
        # Filtro por ativo/inativo
        ativo = self.request.query_params.get('ativo')
        if ativo is not None:
            queryset = queryset.filter(ativo=ativo.lower() == 'true')
        
        # Filtro por proprietário
        tipo_proprietario = self.request.query_params.get('tipo_proprietario')
        if tipo_proprietario:
            queryset = queryset.filter(tipo_proprietario=tipo_proprietario)
        
        # Filtro por UF
        uf = self.request.query_params.get('uf')
        if uf:
            queryset = queryset.filter(uf_proprietario=uf)
        
        # Filtro por texto (placa, renavam, nome proprietário)
        texto = self.request.query_params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(placa__icontains=texto) |
                Q(renavam__icontains=texto) |
                Q(proprietario_nome__icontains=texto) |
                Q(proprietario_cnpj__icontains=texto) |
                Q(proprietario_cpf__icontains=texto) |
                Q(rntrc_proprietario__icontains=texto)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os veículos filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"veiculos_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, self.get_serializer_class(), filename)
    
    @action(detail=True, methods=['get'])
    def estatisticas(self, request, pk=None):
        """Endpoint para obter estatísticas do veículo."""
        veiculo = self.get_object()
        
        # Calcular estatísticas de manutenção
        manutencoes = veiculo.manutencoes.all()
        total_manutencoes = manutencoes.count()
        
        # Soma de gastos
        total_pecas = manutencoes.aggregate(t=Sum('valor_peca'))['t'] or Decimal('0.00')
        total_mao_obra = manutencoes.aggregate(t=Sum('valor_mao_obra'))['t'] or Decimal('0.00')
        total_gastos = manutencoes.aggregate(t=Sum('valor_total'))['t'] or Decimal('0.00')
        
        # Estatísticas por status
        stats_por_status = manutencoes.values('status').annotate(
            total=Count('id'),
            valor=Sum('valor_total')
        )
        
        # Vincular com documentos
        total_ctes = CTeDocumento.objects.filter(
            modal_rodoviario__veiculos__placa=veiculo.placa,
            protocolo__codigo_status=100
        ).exclude(cancelamento__c_stat=135).count()
        
        total_mdfes = MDFeDocumento.objects.filter(
            Q(modal_rodoviario__veiculo_tracao__placa=veiculo.placa) | 
            Q(modal_rodoviario__veiculos_reboque__placa=veiculo.placa),
            protocolo__codigo_status=100
        ).exclude(cancelamento__c_stat=135).count()
        
        return Response({
            'veiculo': {
                'placa': veiculo.placa,
                'proprietario': veiculo.proprietario_nome,
                'tipo': veiculo.tipo_proprietario,
                'ativo': veiculo.ativo
            },
            'manutencoes': {
                'total': total_manutencoes,
                'valor_pecas': float(total_pecas),
                'valor_mao_obra': float(total_mao_obra),
                'valor_total': float(total_gastos),
                'por_status': list(stats_por_status)
            },
            'documentos': {
                'total_ctes': total_ctes,
                'total_mdfes': total_mdfes,
            }
        })


class ManutencaoVeiculoViewSet(viewsets.ModelViewSet):
    """API para CRUD de Manutenções de Veículos."""
    queryset = ManutencaoVeiculo.objects.all().order_by('-data_servico')
    serializer_class = ManutencaoVeiculoSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Permite filtrar manutenções por diversos parâmetros."""
        queryset = super().get_queryset()
        
        # Se for uma nested route, filtra pelo veículo
        veiculo_pk = self.kwargs.get('veiculo_pk')
        if veiculo_pk:
            queryset = queryset.filter(veiculo_id=veiculo_pk)
        
        # Filtro por veículo
        veiculo_id = self.request.query_params.get('veiculo')
        if veiculo_id:
            queryset = queryset.filter(veiculo_id=veiculo_id)
        
        # Filtro por placa do veículo
        placa = self.request.query_params.get('placa')
        if placa:
            queryset = queryset.filter(veiculo__placa=placa)
        
        # Filtro por status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filtro por período
        data_inicio = self.request.query_params.get('data_inicio')
        data_fim = self.request.query_params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(data_servico__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_servico__lte=data_fim)
        
        # Filtro por texto (serviço, oficina, etc.)
        texto = self.request.query_params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(servico_realizado__icontains=texto) |
                Q(oficina__icontains=texto) |
                Q(observacoes__icontains=texto) |
                Q(nota_fiscal__icontains=texto)
            )
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta as manutenções filtradas para CSV."""
        queryset = self.get_queryset()
        filename = f"manutencoes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, self.get_serializer_class(), filename)


class ManutencaoPainelViewSet(viewsets.ViewSet):
    """ViewSet para o painel de indicadores de manutenção."""
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def indicadores(self, request):
        """Retorna indicadores gerais de manutenção."""
        # Filtros opcionais
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Query base
        queryset = ManutencaoVeiculo.objects.all()
        
        # Aplicar filtros
        if data_inicio:
            queryset = queryset.filter(data_servico__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_servico__lte=data_fim)
        
        # Calcular indicadores
        total_manutencoes = queryset.count()
        total_pecas = queryset.aggregate(t=Sum('valor_peca'))['t'] or Decimal('0.00')
        total_mao_obra = queryset.aggregate(t=Sum('valor_mao_obra'))['t'] or Decimal('0.00')
        total_geral = queryset.aggregate(t=Sum('valor_total'))['t'] or Decimal('0.00')
        
        return Response({
            'total_manutencoes': total_manutencoes,
            'total_pecas': float(total_pecas),
            'total_mao_obra': float(total_mao_obra),
            'valor_total': float(total_geral),
            'filtros': {
                'data_inicio': data_inicio,
                'data_fim': data_fim
            }
        })
    
    @action(detail=False, methods=['get'])
    def graficos(self, request):
        """Retorna dados para gráficos de manutenção."""
        # Filtros opcionais
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Query base
        queryset = ManutencaoVeiculo.objects.all()
        
        # Aplicar filtros
        if data_inicio:
            queryset = queryset.filter(data_servico__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_servico__lte=data_fim)
        
        # Dados por status
        por_status = list(queryset.values('status').annotate(
            total=Count('id'),
            valor=Sum('valor_total')
        ).order_by('status'))
        
        # Dados por veículo (top 10)
        por_veiculo = list(queryset.values('veiculo__placa').annotate(
            total=Count('id'),
            valor=Sum('valor_total')
        ).order_by('-valor')[:10])
        
        # Dados por período (mês)
        por_periodo = list(queryset.annotate(
            mes=TruncMonth('data_servico')
        ).values('mes').annotate(
            total=Count('id'),
            valor=Sum('valor_total')
        ).order_by('mes'))
        
        # Formatar datas para meses legíveis
        for item in por_periodo:
            if item['mes']:
                item['mes_formatado'] = item['mes'].strftime('%m/%Y')
                item['mes'] = item['mes'].strftime('%Y-%m-01')  # ISO format
        
        return Response({
            'por_status': por_status,
            'por_veiculo': por_veiculo,
            'por_periodo': por_periodo,
            'filtros': {
                'data_inicio': data_inicio,
                'data_fim': data_fim
            }
        })
    
    @action(detail=False, methods=['get'])
    def ultimos(self, request):
        """Retorna as últimas manutenções registradas."""
        # Limitar quantidade
        limit = int(request.query_params.get('limit', 10))
        
        # Últimas manutenções
        ultimos = ManutencaoVeiculo.objects.all().order_by('-data_servico')[:limit]
        serializer = ManutencaoVeiculoSerializer(ultimos, many=True)
        
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def tendencias(self, request):
        """Retorna tendências de manutenção."""
        # Período para análise de tendência (últimos 12 meses por padrão)
        meses = int(request.query_params.get('meses', 12))
        data_limite = datetime.now() - timedelta(days=30*meses)
        
        # Cálculo de tendência simples (comparação período atual vs anterior)
        periodo_atual = ManutencaoVeiculo.objects.filter(
            data_servico__gte=datetime.now() - timedelta(days=30*meses/2)
        )
        periodo_anterior = ManutencaoVeiculo.objects.filter(
            data_servico__gte=data_limite,
            data_servico__lt=datetime.now() - timedelta(days=30*meses/2)
        )
        
        valor_atual = periodo_atual.aggregate(t=Sum('valor_total'))['t'] or Decimal('0.00')
        valor_anterior = periodo_anterior.aggregate(t=Sum('valor_total'))['t'] or Decimal('0.00')
        
        # Prevenção de divisão por zero
        if valor_anterior > 0:
            variacao_percentual = (valor_atual / valor_anterior - 1) * 100
        else:
            variacao_percentual = 100 if valor_atual > 0 else 0
        
        # Frequência de manutenção por veículo
        frequencia_por_veiculo = []
        veiculos = Veiculo.objects.filter(ativo=True)
        
        for veiculo in veiculos:
            manutencoes = ManutencaoVeiculo.objects.filter(
                veiculo=veiculo,
                data_servico__gte=data_limite
            ).order_by('data_servico')
            
            if manutencoes.count() > 1:
                # Calcular média de dias entre manutenções
                datas = list(manutencoes.values_list('data_servico', flat=True))
                intervalos = []
                
                for i in range(1, len(datas)):
                    delta = (datas[i] - datas[i-1]).days
                    if delta > 0:  # Evitar manutenções no mesmo dia
                        intervalos.append(delta)
                
                intervalo_medio = sum(intervalos) / len(intervalos) if intervalos else 0
                
                frequencia_por_veiculo.append({
                    'placa': veiculo.placa,
                    'qtd_manutencoes': manutencoes.count(),
                    'intervalo_medio_dias': intervalo_medio,
                    'ultima_manutencao': datas[-1].strftime('%d/%m/%Y') if datas else None,
                })
        
        return Response({
            'valor_atual': float(valor_atual),
            'valor_anterior': float(valor_anterior),
            'variacao_percentual': float(variacao_percentual),
            'frequencia_por_veiculo': frequencia_por_veiculo
        })


# ===============================================================
# ==> APIS PARA PAGAMENTOS
# ===============================================================

class FaixaKMViewSet(viewsets.ModelViewSet):
    """API para CRUD de Faixas de KM para pagamento."""
    queryset = FaixaKM.objects.all().order_by('min_km')
    serializer_class = FaixaKMSerializer
    permission_classes = [IsAuthenticated]
    
    def perform_create(self, serializer):
        """Validação adicional antes de salvar."""
        min_km = serializer.validated_data.get('min_km')
        max_km = serializer.validated_data.get('max_km')
        
        # Verifica se min_km < max_km quando max_km é fornecido
        if max_km is not None and min_km >= max_km:
            raise serializers.ValidationError({'max_km': 'O KM máximo deve ser maior que o KM mínimo.'})
        
        # Verifica sobreposições
        sobreposicao = False
        
        # Caso 1: min_km está dentro de outra faixa
        if FaixaKM.objects.exclude(pk=serializer.instance.pk if serializer.instance else None).filter(
            Q(min_km__lte=min_km, max_km__gte=min_km) |  # min_km dentro de outra faixa
            Q(min_km__lte=max_km, max_km__gte=max_km) |  # max_km dentro de outra faixa
            Q(min_km__gte=min_km, max_km__lte=max_km) |  # outra faixa contida nesta
            Q(min_km__lte=min_km, max_km__isnull=True)   # outra faixa sem limite superior inclui min_km
        ).exists():
            sobreposicao = True
        
        if sobreposicao:
            raise serializers.ValidationError({'min_km': 'Existe sobreposição com outra faixa de KM.'})
        
        serializer.save()


class PagamentoAgregadoViewSet(viewsets.ModelViewSet):
    """API para gerenciar pagamentos a motoristas agregados."""
    queryset = PagamentoAgregado.objects.all().order_by('-data_prevista')
    serializer_class = PagamentoAgregadoSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Permite filtrar pagamentos por diversos parâmetros."""
        queryset = super().get_queryset()
        
        # Filtro por status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filtro por placa
        placa = self.request.query_params.get('placa')
        if placa:
            queryset = queryset.filter(placa=placa)
        
        # Filtro por período (data_prevista)
        data_inicio = self.request.query_params.get('data_inicio')
        data_fim = self.request.query_params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(data_prevista__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_prevista__lte=data_fim)
        
        # Filtro por condutor
        condutor_cpf = self.request.query_params.get('condutor_cpf')
        if condutor_cpf:
            queryset = queryset.filter(condutor_cpf=condutor_cpf)
        
        # Filtro por texto (nome do condutor)
        texto = self.request.query_params.get('q')
        if texto:
            queryset = queryset.filter(condutor_nome__icontains=texto)
        
        return queryset
    
    @action(detail=False, methods=['post'])
    def gerar(self, request):
        """
        Endpoint para gerar registros de pagamentos agregados em lote.
        Parâmetros:
        - data_inicio: Data inicial para filtrar CT-es
        - data_fim: Data final para filtrar CT-es
        - percentual: Percentual de repasse (opcional, padrão: 25%)
        - data_prevista: Data prevista para pagamento (opcional, padrão: hoje)
        """
        data_inicio = request.data.get('data_inicio')
        data_fim = request.data.get('data_fim')
        percentual = request.data.get('percentual', 25.0)
        data_prevista = request.data.get('data_prevista', date.today().isoformat())
        
        if not data_inicio or not data_fim:
            return Response({"error": "Parâmetros data_inicio e data_fim são obrigatórios"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        try:
            percentual = Decimal(str(percentual))
            assert 0 < percentual <= 100
        except:
            return Response({"error": "Percentual inválido"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Buscar CT-es com veículos agregados sem pagamento
        from django.db.models import OuterRef, Exists
        ctes_sem_pagamento = CTeDocumento.objects.filter(
            Q(identificacao__data_emissao__gte=data_inicio) &
            Q(identificacao__data_emissao__lte=data_fim) &
            Q(processado=True) &
            Q(protocolo__codigo_status=100) &
            ~Q(cancelamento__c_stat=135) &
            Q(modal_rodoviario__veiculos__tipo_proprietario='02') &
            ~Exists(PagamentoAgregado.objects.filter(cte=OuterRef('pk')))
        ).select_related(
            'modal_rodoviario', 'prestacao', 'identificacao'
        ).prefetch_related(
            'modal_rodoviario__veiculos', 'modal_rodoviario__motoristas'
        )
        
        # Processar CT-es
        contador = {'criados': 0, 'erros': 0}
        erros = []
        
        for cte in ctes_sem_pagamento:
            try:
                # Verificar se CT-e tem prestação
                if not hasattr(cte, 'prestacao') or not cte.prestacao:
                    raise ValueError("Sem dados de prestação")
                
                # Verificar se CT-e tem veículo
                if not hasattr(cte, 'modal_rodoviario') or not cte.modal_rodoviario or not cte.modal_rodoviario.veiculos.exists():
                    raise ValueError("Sem dados de veículo")
                
                # Buscar veículo agregado
                veiculo = next((v for v in cte.modal_rodoviario.veiculos.all() if v.tipo_proprietario == '02'), None)
                if not veiculo:
                    raise ValueError("Nenhum veículo agregado encontrado")
                
                # Buscar motorista (opcional)
                motorista_nome = None
                motorista_cpf = None
                if hasattr(cte.modal_rodoviario, 'motoristas') and cte.modal_rodoviario.motoristas.exists():
                    motorista = cte.modal_rodoviario.motoristas.first()
                    motorista_nome = motorista.nome
                    motorista_cpf = motorista.cpf
                
                # Criar pagamento
                PagamentoAgregado.objects.create(
                    cte=cte,
                    placa=veiculo.placa,
                    condutor_nome=motorista_nome or veiculo.prop_razao_social or "Motorista Agregado",
                    condutor_cpf=motorista_cpf,
                    valor_frete_total=cte.prestacao.valor_total_prestado,
                    percentual_repasse=percentual,
                    data_prevista=data_prevista,
                    status='pendente'
                )
                contador['criados'] += 1
            except Exception as e:
                erros.append(f"CT-e {cte.chave}: {str(e)}")
                contador['erros'] += 1
        
        return Response({
            "status": "sucesso" if contador['criados'] > 0 else "alerta",
            "message": f"Processamento concluído: {contador['criados']} pagamentos criados, {contador['erros']} erros",
            "criados": contador['criados'],
            "erros": contador['erros'],
            "detalhes_erros": erros
        })
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os pagamentos agregados filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"pagamentos_agregados_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, self.get_serializer_class(), filename)


class PagamentoProprioViewSet(viewsets.ModelViewSet):
    """API para gerenciar pagamentos a motoristas próprios."""
    queryset = PagamentoProprio.objects.all().order_by('-periodo')
    serializer_class = PagamentoProprioSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Permite filtrar pagamentos por diversos parâmetros."""
        queryset = super().get_queryset()
        
        # Filtro por status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filtro por veículo
        veiculo_id = self.request.query_params.get('veiculo')
        if veiculo_id:
            queryset = queryset.filter(veiculo_id=veiculo_id)
        
        # Filtro por placa
        placa = self.request.query_params.get('placa')
        if placa:
            queryset = queryset.filter(veiculo__placa=placa)
        
        # Filtro por período
        periodo = self.request.query_params.get('periodo')
        if periodo:
            queryset = queryset.filter(periodo=periodo)
        
        return queryset
    
    def _calcular_km_periodo(self, veiculo, periodo_str):
        """
        Calcula o KM rodado para um veículo em um período.
        Esta é uma implementação simplificada que soma distâncias dos CT-es.
        """
        try:
            # Tenta parsear período AAAA-MM
            ano, mes = map(int, periodo_str.split('-')[:2])
            data_inicio = date(ano, mes, 1)
            if mes == 12:
                data_fim = date(ano, 12, 31)
            else:
                data_fim = date(ano, mes + 1, 1) - timedelta(days=1)

            # Soma dist_km dos CT-es do veículo no período
            km_total = CTeDocumento.objects.filter(
                modal_rodoviario__veiculos__placa=veiculo.placa,
                identificacao__data_emissao__date__gte=data_inicio,
                identificacao__data_emissao__date__lte=data_fim,
                processado=True,
                protocolo__codigo_status=100
            ).exclude(cancelamento__c_stat=135).aggregate(
                total_km=Coalesce(Sum('identificacao__dist_km'), 0)
            )['total_km']

            return km_total if km_total is not None else 0
        except Exception as e:
            print(f"Erro ao calcular KM para {veiculo.placa} no período {periodo_str}: {e}")
            return 0  # Retorna 0 em caso de erro
    
    @action(detail=False, methods=['post'])
    def calcular_km(self, request):
        """
        Endpoint para calcular a quantidade de KM rodados em um período.
        Retorna o valor base a ser pago de acordo com as faixas cadastradas.
        Parâmetros:
        - veiculo_id: ID do veículo
        - periodo: Período no formato AAAA-MM ou AAAA-MM-XQ
        - km_total: (Opcional) Quantidade de KM informada manualmente
        """
        veiculo_id = request.data.get('veiculo_id')
        periodo = request.data.get('periodo')
        km_manual = request.data.get('km_total')

        if not veiculo_id or not periodo:
            return Response({"error": "Parâmetros veiculo_id e periodo são obrigatórios"},
                           status=status.HTTP_400_BAD_REQUEST)

        try:
            veiculo = Veiculo.objects.get(pk=veiculo_id)
        except Veiculo.DoesNotExist:
            return Response({"error": "Veículo não encontrado"}, status=status.HTTP_404_NOT_FOUND)

        km_total = 0
        fonte_km = "Não calculado"

        # Se km foi informado manualmente, usar esse valor
        if km_manual is not None:
            try:
                km_total = int(km_manual)
                if km_total < 0:
                    return Response({"error": "Valor de KM deve ser positivo"},
                                   status=status.HTTP_400_BAD_REQUEST)
                fonte_km = "Manual"
            except (ValueError, TypeError):
                return Response({"error": "Valor de KM inválido"}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Cálculo automático de KM
            km_total = self._calcular_km_periodo(veiculo, periodo)
            fonte_km = "Automático (baseado nos CT-es)"

        # Buscar faixa correspondente ao km_total
        try:
            faixa = FaixaKM.objects.filter(
                Q(min_km__lte=km_total) &
                (Q(max_km__gte=km_total) | Q(max_km__isnull=True))
            ).order_by('-min_km').first()

            if not faixa:
                faixa = FaixaKM.objects.all().order_by('-min_km').first()
                if not faixa:
                    return Response({"error": "Nenhuma faixa de KM cadastrada"},
                                   status=status.HTTP_400_BAD_REQUEST)

            valor_base = faixa.valor_pago

            return Response({
                "km_total": km_total,
                "fonte_km": fonte_km,
                "veiculo": {"id": str(veiculo.id), "placa": veiculo.placa},
                "periodo": periodo,
                "faixa_aplicada": {"id": faixa.id, "min_km": faixa.min_km, "max_km": faixa.max_km, "valor": float(faixa.valor_pago)},
                "valor_base": float(valor_base)
            })

        except Exception as e:
            return Response({"error": f"Erro ao calcular valor base: {str(e)}"},
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def gerar(self, request):
        """
        Endpoint para gerar registros de pagamentos em lote.
        Parâmetros:
        - periodo: Período no formato AAAA-MM ou AAAA-MM-XQ
        - veiculos: Lista de IDs de veículos ou "todos" para todos veículos próprios
        - km_padrao: KM padrão a considerar (opcional, sobrescreve cálculo)
        """
        periodo = request.data.get('periodo')
        veiculos_param = request.data.get('veiculos', 'todos')
        km_padrao = request.data.get('km_padrao')

        if not periodo:
            return Response({"error": "Parâmetro periodo é obrigatório"},
                           status=status.HTTP_400_BAD_REQUEST)

        # Validação de formato do período
        if not re.match(r'^\d{4}-\d{2}(-[12]Q)?$', periodo):
            return Response({"error": "Formato de período inválido. Use AAAA-MM ou AAAA-MM-1Q/2Q."},
                           status=status.HTTP_400_BAD_REQUEST)

        # Obter veículos
        if veiculos_param == 'todos':
            veiculos = Veiculo.objects.filter(tipo_proprietario='00', ativo=True)
        else:
            try:
                if isinstance(veiculos_param, list):
                    veiculos = Veiculo.objects.filter(id__in=veiculos_param, ativo=True)
                else:
                    return Response({"error": "Parâmetro veiculos deve ser 'todos' ou lista de IDs"},
                                   status=status.HTTP_400_BAD_REQUEST)
            except:
                return Response({"error": "Formato inválido para parâmetro veiculos"},
                               status=status.HTTP_400_BAD_REQUEST)

        if not veiculos.exists():
            return Response({"error": "Nenhum veículo encontrado"},
                           status=status.HTTP_404_NOT_FOUND)

        # Validar km_padrao
        if km_padrao is not None:
            try:
                km_padrao = int(km_padrao)
                if km_padrao < 0:
                    raise ValueError("KM deve ser positivo")
            except (ValueError, TypeError):
                return Response({"error": "Valor de km_padrao inválido"},
                               status=status.HTTP_400_BAD_REQUEST)

        resultados = {'criados': 0, 'ignorados': 0, 'erros': 0, 'detalhes': []}

        for veiculo in veiculos:
            if PagamentoProprio.objects.filter(veiculo=veiculo, periodo=periodo).exists():
                resultados['ignorados'] += 1
                resultados['detalhes'].append({'veiculo': veiculo.placa, 'status': 'ignorado', 'motivo': 'Pagamento já existe'})
                continue

            try:
                km_total = km_padrao
                if km_total is None:
                    km_total = self._calcular_km_periodo(veiculo, periodo)

                # Busca faixa de KM
                faixa = FaixaKM.objects.filter(
                    Q(min_km__lte=km_total) &
                    (Q(max_km__gte=km_total) | Q(max_km__isnull=True))
                ).order_by('-min_km').first() or FaixaKM.objects.all().order_by('-min_km').first()

                if not faixa:
                    raise ValueError("Nenhuma faixa de KM aplicável encontrada.")

                # Cria o pagamento
                PagamentoProprio.objects.create(
                    veiculo=veiculo,
                    periodo=periodo,
                    km_total_periodo=km_total,
                    valor_base_faixa=faixa.valor_pago,
                    ajustes=Decimal('0.00'),
                    status='pendente'
                )
                resultados['criados'] += 1
                resultados['detalhes'].append({'veiculo': veiculo.placa, 'status': 'criado', 'km_total': km_total, 'valor_base': float(faixa.valor_pago)})

            except Exception as e:
                resultados['erros'] += 1
                resultados['detalhes'].append({'veiculo': veiculo.placa, 'status': 'erro', 'motivo': str(e)})

        return Response({
            "message": f"Processamento concluído: {resultados['criados']} criados, {resultados['ignorados']} ignorados, {resultados['erros']} erros.",
            "resultados": resultados
        })
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os pagamentos próprios filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"pagamentos_proprios_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, self.get_serializer_class(), filename)


# ===============================================================
# ==> APIS PARA DASHBOARDS e RELATÓRIOS
# ===============================================================

class DashboardGeralAPIView(APIView):
    """
    API para obter dados consolidados para o dashboard.
    (Versão AJUSTADA para corrigir erro FieldError: Mixed Types)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        """Retorna dados consolidados para o dashboard geral."""
        # Obter parâmetros de filtro
        periodo = request.query_params.get('periodo', 'mes') # Padrão 'mes'
        data_inicio_str = request.query_params.get('data_inicio')
        data_fim_str = request.query_params.get('data_fim')

        # Definir período padrão se não informado
        if not data_inicio_str or not data_fim_str:
            hoje = date.today()
            if periodo == 'mes':
                data_inicio = date(hoje.year, hoje.month, 1)
                if hoje.month == 12: data_fim = date(hoje.year, 12, 31)
                else: data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1)
            elif periodo == 'trimestre':
                trimestre = ((hoje.month - 1) // 3) + 1
                data_inicio = date(hoje.year, ((trimestre - 1) * 3) + 1, 1)
                if trimestre == 4: data_fim = date(hoje.year, 12, 31)
                else: data_fim = date(hoje.year, trimestre * 3 + 1, 1) - timedelta(days=1)
            elif periodo == '7dias':
                data_fim = hoje
                data_inicio = hoje - timedelta(days=6)
            elif periodo == '30dias':
                 data_fim = hoje
                 data_inicio = hoje - timedelta(days=29)
            else: # ano ou padrão 'ano'
                periodo = 'ano' # Garante que periodo seja 'ano' se não for outro válido
                data_inicio = date(hoje.year, 1, 1)
                data_fim = date(hoje.year, 12, 31)
        else:
            # Converter strings para objetos date
            try:
                 data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                 data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                 return Response({"error": "Formato de data inválido. Use AAAA-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        # --- Definição de Valor Decimal Zero com output_field ---
        decimal_zero = Value(Decimal('0.00'), output_field=DecimalField())

        # --- Filtros ---
        filtro_periodo_cte = Q(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim
        )
        filtro_cte_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135) # Atenção: Verifique se cancelamento pode ser null

        filtro_periodo_mdfe = Q(
            identificacao__dh_emi__date__gte=data_inicio,
            identificacao__dh_emi__date__lte=data_fim
        )
        filtro_mdfe_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135) # Atenção: Verifique se cancelamento pode ser null

        # === Obter dados para cards ===
        ctes_validos_qs = CTeDocumento.objects.filter(filtro_periodo_cte & filtro_cte_valido)
        mdfes_validos_qs = MDFeDocumento.objects.filter(filtro_periodo_mdfe & filtro_mdfe_valido)

        total_ctes = ctes_validos_qs.count()
        total_mdfes = mdfes_validos_qs.count()

        # --- Agregações com Coalesce e output_field ---
        agregados = ctes_validos_qs.aggregate(
            total_fretes=Coalesce(Sum('prestacao__valor_total_prestado', output_field=DecimalField()), decimal_zero),
            total_cif=Coalesce(Sum(Case(When(modalidade='CIF', then=F('prestacao__valor_total_prestado')), default=decimal_zero), output_field=DecimalField()), decimal_zero),
            total_fob=Coalesce(Sum(Case(When(modalidade='FOB', then=F('prestacao__valor_total_prestado')), default=decimal_zero), output_field=DecimalField()), decimal_zero)
        )
        valor_total_fretes = agregados['total_fretes']
        valor_cif = agregados['total_cif']
        valor_fob = agregados['total_fob']

        # === Dados para gráficos ===
        evolucao_mensal = []

        # --- CORREÇÃO: Definir intervalo com base nas datas calculadas ---
        if (data_fim - data_inicio) <= timedelta(days=60): # Ex: <= 2 meses, agrupa por dia
             intervalo = 'dia'
             trunc_func = TruncDate('identificacao__data_emissao')
             periodo_format_str = '%d/%m/%Y'
        else: # Agrupa por mês
             intervalo = 'mes'
             trunc_func = TruncMonth('identificacao__data_emissao')
             periodo_format_str = '%m/%Y'

        # --- Agrupamento com output_field explícito ---
        ctes_por_periodo = ctes_validos_qs.annotate(
            periodo=trunc_func
        ).values('periodo').annotate(
            total=Count('id'),
            # --- CORREÇÃO output_field ---
            valor_cif=Sum(Case(When(modalidade='CIF', then=F('prestacao__valor_total_prestado')), default=decimal_zero), output_field=DecimalField()),
            valor_fob=Sum(Case(When(modalidade='FOB', then=F('prestacao__valor_total_prestado')), default=decimal_zero), output_field=DecimalField())
        ).order_by('periodo')

        # Converter para formato esperado pelo frontend
        for item in ctes_por_periodo:
            v_cif = item['valor_cif'] or Decimal('0.00')
            v_fob = item['valor_fob'] or Decimal('0.00')
            evolucao_mensal.append({
                'data': item['periodo'].strftime(periodo_format_str),
                'cif': float(v_cif),
                'fob': float(v_fob),
                'total': float(v_cif + v_fob)
            })

        # === Últimos Lançamentos ===
        ultimos_ctes = CTeDocumento.objects.filter(
            processado=True
        ).select_related(
            'identificacao', 'remetente', 'destinatario', 'prestacao'
        ).order_by(
            '-identificacao__data_emissao'
        )[:5]

        ultimos_mdfes = MDFeDocumento.objects.filter(
             processado=True
         ).select_related(
             'identificacao', 'modal_rodoviario__veiculo_tracao'
         ).order_by(
             '-identificacao__dh_emi'
         )[:5]

        # === Dados para metas ===
        try:
            data_inicio_anterior = data_inicio.replace(year=data_inicio.year - 1)
            data_fim_anterior = data_fim.replace(year=data_fim.year - 1)
        except ValueError: # Trata caso de ano bissexto (29/02)
            data_inicio_anterior = data_inicio.replace(year=data_inicio.year - 1, day=28)
            data_fim_anterior = data_fim.replace(year=data_fim.year - 1, day=28)

        # --- Agregação com Coalesce e output_field ---
        valor_total_fretes_anterior = CTeDocumento.objects.filter(
            filtro_cte_valido,
            identificacao__data_emissao__date__gte=data_inicio_anterior,
            identificacao__data_emissao__date__lte=data_fim_anterior
        ).aggregate(
            total=Coalesce(Sum('prestacao__valor_total_prestado', output_field=DecimalField()), decimal_zero)
        )['total']

        # Calcular crescimento percentual
        crescimento_percentual = None
        if valor_total_fretes_anterior is not None and valor_total_fretes is not None:
            if valor_total_fretes_anterior > 0:
                crescimento_percentual = ((valor_total_fretes / valor_total_fretes_anterior) - 1) * 100
            elif valor_total_fretes > 0:
                 crescimento_percentual = Decimal('inf') # Crescimento infinito
            else:
                 crescimento_percentual = Decimal('0.0') # Nenhum crescimento

        # Compilar resposta final
        response_data = {
            'filtros': {
                'periodo': periodo,
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'cards': {
                'total_ctes': total_ctes,
                'total_mdfes': total_mdfes,
                'valor_total_fretes': float(valor_total_fretes),
                'valor_cif': float(valor_cif),
                'valor_fob': float(valor_fob)
            },
            'grafico_cif_fob': evolucao_mensal,
            'grafico_metas': [
                {
                    'label': f"Período {data_inicio.strftime('%d/%m/%Y')} a {data_fim.strftime('%d/%m/%Y')}",
                    'valor': float(valor_total_fretes),
                    'meta': float(valor_total_fretes * Decimal('1.1')), # Exemplo: meta 10% maior
                    'crescimento': float(crescimento_percentual) if crescimento_percentual is not None and crescimento_percentual.is_finite() else None
                }
            ],
            'ultimos_lancamentos': {
                 'ctes': [{
                     'id': str(cte.id),
                     'chave': cte.chave,
                     'numero': cte.identificacao.numero if hasattr(cte, 'identificacao') else None,
                     'data_emissao': cte.identificacao.data_emissao.strftime('%d/%m/%Y %H:%M') if hasattr(cte, 'identificacao') and cte.identificacao.data_emissao else None,
                     'remetente': cte.remetente.razao_social if hasattr(cte, 'remetente') else None,
                     'destinatario': cte.destinatario.razao_social if hasattr(cte, 'destinatario') else None,
                     'valor': float(cte.prestacao.valor_total_prestado) if hasattr(cte, 'prestacao') else None,
                     'modalidade': cte.modalidade
                 } for cte in ultimos_ctes],
                 'mdfes': [{
                     'id': str(mdfe.id),
                     'chave': mdfe.chave,
                     'numero': mdfe.identificacao.n_mdf if hasattr(mdfe, 'identificacao') else None,
                     'data_emissao': mdfe.identificacao.dh_emi.strftime('%d/%m/%Y %H:%M') if hasattr(mdfe, 'identificacao') and mdfe.identificacao.dh_emi else None,
                     'uf_ini': mdfe.identificacao.uf_ini if hasattr(mdfe, 'identificacao') else None,
                     'uf_fim': mdfe.identificacao.uf_fim if hasattr(mdfe, 'identificacao') else None,
                     'placa': mdfe.modal_rodoviario.veiculo_tracao.placa if hasattr(mdfe, 'modal_rodoviario') and hasattr(mdfe.modal_rodoviario, 'veiculo_tracao') else None
                 } for mdfe in ultimos_mdfes]
            }
        }

        # Serializar e retornar
        serializer = DashboardGeralDataSerializer(response_data)
        return Response(serializer.data)

class FinanceiroPainelAPIView(APIView):
    """
    API para o painel financeiro. Mostra dados sobre faturamento, valores CIF/FOB, etc.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Obter parâmetros de filtro
        periodo = request.query_params.get('periodo', 'ano')  # mes, trimestre, ano
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Definir período padrão (como no dashboard geral)
        if not data_inicio or not data_fim:
            hoje = date.today()
            if periodo == 'mes':
                data_inicio = date(hoje.year, hoje.month, 1)
                if hoje.month == 12:
                    data_fim = date(hoje.year, 12, 31)
                else:
                    data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1)
            elif periodo == 'trimestre':
                trimestre = ((hoje.month - 1) // 3) + 1
                data_inicio = date(hoje.year, ((trimestre - 1) * 3) + 1, 1)
                if trimestre == 4:
                    data_fim = date(hoje.year, 12, 31)
                else:
                    data_fim = date(hoje.year, trimestre * 3 + 1, 1) - timedelta(days=1)
            else:  # ano
                data_inicio = date(hoje.year, 1, 1)
                data_fim = date(hoje.year, 12, 31)
        else:
            # Converter strings para objetos date
            data_inicio = datetime.strptime(data_inicio, '%Y-%m-%d').date()
            data_fim = datetime.strptime(data_fim, '%Y-%m-%d').date()
        
        # Construir filtros para consultas
        filtro_periodo_cte = Q(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim
        )
        
        # Filtro para CT-es autorizados e não cancelados
        filtro_cte_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135)
        
        # === Cards com indicadores ===
        # Faturamento total no período
        faturamento_total = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido
        ).aggregate(
            total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0'))
        )['total']
        
        # Total de CT-es no período
        total_ctes = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido
        ).count()
        
        # Ticket médio (valor médio por CT-e)
        ticket_medio = Decimal('0.00')
        if total_ctes > 0:
            ticket_medio = faturamento_total / total_ctes
        
        # Totais por modalidade (CIF/FOB)
        valor_cif = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido,
            modalidade='CIF'
        ).aggregate(
            total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0'))
        )['total']
        
        valor_fob = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido,
            modalidade='FOB'
        ).aggregate(
            total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0'))
        )['total']
        
        # Percentuais CIF/FOB
        percentual_cif = 0
        percentual_fob = 0
        if faturamento_total > 0:
            percentual_cif = (valor_cif / faturamento_total) * 100
            percentual_fob = (valor_fob / faturamento_total) * 100
        
        # Faturamento mensal ao longo do tempo
        faturamento_por_mes = CTeDocumento.objects.filter(
            filtro_cte_valido,
            identificacao__data_emissao__date__gte=date(data_inicio.year - 1, data_inicio.month, 1),
            identificacao__data_emissao__date__lte=data_fim
        ).annotate(
            mes=TruncMonth('identificacao__data_emissao')
        ).values('mes').annotate(
            faturamento=Sum('prestacao__valor_total_prestado'),
            cif=Sum(Case(When(modalidade='CIF', then='prestacao__valor_total_prestado'), default=0)),
            fob=Sum(Case(When(modalidade='FOB', then='prestacao__valor_total_prestado'), default=0)),
            entregas=Count('id')
        ).order_by('mes')
        
        # Formatar dados para o gráfico
        grafico_cif_fob = []
        for item in faturamento_por_mes:
            grafico_cif_fob.append({
                'mes': item['mes'].strftime('%m/%Y'),
                'faturamento': float(item['faturamento'] or 0),
                'cif': float(item['cif'] or 0),
                'fob': float(item['fob'] or 0),
                'entregas': item['entregas'] or 0
            })
        
        # Compilar resposta
        response_data = {
            'filtros': {
                'periodo': periodo,
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'cards': {
                'faturamento_total': float(faturamento_total),
                'total_ctes': total_ctes,
                'ticket_medio': float(ticket_medio),
                'valor_cif': float(valor_cif),
                'valor_fob': float(valor_fob),
                'percentual_cif': float(percentual_cif),
                'percentual_fob': float(percentual_fob)
            },
            'grafico_cif_fob': grafico_cif_fob
        }
        
        # Serializar e retornar
        serializer = FinanceiroPainelSerializer(response_data)
        return Response(serializer.data)


class FinanceiroMensalAPIView(APIView):
    """
    API para obter dados financeiros mensais.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Obter mês/ano específico
        mes = request.query_params.get('mes')
        if not mes:
            return Response({"error": "Parâmetro 'mes' é obrigatório"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Formato esperado: AAAA-MM
            data = datetime.strptime(mes, '%Y-%m')
            data_inicio = date(data.year, data.month, 1)
            
            # Último dia do mês
            if data.month == 12:
                data_fim = date(data.year, 12, 31)
            else:
                data_fim = date(data.year, data.month + 1, 1) - timedelta(days=1)
        except ValueError:
            return Response({"error": "Formato inválido para 'mes'. Use AAAA-MM"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Filtro para CT-es no mês/ano, autorizados e não cancelados
        ctes = CTeDocumento.objects.filter(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim,
            processado=True,
            protocolo__codigo_status=100
        ).exclude(
            cancelamento__c_stat=135
        )
        
        # Calcular totais
        faturamento = ctes.aggregate(t=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')))['t']
        cif = ctes.filter(modalidade='CIF').aggregate(t=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')))['t']
        fob = ctes.filter(modalidade='FOB').aggregate(t=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')))['t']
        entregas = ctes.count()
        
        # Retornar dados
        data = {
            'mes': mes,
            'faturamento': float(faturamento),
            'cif': float(cif),
            'fob': float(fob),
            'entregas': entregas
        }
        
        return Response(data)


class FinanceiroDetalheAPIView(APIView):
    """
    API para obter detalhes financeiros por clientes, veículos, etc.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Obter parâmetros
        tipo = request.query_params.get('tipo', 'cliente')  # cliente, veiculo, origem, destino
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Validar datas
        if not data_inicio or not data_fim:
            return Response({"error": "Parâmetros data_inicio e data_fim são obrigatórios"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        try:
            data_inicio = datetime.strptime(data_inicio, '%Y-%m-%d').date()
            data_fim = datetime.strptime(data_fim, '%Y-%m-%d').date()
        except ValueError:
            return Response({"error": "Formato de data inválido. Use AAAA-MM-DD"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Filtro base para CT-es válidos no período
        filtro_base = Q(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim,
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135)
        
        # Consulta base
        ctes = CTeDocumento.objects.filter(filtro_base)
        
        # Agrupar por diferentes critérios
        resultados = []
        
        if tipo == 'cliente':
            # Agrupamento por destinatário (cliente)
            clientes = ctes.values(
                'destinatario__cnpj', 
                'destinatario__razao_social'
            ).annotate(
                faturamento_total=Sum('prestacao__valor_total_prestado'),
                qtd_ctes=Count('id'),
                valor_medio=Sum('prestacao__valor_total_prestado') / Count('id')
            ).order_by('-faturamento_total')[:20]  # Top 20
            
            for cliente in clientes:
                resultados.append({
                    'id': cliente['destinatario__cnpj'] or '',
                    'label': cliente['destinatario__razao_social'] or 'Cliente não identificado',
                    'faturamento_total': float(cliente['faturamento_total'] or 0),
                    'qtd_ctes': cliente['qtd_ctes'] or 0,
                    'valor_medio': float(cliente['valor_medio'] or 0)
                })
        
        elif tipo == 'veiculo':
            # Agrupamento por veículo
            veiculos = ctes.filter(
                modal_rodoviario__isnull=False
            ).values(
                'modal_rodoviario__veiculos__placa'
            ).annotate(
                faturamento_total=Sum('prestacao__valor_total_prestado'),
                qtd_ctes=Count('id', distinct=True),
                valor_medio=Sum('prestacao__valor_total_prestado') / Count('id', distinct=True)
            ).order_by('-faturamento_total')[:20]  # Top 20
            
            for veiculo in veiculos:
                if not veiculo['modal_rodoviario__veiculos__placa']:
                    continue
                    
                resultados.append({
                    'id': veiculo['modal_rodoviario__veiculos__placa'],
                    'label': f"Veículo {veiculo['modal_rodoviario__veiculos__placa']}",
                    'faturamento_total': float(veiculo['faturamento_total'] or 0),
                    'qtd_ctes': veiculo['qtd_ctes'] or 0,
                    'valor_medio': float(veiculo['valor_medio'] or 0)
                })
        
        elif tipo == 'origem':
            # Agrupamento por município de origem
            origens = ctes.values(
                'identificacao__codigo_mun_ini',
                'identificacao__nome_mun_ini',
                'identificacao__uf_ini'
            ).annotate(
                faturamento_total=Sum('prestacao__valor_total_prestado'),
                qtd_ctes=Count('id'),
                valor_medio=Sum('prestacao__valor_total_prestado') / Count('id')
            ).order_by('-faturamento_total')[:20]  # Top 20
            
            for origem in origens:
                resultados.append({
                    'id': origem['identificacao__codigo_mun_ini'] or '',
                    'label': f"{origem['identificacao__nome_mun_ini'] or 'Desconhecido'}/{origem['identificacao__uf_ini'] or ''}",
                    'faturamento_total': float(origem['faturamento_total'] or 0),
                    'qtd_ctes': origem['qtd_ctes'] or 0,
                    'valor_medio': float(origem['valor_medio'] or 0)
                })
        
        elif tipo == 'destino':
            # Agrupamento por município de destino
            destinos = ctes.values(
                'identificacao__codigo_mun_fim',
                'identificacao__nome_mun_fim',
                'identificacao__uf_fim'
            ).annotate(
                faturamento_total=Sum('prestacao__valor_total_prestado'),
                qtd_ctes=Count('id'),
                valor_medio=Sum('prestacao__valor_total_prestado') / Count('id')
            ).order_by('-faturamento_total')[:20]  # Top 20
            
            for destino in destinos:
                resultados.append({
                    'id': destino['identificacao__codigo_mun_fim'] or '',
                    'label': f"{destino['identificacao__nome_mun_fim'] or 'Desconhecido'}/{destino['identificacao__uf_fim'] or ''}",
                    'faturamento_total': float(destino['faturamento_total'] or 0),
                    'qtd_ctes': destino['qtd_ctes'] or 0,
                    'valor_medio': float(destino['valor_medio'] or 0)
                })
        
        return Response(resultados)


class CtePainelAPIView(APIView):
    """
    API para o painel de CT-e. Mostra dados sobre CT-es emitidos.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Obter parâmetros de filtro
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Validar datas
        if not data_inicio or not data_fim:
            # Padrão: último mês
            hoje = date.today()
            data_inicio = date(hoje.year, hoje.month, 1)
            if hoje.month == 12:
                data_fim = date(hoje.year, 12, 31)
            else:
                data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1)
        else:
            try:
                data_inicio = datetime.strptime(data_inicio, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data inválido. Use AAAA-MM-DD"}, 
                               status=status.HTTP_400_BAD_REQUEST)
        
        # Filtros para consultas
        filtro_periodo = Q(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim
        )
        
        filtro_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135)
        
        # Consulta base para CT-es válidos no período
        ctes_validos = CTeDocumento.objects.filter(filtro_periodo & filtro_valido)
        
        # === Card com totais ===
        total_ctes = ctes_validos.count()
        valor_total = ctes_validos.aggregate(t=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')))['t']
        
        # Contagem por status
        total_autorizados = CTeDocumento.objects.filter(
            filtro_periodo,
            processado=True,
            protocolo__codigo_status=100,
            cancelamento__isnull=True
        ).count()
        
        total_cancelados = CTeDocumento.objects.filter(
            filtro_periodo,
            processado=True,
            cancelamento__c_stat=135
        ).count()
        
        total_rejeitados = CTeDocumento.objects.filter(
            filtro_periodo,
            processado=True,
            protocolo__isnull=False
        ).exclude(
            protocolo__codigo_status=100
        ).exclude(
            cancelamento__c_stat=135
        ).count()
        
        # === Distribuição por cliente (destinatário) ===
        clientes = ctes_validos.values(
            'destinatario__cnpj',
            'destinatario__razao_social'
        ).annotate(
            qtd=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('-valor')[:10]  # Top 10
        
        grafico_cliente = []
        for c in clientes:
            nome = c['destinatario__razao_social'] or 'Sem Razão Social'
            if len(nome) > 25:  # Truncar nomes muito longos
                nome = nome[:22] + '...'
                
            grafico_cliente.append({
                'label': nome,
                'valor': float(c['valor'] or 0),
                'qtd': c['qtd'] or 0
            })
        
        # === Distribuição por modalidade (CIF/FOB) ===
        distribuidor = ctes_validos.values(
            'modalidade'
        ).annotate(
            qtd=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('modalidade')
        
        grafico_distribuidor = []
        for d in distribuidor:
            modalidade = d['modalidade'] or 'Não Informado'
            grafico_distribuidor.append({
                'label': modalidade,
                'valor': float(d['valor'] or 0),
                'qtd': d['qtd'] or 0
            })
        
        # === Tabela com principais clientes (mais detalhada) ===
        tabela_cliente = []
        for c in clientes:
            # Calcular ticket médio
            ticket_medio = Decimal('0.00')
            if c['qtd'] > 0:
                ticket_medio = c['valor'] / c['qtd']
                
            # Obter o CNPJ formatado (XX.XXX.XXX/XXXX-XX)
            cnpj = c['destinatario__cnpj'] or ''
            if len(cnpj) == 14:
                cnpj = f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
                
            tabela_cliente.append({
                'nome': c['destinatario__razao_social'] or 'Sem Razão Social',
                'cnpj': cnpj,
                'qtd': c['qtd'] or 0,
                'valor': float(c['valor'] or 0),
                'ticket_medio': float(ticket_medio)
            })
        
        # Compilar resposta
        response_data = {
            'filtros': {
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'cards': {
                'total_ctes': total_ctes,
                'valor_total': float(valor_total),
                'total_autorizados': total_autorizados,
                'total_cancelados': total_cancelados,
                'total_rejeitados': total_rejeitados
            },
            'grafico_cliente': grafico_cliente,
            'grafico_distribuidor': grafico_distribuidor,
            'tabela_cliente': tabela_cliente
        }
        
        # Serializar e retornar
        serializer = CtePainelSerializer(response_data)
        return Response(serializer.data)


class MdfePainelAPIView(APIView):
    """
    API para o painel de MDF-e. Mostra dados sobre MDF-es emitidos.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Obter parâmetros de filtro
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Validar datas
        if not data_inicio or not data_fim:
            # Padrão: último mês
            hoje = date.today()
            data_inicio = date(hoje.year, hoje.month, 1)
            if hoje.month == 12:
                data_fim = date(hoje.year, 12, 31)
            else:
                data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1)
        else:
            try:
                data_inicio = datetime.strptime(data_inicio, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data inválido. Use AAAA-MM-DD"}, 
                               status=status.HTTP_400_BAD_REQUEST)
        
        # Filtros para consultas
        filtro_periodo_mdfe = Q(
            identificacao__dh_emi__date__gte=data_inicio,
            identificacao__dh_emi__date__lte=data_fim
        )
        
        filtro_mdfe_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135)
        
        # Filtros para CT-e no mesmo período (para comparação)
        filtro_periodo_cte = Q(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim
        )
        
        filtro_cte_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135)
        
        # === Card com totais ===
        total_mdfes = MDFeDocumento.objects.filter(
            filtro_periodo_mdfe & filtro_mdfe_valido
        ).count()
        
        # Contagem por status
        total_autorizados = MDFeDocumento.objects.filter(
            filtro_periodo_mdfe,
            processado=True,
            protocolo__codigo_status=100,
            cancelamento__isnull=True,
            encerrado=False
        ).count()
        
        total_encerrados = MDFeDocumento.objects.filter(
            filtro_periodo_mdfe,
            processado=True,
            protocolo__codigo_status=100,
            cancelamento__isnull=True,
            encerrado=True
        ).count()
        
        total_cancelados = MDFeDocumento.objects.filter(
            filtro_periodo_mdfe,
            processado=True,
            cancelamento__c_stat=135
        ).count()
        
        # === Gráfico de relação CT-e por MDF-e ===
        # Calcular quantidade de CT-es para cada MDF-e
        mdfes_com_ctes = MDFeDocumento.objects.filter(
            filtro_periodo_mdfe & filtro_mdfe_valido
        ).annotate(
            total_ctes=Count('docs_vinculados_mdfe')
        )
        
        # Agrupar por quantidade de CT-es (0, 1, 2-5, 6-10, 11+)
        cte_mdfe_distribuicao = {
            '0 CT-es': 0,
            '1 CT-e': 0,
            '2 a 5 CT-es': 0,
            '6 a 10 CT-es': 0,
            '11+ CT-es': 0
        }
        
        for mdfe in mdfes_com_ctes:
            qtd = mdfe.total_ctes
            if qtd == 0:
                cte_mdfe_distribuicao['0 CT-es'] += 1
            elif qtd == 1:
                cte_mdfe_distribuicao['1 CT-e'] += 1
            elif 2 <= qtd <= 5:
                cte_mdfe_distribuicao['2 a 5 CT-es'] += 1
            elif 6 <= qtd <= 10:
                cte_mdfe_distribuicao['6 a 10 CT-es'] += 1
            else:
                cte_mdfe_distribuicao['11+ CT-es'] += 1
        
        grafico_cte_mdfe = []
        for categoria, contagem in cte_mdfe_distribuicao.items():
            grafico_cte_mdfe.append({
                'categoria': categoria,
                'contagem': contagem
            })
        
        # === Top veículos utilizados em MDF-es ===
        veiculos_tracao = MDFeDocumento.objects.filter(
            filtro_periodo_mdfe & filtro_mdfe_valido,
            modal_rodoviario__isnull=False,
            modal_rodoviario__veiculo_tracao__isnull=False
        ).values(
            'modal_rodoviario__veiculo_tracao__placa'
        ).annotate(
            total=Count('id')
        ).order_by('-total')[:10]  # Top 10
        
        top_veiculos = []
        for v in veiculos_tracao:
            placa = v['modal_rodoviario__veiculo_tracao__placa']
            if placa:
                top_veiculos.append({
                    'placa': placa,
                    'total': v['total']
                })
        
        # === Tabela de MDF-es por veículo (mais detalhada) ===
        tabela_mdfe_veiculo = []
        for v in top_veiculos[:5]:  # Top 5 apenas para a tabela
            placa = v['placa']
            
            # Calcular estatísticas para este veículo
            mdfes_veiculo = MDFeDocumento.objects.filter(
                filtro_periodo_mdfe & filtro_mdfe_valido,
                modal_rodoviario__veiculo_tracao__placa=placa
            )
            
            total_mdfes_veiculo = mdfes_veiculo.count()
            total_docs = 0
            for mdfe in mdfes_veiculo:
                total_docs += MDFeDocumentosVinculados.objects.filter(mdfe=mdfe).count()
            
            encerrados = mdfes_veiculo.filter(encerrado=True).count()
            percentual_encerrados = 0
            if total_mdfes_veiculo > 0:
                percentual_encerrados = (encerrados / total_mdfes_veiculo) * 100
            
            tabela_mdfe_veiculo.append({
                'placa': placa,
                'total_mdfes': total_mdfes_veiculo,
                'total_documentos': total_docs,
                'media_docs': total_docs / total_mdfes_veiculo if total_mdfes_veiculo > 0 else 0,
                'encerrados': encerrados,
                'percentual_encerrados': percentual_encerrados
            })
        
        # === Cálculo de eficiência (% de CT-es em MDF-es) ===
        total_ctes_periodo = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido
        ).count()
        
        total_ctes_em_mdfes = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido,
            mdfe_vinculado__isnull=False
        ).distinct().count()
        
        eficiencia = 0
        if total_ctes_periodo > 0:
            eficiencia = (total_ctes_em_mdfes / total_ctes_periodo) * 100
        
        # Compilar resposta
        response_data = {
            'filtros': {
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'cards': {
                'total_mdfes': total_mdfes,
                'total_autorizados': total_autorizados,
                'total_encerrados': total_encerrados,
                'total_cancelados': total_cancelados,
                'total_ctes_periodo': total_ctes_periodo,
                'total_ctes_em_mdfes': total_ctes_em_mdfes
            },
            'grafico_cte_mdfe': grafico_cte_mdfe,
            'top_veiculos': top_veiculos,
            'tabela_mdfe_veiculo': tabela_mdfe_veiculo,
            'eficiencia': eficiencia
        }
        
        # Serializar e retornar
        serializer = MdfePainelSerializer(response_data)
        return Response(serializer.data)


class GeograficoPainelAPIView(APIView):
    """
    API para o painel geográfico. Mostra dados sobre origens e destinos.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Obter parâmetros de filtro
        data_inicio = request.query_params.get('data_inicio')
        data_fim = request.query_params.get('data_fim')
        
        # Validar datas
        if not data_inicio or not data_fim:
            # Padrão: último mês
            hoje = date.today()
            data_inicio = date(hoje.year, hoje.month, 1)
            if hoje.month == 12:
                data_fim = date(hoje.year, 12, 31)
            else:
                data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1)
        else:
            try:
                data_inicio = datetime.strptime(data_inicio, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data inválido. Use AAAA-MM-DD"}, 
                               status=status.HTTP_400_BAD_REQUEST)
        
        # Filtros para consultas
        filtro_periodo = Q(
            identificacao__data_emissao__date__gte=data_inicio,
            identificacao__data_emissao__date__lte=data_fim
        )
        
        filtro_valido = Q(
            processado=True,
            protocolo__codigo_status=100
        ) & ~Q(cancelamento__c_stat=135)
        
        # === Principais origens ===
        origens = CTeDocumento.objects.filter(
            filtro_periodo & filtro_valido
        ).values(
            'identificacao__codigo_mun_ini',
            'identificacao__nome_mun_ini',
            'identificacao__uf_ini'
        ).annotate(
            total=Count('id')
        ).order_by('-total')[:10]  # Top 10
        
        top_origens = []
        for o in origens:
            nome = o['identificacao__nome_mun_ini']
            uf = o['identificacao__uf_ini']
            if nome and uf:
                top_origens.append({
                    'municipio': nome,
                    'uf': uf,
                    'codigo': o['identificacao__codigo_mun_ini'],
                    'total': o['total']
                })
        
        # === Principais destinos ===
        destinos = CTeDocumento.objects.filter(
            filtro_periodo & filtro_valido
        ).values(
            'identificacao__codigo_mun_fim',
            'identificacao__nome_mun_fim',
            'identificacao__uf_fim'
        ).annotate(
            total=Count('id')
        ).order_by('-total')[:10]  # Top 10
        
        top_destinos = []
        for d in destinos:
            nome = d['identificacao__nome_mun_fim']
            uf = d['identificacao__uf_fim']
            if nome and uf:
                top_destinos.append({
                    'municipio': nome,
                    'uf': uf,
                    'codigo': d['identificacao__codigo_mun_fim'],
                    'total': d['total']
                })
        
        # === Rotas mais frequentes ===
        rotas = CTeDocumento.objects.filter(
            filtro_periodo & filtro_valido
        ).values(
            'identificacao__codigo_mun_ini',
            'identificacao__nome_mun_ini',
            'identificacao__uf_ini',
            'identificacao__codigo_mun_fim',
            'identificacao__nome_mun_fim',
            'identificacao__uf_fim'
        ).annotate(
            total=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('-total')[:15]  # Top 15
        
        rotas_frequentes = []
        for r in rotas:
            origem = r['identificacao__nome_mun_ini']
            uf_ini = r['identificacao__uf_ini']
            destino = r['identificacao__nome_mun_fim']
            uf_fim = r['identificacao__uf_fim']
            
            if origem and uf_ini and destino and uf_fim:
                rotas_frequentes.append({
                    'origem': {
                        'municipio': origem,
                        'uf': uf_ini,
                        'codigo': r['identificacao__codigo_mun_ini']
                    },
                    'destino': {
                        'municipio': destino,
                        'uf': uf_fim,
                        'codigo': r['identificacao__codigo_mun_fim']
                    },
                    'total': r['total'],
                    'valor': float(r['valor'] or 0)
                })
        
        # === Dados para mapa de rotas (simplificado) ===
        # Em produção, aqui criaria dados para um mapa interativo
        # Por simplicidade, retornamos apenas os 5 principais fluxos
        rotas_mapa = []
        for r in rotas[:5]:  # Top 5 para o mapa
            origem = r['identificacao__nome_mun_ini']
            uf_ini = r['identificacao__uf_ini']
            destino = r['identificacao__nome_mun_fim']
            uf_fim = r['identificacao__uf_fim']
            
            if origem and uf_ini and destino and uf_fim:
                rotas_mapa.append({
                    'origem': f"{origem}/{uf_ini}",
                    'destino': f"{destino}/{uf_fim}",
                    'fluxo': r['total'],
                    'valor': float(r['valor'] or 0)
                })
        
        # Compilar resposta
        response_data = {
            'filtros': {
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'top_origens': top_origens,
            'top_destinos': top_destinos,
            'rotas_frequentes': rotas_frequentes,
            'rotas': rotas_mapa
        }
        
        # Serializar e retornar
        serializer = GeograficoPainelSerializer(response_data)
        return Response(serializer.data)


class AlertasPagamentoAPIView(APIView):
    """
    API para obter alertas do sistema (pagamentos pendentes, etc.).
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, format=None):
        # Obter parâmetros
        dias_limite = int(request.query_params.get('dias', 7))  # Padrão: 7 dias
        
        hoje = date.today()
        limite = hoje + timedelta(days=dias_limite)
        
        # Pagamentos agregados pendentes próximos do vencimento
        pagamentos_agregados = PagamentoAgregado.objects.filter(
            status='pendente',
            data_prevista__lte=limite
        ).order_by('data_prevista').select_related('cte')
        
        # Pagamentos próprios pendentes
        pagamentos_proprios = PagamentoProprio.objects.filter(
            status='pendente'
        ).order_by('periodo').select_related('veiculo')
        
        # Serializar os resultados
        serializer = AlertaPagamentoSerializer({
            'agregados_pendentes': pagamentos_agregados,
            'proprios_pendentes': pagamentos_proprios,
            'dias_alerta': dias_limite
        })
        
        return Response(serializer.data)


class RelatorioAPIView(APIView):
    """
    API para geração de relatórios em diversos formatos.
    Suporta diferentes tipos de relatórios e formatos de saída.
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request, format=None):
        """
        Endpoint para gerar relatórios.
        Parâmetros:
        - tipo: Tipo de relatório (faturamento, veiculos, ctes, mdfes, pagamentos)
        - formato: Formato de saída (csv, xlsx, pdf)
        - filtros: JSON com filtros específicos para o relatório
        """
        tipo = request.query_params.get('tipo', 'faturamento')
        formato = request.query_params.get('formato', 'csv')
        filtros_json = request.query_params.get('filtros', '{}')
        
        try:
            filtros = json.loads(filtros_json)
        except json.JSONDecodeError:
            return Response({"error": "Formato de filtros inválido. Deve ser um objeto JSON válido."}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        # Processar datas se fornecidas
        data_inicio = filtros.get('data_inicio')
        data_fim = filtros.get('data_fim')
        
        if data_inicio:
            try:
                data_inicio = datetime.strptime(data_inicio, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data_inicio inválido. Use AAAA-MM-DD."}, 
                               status=status.HTTP_400_BAD_REQUEST)
        
        if data_fim:
            try:
                data_fim = datetime.strptime(data_fim, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data_fim inválido. Use AAAA-MM-DD."}, 
                               status=status.HTTP_400_BAD_REQUEST)
        
        # Definir tipo de relatório e chamar método correspondente
        if tipo == 'faturamento':
            return self._gerar_relatorio_faturamento(data_inicio, data_fim, filtros, formato)
        elif tipo == 'veiculos':
            return self._gerar_relatorio_veiculos(filtros, formato)
        elif tipo == 'ctes':
            return self._gerar_relatorio_ctes(data_inicio, data_fim, filtros, formato)
        elif tipo == 'mdfes':
            return self._gerar_relatorio_mdfes(data_inicio, data_fim, filtros, formato)
        elif tipo == 'pagamentos':
            return self._gerar_relatorio_pagamentos(data_inicio, data_fim, filtros, formato)
        elif tipo == 'km_rodado':
            return self._gerar_relatorio_km_rodado(data_inicio, data_fim, filtros, formato)
        elif tipo == 'manutencoes':
            return self._gerar_relatorio_manutencoes(data_inicio, data_fim, filtros, formato)
        else:
            return Response({"error": f"Tipo de relatório '{tipo}' não suportado."}, 
                           status=status.HTTP_400_BAD_REQUEST)
    
    def _gerar_relatorio_faturamento(self, data_inicio, data_fim, filtros, formato):
        """Gera relatório de faturamento."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_relatorio_veiculos(self, filtros, formato):
        """Gera relatório de veículos."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_relatorio_ctes(self, data_inicio, data_fim, filtros, formato):
        """Gera relatório de CT-es."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_relatorio_mdfes(self, data_inicio, data_fim, filtros, formato):
        """Gera relatório de MDF-es."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_relatorio_pagamentos(self, data_inicio, data_fim, filtros, formato):
        """Gera relatório de pagamentos."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_relatorio_km_rodado(self, data_inicio, data_fim, filtros, formato):
        """Gera relatório de quilometragem rodada por veículo."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_relatorio_manutencoes(self, data_inicio, data_fim, filtros, formato):
        """Gera relatório de manutenções."""
        # Implementação conforme necessidade
        pass
    
    def _gerar_csv(self, dados, nome_arquivo):
        """Função auxiliar para gerar arquivos CSV."""
        # Verificar se há dados
        if not dados:
            return Response({"error": "Não há dados para gerar o relatório."}, 
                           status=status.HTTP_404_NOT_FOUND)
        
        # Criar buffer de memória para o CSV
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=dados[0].keys())
        
        # Escrever cabeçalho e dados
        writer.writeheader()
        writer.writerows(dados)
        
        # Retornar o arquivo
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{nome_arquivo}"'
        return response


# ===============================================================
# ==> APIS PARA CONFIGURAÇÃO DO SISTEMA
# ===============================================================

class ParametroSistemaViewSet(viewsets.ModelViewSet):
    """
    API para gerenciar parâmetros do sistema.
    """
    queryset = ParametroSistema.objects.all().order_by('grupo', 'nome')
    serializer_class = ParametroSistemaSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Permite filtrar parâmetros por grupo."""
        queryset = super().get_queryset()
        
        # Filtro por grupo
        grupo = self.request.query_params.get('grupo')
        if grupo:
            queryset = queryset.filter(grupo=grupo)
        
        # Filtro por editável
        editavel = self.request.query_params.get('editavel')
        if editavel is not None:
            queryset = queryset.filter(editavel=editavel.lower() == 'true')
        
        return queryset
    
    @action(detail=False, methods=['get'])
    def valores(self, request):
        """
        Retorna valores simplificados dos parâmetros (nome: valor)
        no formato adequado para uso direto no frontend.
        """
        grupo = request.query_params.get('grupo')
        queryset = self.get_queryset()
        
        if grupo:
            queryset = queryset.filter(grupo=grupo)
        
        # Obter parâmetros e seus valores tipados
        parametros = {}
        for param in queryset:
            parametros[param.nome] = param.get_valor_tipado()
        
        return Response(parametros)
    
    @action(detail=False, methods=['post'])
    def atualizar_multiplos(self, request):
        """
        Atualiza múltiplos parâmetros em uma única requisição.
        Formato esperado:
        {
            "parametros": {
                "NOME_PARAM1": "valor1",
                "NOME_PARAM2": "valor2",
                ...
            }
        }
        """
        parametros = request.data.get('parametros', {})
        
        if not parametros or not isinstance(parametros, dict):
            return Response({"error": "Formato inválido. Esperado: {'parametros': {nome: valor, ...}}"}, 
                           status=status.HTTP_400_BAD_REQUEST)
        
        atualizados = []
        erros = []
        
        with transaction.atomic():
            for nome, valor in parametros.items():
                try:
                    param = ParametroSistema.objects.get(nome=nome)
                    
                    # Verificar se o parâmetro é editável
                    if not param.editavel:
                        erros.append({
                            'nome': nome,
                            'erro': "Este parâmetro não é editável."
                        })
                        continue
                    
                    # Converter para o tipo correto
                    valor_str = str(valor)
                    param.valor = valor_str
                    param.save()
                    
                    atualizados.append({
                        'nome': nome,
                        'valor': valor_str,
                        'valor_tipado': param.get_valor_tipado()
                    })
                    
                except ParametroSistema.DoesNotExist:
                    erros.append({
                        'nome': nome,
                        'erro': "Parâmetro não encontrado."
                    })
                except Exception as e:
                    erros.append({
                        'nome': nome,
                        'erro': str(e)
                    })
        
        return Response({
            'atualizados': atualizados,
            'erros': erros,
            'total_atualizados': len(atualizados),
            'total_erros': len(erros)
        })


class ConfiguracaoEmpresaViewSet(viewsets.ModelViewSet):
    """
    API para gerenciar configurações da empresa.
    """
    queryset = ConfiguracaoEmpresa.objects.all()
    serializer_class = ConfiguracaoEmpresaSerializer
    permission_classes = [IsAuthenticated]
    
    def list(self, request, *args, **kwargs):
        """
        Lista as configurações da empresa.
        Se não existir nenhum registro, retorna um objeto vazio.
        """
        queryset = self.get_queryset()
        
        if not queryset.exists():
            return Response({})
        
        # Se existir mais de um registro, usa o primeiro
        configuracao = queryset.first()
        serializer = self.get_serializer(configuracao)
        return Response(serializer.data)
    
    def create(self, request, *args, **kwargs):
        """
        Cria ou atualiza as configurações da empresa.
        Se já existir um registro, o mesmo será atualizado em vez de criar um novo.
        """
        queryset = self.get_queryset()
        
        if queryset.exists():
            # Se já existe, atualiza o primeiro registro
            configuracao = queryset.first()
            serializer = self.get_serializer(configuracao, data=request.data)
        else:
            # Se não existe, cria um novo
            serializer = self.get_serializer(data=request.data)
        
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


# ===============================================================
# ==> APIS PARA BACKUP E RESTAURAÇÃO
# ===============================================================

class BackupAPIView(viewsets.ViewSet):
    """
    API para gerenciar backups do sistema.
    """
    permission_classes = [IsAuthenticated] # Idealmente [IsAuthenticated, IsAdminUser]

    def list(self, request):
        """Listar backups registrados."""
        # Verificar permissões (apenas admin pode listar)
        if not request.user.is_staff:
             return Response({"error": "Apenas administradores podem listar backups."},
                            status=status.HTTP_403_FORBIDDEN)
        
        try:
            registros = RegistroBackup.objects.all().order_by('-data_hora')
            serializer = RegistroBackupSerializer(registros, many=True)
            return Response(serializer.data)
        except Exception as e:
            return Response({"error": f"Erro ao listar backups: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def gerar(self, request):
        """Gerar um novo backup do banco de dados."""
        if not request.user.is_staff:
             return Response({"error": "Apenas administradores podem gerar backups."},
                            status=status.HTTP_403_FORBIDDEN)

        try:
            # --- Lógica Real de Backup ---
            # TODO: Substituir esta lógica pelo comando real do seu banco (pg_dump, mysqldump, sqlite3 .dump)
            print("INFO: Iniciando geração de backup...")
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            db_settings = settings.DATABASES['default']
            db_name = db_settings['NAME']
            backup_dir = os.path.join(settings.MEDIA_ROOT, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            filename = f"backup_{timestamp}.sql"
            filepath = os.path.join(backup_dir, filename)

            # Exemplo para SQLite:
            if 'sqlite3' in db_settings['ENGINE']:
                command = f"sqlite3 {db_name} .dump > {filepath}"
                result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
                print(f"Comando SQLite executado: {command}")
                if result.returncode != 0:
                     raise Exception(f"Erro no comando sqlite3: {result.stderr}")

            # Exemplo para PostgreSQL (requer pg_dump no PATH ou path completo):
            # elif 'postgresql' in db_settings['ENGINE']:
            #     db_user = db_settings['USER']
            #     db_host = db_settings.get('HOST', 'localhost')
            #     db_port = db_settings.get('PORT', '5432')
            #     # Idealmente, usar variáveis de ambiente para senha (PGPASSWORD)
            #     command = f"pg_dump -U {db_user} -h {db_host} -p {db_port} -d {db_name} -f {filepath}"
            #     result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
            #     if result.returncode != 0:
            #          raise Exception(f"Erro no comando pg_dump: {result.stderr}")

            else:
                raise NotImplementedError("Backup não implementado para este tipo de banco de dados.")

            # Calcula tamanho e hash MD5
            tamanho_bytes = os.path.getsize(filepath)
            md5_hash = hashlib.md5(open(filepath,'rb').read()).hexdigest()

            # Registra o backup no banco
            registro = RegistroBackup.objects.create(
                nome_arquivo=filename,
                tamanho_bytes=tamanho_bytes,
                md5_hash=md5_hash,
                localizacao=filepath,
                usuario=request.user.username,
                status='completo'
            )
            print(f"INFO: Backup {filename} gerado com sucesso.")
            # --- Fim da Lógica Real ---

            # Retorna registro criado
            serializer = RegistroBackupSerializer(registro)
            # Ao invés de retornar o registro, retorna FileResponse para download direto
            response = FileResponse(
                open(filepath, 'rb'),
                as_attachment=True,
                filename=filename # Nome que aparecerá no download do usuário
            )
            # Opcional: Adicionar headers com informações do registro se necessário
            response['X-Backup-ID'] = registro.id
            response['X-Backup-Status'] = registro.status
            return response

        except Exception as e:
            print(f"ERRO ao gerar backup: {e}")
            # Registrar erro se possível
            try:
                 RegistroBackup.objects.create(
                     nome_arquivo=f"erro_{timestamp}.log",
                     tamanho_bytes=0,
                     md5_hash='',
                     localizacao='N/A',
                     usuario=request.user.username,
                     status='erro',
                     detalhes=f"Erro ao gerar backup: {str(e)}\n{traceback.format_exc()}"
                 )
            except: pass # Falha ao registrar o erro
            return Response({"error": f"Erro ao gerar backup: {str(e)}"},
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Baixar um arquivo de backup existente pelo ID do registro."""
        if not request.user.is_staff:
            return Response({"error": "Apenas administradores podem baixar backups."},
                           status=status.HTTP_403_FORBIDDEN)

        registro = get_object_or_404(RegistroBackup, pk=pk)

        # Verifica se o arquivo ainda existe na localização registrada
        if not os.path.exists(registro.localizacao):
             return Response({"error": f"Arquivo de backup não encontrado em: {registro.localizacao}"},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            return FileResponse(
                open(registro.localizacao, 'rb'),
                as_attachment=True,
                filename=registro.nome_arquivo
            )
        except Exception as e:
             return Response({"error": f"Erro ao tentar baixar o arquivo: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def restaurar(self, request):
        """
        Restaurar a partir de um arquivo de backup enviado.
        Atenção: Operação perigosa, substitui dados atuais!
        """
        if not request.user.is_staff:
            return Response({"error": "Apenas administradores podem restaurar backups."},
                           status=status.HTTP_403_FORBIDDEN)

        # Verificar se um arquivo foi enviado
        backup_file = request.FILES.get('arquivo_backup') # Nome do campo no formulário
        if not backup_file:
             return Response({"error": "Nenhum arquivo de backup enviado."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Verificar extensão (opcional, mas recomendado)
        if not backup_file.name.lower().endswith('.sql'):
             return Response({"error": "Arquivo inválido. Apenas arquivos .sql são suportados para restauração."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            # --- Lógica Real de Restauração ---
            # --- Lógica Real de Restauração ---
            # TODO: Implementar a lógica de restauração específica do banco.
            # EXTREMAMENTE CUIDADO AO IMPLEMENTAR ISSO!
            # Geralmente envolve parar o servidor, rodar o comando de restauração (psql, mysql, sqlite3 <)
            # e reiniciar o servidor. Fazer isso diretamente de uma view web é complexo e arriscado.
            # Uma abordagem mais segura seria:
            # 1. Salvar o arquivo enviado em um local seguro.
            # 2. Informar o administrador que o arquivo está pronto.
            # 3. O administrador executa a restauração manualmente via linha de comando.

            print(f"INFO: Restauração solicitada com arquivo {backup_file.name} pelo usuário {request.user.username}.")
            # Exemplo Simulado (NÃO EXECUTA RESTAURAÇÃO REAL):
            # Salva o arquivo temporariamente para inspeção
            temp_dir = tempfile.mkdtemp()
            temp_path = os.path.join(temp_dir, backup_file.name)
            with open(temp_path, 'wb+') as destination:
                for chunk in backup_file.chunks():
                    destination.write(chunk)
            print(f"INFO: Arquivo de backup salvo temporariamente em {temp_path}.")
            # shutil.rmtree(temp_dir) # Limpar depois se não for usar

            return Response({
                "message": "Arquivo de backup recebido. A restauração deve ser feita manualmente por um administrador.",
                "arquivo_recebido": backup_file.name,
                "tamanho": backup_file.size
            })
            # --- Fim da Lógica Real ---

        except Exception as e:
            print(f"ERRO ao processar restauração: {e}")
            return Response({"error": f"Erro ao processar pedido de restauração: {str(e)}"},
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)