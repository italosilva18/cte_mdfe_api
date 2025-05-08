# transport/views/upload_views.py

# Imports padrão
import os
import json
import csv
import subprocess
import tempfile
import hashlib
import shutil
import traceback
import zipfile # (Verificar se zipfile é realmente usado aqui ou em outro lugar)
import re
from datetime import datetime, timezone
from decimal import Decimal
from io import StringIO, BytesIO # (Verificar se StringIO/BytesIO são usados aqui)

# Imports Django
from django.http import HttpResponse, JsonResponse, FileResponse
from django.conf import settings
from django.db import transaction
from django.db.models import Q # (Verificar se Q é usado aqui)

# Imports Django REST Framework
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

# Imports DRF-YASG (Swagger)
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

# Imports Locais
from ..serializers import UploadXMLSerializer, BatchUploadXMLSerializer # Serializers necessários
from ..models import ( # Modelos usados para criar/atualizar registros
    CTeDocumento, CTeCancelamento,
    MDFeDocumento, MDFeCancelamento, MDFeCancelamentoEncerramento
)
from ..services.parser_cte import parse_cte_completo # Serviços de parsing
from ..services.parser_mdfe import parse_mdfe_completo
from ..services.parser_eventos import parse_evento

# Lib Externa
import xmltodict # Para parsing inicial

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
    serializer_class = UploadXMLSerializer # Define o serializer padrão para o ViewSet

    @swagger_auto_schema(
        operation_description="Envie arquivos XML para processamento automático",
        request_body=UploadXMLSerializer, # Mantém a especificação explícita para Swagger
        responses={
            200: openapi.Response('Processado com sucesso (Atualização)', examples={'application/json': {'message': 'CT-e reprocessado com sucesso', 'id': 'uuid', 'chave': '...', 'reprocessamento': True}}),
            201: openapi.Response('Processado com sucesso (Criação)', examples={'application/json': {'message': 'CT-e processado com sucesso', 'id': 'uuid', 'chave': '...', 'reprocessamento': False}}),
            202: openapi.Response('Evento recebido, mas sem ação direta no DB', examples={'application/json': {'message': 'Evento recebido...', 'warning': '...'}}),
            400: openapi.Response('Erro nos dados ou no arquivo (Bad Request)', examples={'application/json': {'error': 'Mensagem de erro detalhada'}}),
            500: openapi.Response('Erro interno no processamento (Internal Server Error)', examples={'application/json': {'error': 'Mensagem de erro interna', 'details': '...'}})
        }
    )
    def create(self, request):
        """Recebe e processa o upload de XML (single file)."""
        # Usa o serializer definido em serializer_class
        serializer = self.get_serializer(data=request.data)
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
                # Usa process_namespaces=True para melhor compatibilidade
                xml_dict_preview = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                # Pega a primeira chave (tag raiz) de forma segura
                root_tag = next(iter(xml_dict_preview), None)

                if not root_tag:
                     return Response({
                        "error": "Não foi possível identificar a tag raiz do XML."
                     }, status=status.HTTP_400_BAD_REQUEST)


                # Direciona para o processador correto
                if root_tag in ('CTe', 'procCTe', 'cteProc'):
                    return self._process_cte(xml_content, arquivo_principal, xml_dict_preview)
                elif root_tag in ('MDFe', 'procMDFe', 'mdfeProc'):
                    return self._process_mdfe(xml_content, arquivo_principal, xml_dict_preview)
                elif root_tag in ('eventoCTe', 'procEventoCTe', 'eventoMDFe', 'procEventoMDFe',
                                  'retEventoCTe', 'retEventoMDFe'): # Adicionado retEvento* aqui também
                    return self._process_evento(xml_content, xml_retorno_content, arquivo_principal)
                else:
                    return Response({
                        "error": f"Tipo de documento XML não reconhecido (tag raiz: {root_tag}). "
                                 f"Arquivos suportados: CT-e, MDF-e ou Eventos."
                    }, status=status.HTTP_400_BAD_REQUEST)

            except Exception as parse_err:
                print(f"Erro ao parsear XML para detecção de tipo: {parse_err}")
                # Tenta extrair tipo por regex como fallback antes de desistir? (Opcional)
                return Response({
                    "error": f"Não foi possível parsear o XML para identificar o tipo. Erro: {str(parse_err)}. "
                             f"Verifique se o arquivo XML está bem formado e não está corrompido."
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            print(f"Erro inesperado no processamento de upload: {e}")
            traceback.print_exc() # Imprime o traceback completo no log do servidor
            return Response({
                "error": f"Erro inesperado ao processar o upload: {str(e)}",
                # "details": traceback.format_exc() # Evitar mandar traceback para cliente em produção
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # --- Métodos Auxiliares Internos ---

    def _get_chave_from_dict(self, xml_dict, tipo_doc):
        """
        Tenta extrair a chave de acesso do dicionário XML parseado.
        Tipo_doc: 'CTe' ou 'MDFe'.
        Retorna a chave (44 dígitos) ou None se não encontrar.
        """
        # Transforma em minúsculas para ser case-insensitive
        tipo_doc_lower = tipo_doc.lower()
        tag_inf = f'inf{tipo_doc_lower}'
        prefixo = tipo_doc # Mantém prefixo original para comparar com o Id

        try:
            # Procura o nó de informação principal em diferentes estruturas comuns
            # A ordem importa: tenta a estrutura mais completa primeiro
            inf_node = safe_get(xml_dict, f'proc{tipo_doc}.{tipo_doc}.inf{tipo_doc}') or \
                       safe_get(xml_dict, f'{tipo_doc_lower}Proc.{tipo_doc}.inf{tipo_doc}') or \
                       safe_get(xml_dict, f'{tipo_doc}.inf{tipo_doc}')

            if not inf_node or '@Id' not in inf_node:
                 # Tenta pegar direto do infCte/infMDFe se for a raiz
                 inf_node_raiz = safe_get(xml_dict, f'inf{tipo_doc}')
                 if inf_node_raiz and '@Id' in inf_node_raiz:
                    inf_node = inf_node_raiz
                 else:
                    print(f"DEBUG: Nó <inf{tipo_doc}> ou atributo @Id não encontrado na estrutura esperada.")
                    return None

            id_completo = inf_node['@Id']
            if not isinstance(id_completo, str) or len(id_completo) < 44:
                 print(f"DEBUG: Atributo Id inválido ou curto demais: {id_completo}")
                 return None

            # Extrai os últimos 44 dígitos, que devem ser a chave
            chave_numerica = ''.join(filter(str.isdigit, id_completo))
            if len(chave_numerica) == 44:
                 # Verifica se começa com o prefixo esperado (case-insensitive na tag, mas Id tem case)
                 if id_completo.upper().startswith(prefixo.upper()):
                     return chave_numerica
                 else:
                     print(f"Warning: Id encontrado ({id_completo}) não começa com o prefixo esperado '{prefixo}'. Retornando a chave mesmo assim.")
                     return chave_numerica
            else:
                 print(f"DEBUG: Não foi possível extrair 44 dígitos da chave do Id: {id_completo}")
                 return None

        except Exception as e:
            print(f"Erro ao extrair chave {tipo_doc} do dicionário: {e}")
            return None

    def _get_chave_from_regex(self, xml_content, tipo_doc):
        """
        Tenta extrair a chave usando regex como fallback.
        """
        tag_inf = f'inf{tipo_doc}' # Ex: infCte, infMDFe

        # Regex para encontrar Id="CTe..." ou Id="MDFe..." dentro da tag <inf...>
        pattern = rf'<{tag_inf}[^>]*\sId\s*=\s*["\']{tipo_doc}(\d{{44}})["\']'
        match = re.search(pattern, xml_content, re.IGNORECASE) # Ignora case da tag e atributo

        if match:
            return match.group(1)
        else:
            # Fallback: tenta encontrar apenas os 44 dígitos no atributo Id, sem o prefixo
            pattern_sem_prefixo = rf'<{tag_inf}[^>]*\sId\s*=\s*["\'](\d{{44}})["\']'
            match_sem_prefixo = re.search(pattern_sem_prefixo, xml_content, re.IGNORECASE)
            if match_sem_prefixo:
                print(f"Warning: Chave {tipo_doc} encontrada via regex sem o prefixo '{tipo_doc}' no atributo Id.")
                return match_sem_prefixo.group(1)
            return None


    def _process_cte(self, xml_content, arquivo_obj, xml_dict=None):
        """Processa um XML de CT-e."""
        chave = None
        if xml_dict:
            chave = self._get_chave_from_dict(xml_dict, 'CTe')

        # Se falhou com xmltodict, tenta regex
        if not chave:
            print(f"INFO: Tentando extrair chave CT-e com regex...")
            chave = self._get_chave_from_regex(xml_content, 'CTe')

        if not chave:
            return Response({
                "error": "Não foi possível identificar a chave do CT-e no XML. "
                         "Verifique a tag <infCte> e o atributo Id='CTe...'."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Extrai versão do XML
        versao = safe_get(xml_dict, 'procCTe.@versao') or \
                 safe_get(xml_dict, 'cteProc.@versao') or \
                 safe_get(xml_dict, 'CTe.@versao') or \
                 safe_get(xml_dict, 'CTe.infCte.@versao') or \
                 '4.00' # Default para versão 4.00 se não encontrar

        try:
            # Salva ou atualiza o registro básico do CT-e
            cte, created = CTeDocumento.objects.update_or_create(
                chave=chave,
                defaults={
                    'xml_original': xml_content,
                    'arquivo_xml': arquivo_obj, # Salva a referência do arquivo
                    'processado': False, # Marca como não processado inicialmente
                    'versao': versao
                }
            )
            reprocessamento = not created
            print(f"INFO: CT-e {chave} {'criado' if created else 'encontrado'} no banco.")

        except Exception as db_err:
             print(f"ERRO DB (update_or_create CT-e {chave}): {db_err}")
             traceback.print_exc()
             return Response({
                 "error": f"Erro ao salvar/atualizar registro do CT-e no banco: {str(db_err)}"
             }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Chama o parser detalhado
        try:
            result = parse_cte_completo(cte) # Passa o objeto do modelo
            if result:
                print(f"INFO: parse_cte_completo executado com sucesso para CT-e {chave}.")
                return Response({
                    "message": f"CT-e {'reprocessado' if reprocessamento else 'processado'} com sucesso",
                    "id": str(cte.id),
                    "chave": cte.chave,
                    "reprocessamento": reprocessamento
                }, status=status.HTTP_200_OK if reprocessamento else status.HTTP_201_CREATED)
            else:
                 # Se o parser retornar False (erro interno no parser)
                 print(f"ERROR: parse_cte_completo retornou False para CT-e {chave}.")
                 # O parser já deve ter marcado como não processado
                 return Response({
                     "error": "Falha no processamento detalhado do CT-e. Verifique os logs do servidor."
                 }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
             # Se o parser levantar uma exceção
            print(f"ERRO (parse_cte_completo CT-e {chave}): {parse_err}")
            traceback.print_exc()
            # Garante que está marcado como não processado
            try:
                 cte.processado = False
                 cte.save(update_fields=['processado'])
            except Exception as save_err:
                 print(f"ERRO ao salvar status de erro no CT-e {chave}: {save_err}")
            return Response({
                "error": f"Erro ao processar dados do CT-e: {str(parse_err)}",
                # "details": traceback.format_exc() # Opcional
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _process_mdfe(self, xml_content, arquivo_obj, xml_dict=None):
        """Processa um XML de MDF-e."""
        chave = None
        if xml_dict:
            chave = self._get_chave_from_dict(xml_dict, 'MDFe')

        # Se falhou com xmltodict, tenta regex
        if not chave:
            print(f"INFO: Tentando extrair chave MDF-e com regex...")
            chave = self._get_chave_from_regex(xml_content, 'MDFe')

        if not chave:
            return Response({
                "error": "Não foi possível identificar a chave do MDF-e no XML. "
                         "Verifique a tag <infMDFe> e o atributo Id='MDFe...'."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Extrai versão do XML
        versao = safe_get(xml_dict, 'procMDFe.@versao') or \
                 safe_get(xml_dict, 'mdfeProc.@versao') or \
                 safe_get(xml_dict, 'MDFe.@versao') or \
                 safe_get(xml_dict, 'MDFe.infMDFe.@versao') or \
                 '3.00' # Default para versão 3.00 se não encontrar

        try:
            # Salva ou atualiza o registro básico do MDF-e
            mdfe, created = MDFeDocumento.objects.update_or_create(
                chave=chave,
                defaults={
                    'xml_original': xml_content,
                    'arquivo_xml': arquivo_obj, # Salva a referência do arquivo
                    'processado': False, # Marca como não processado inicialmente
                    'versao': versao
                }
            )
            reprocessamento = not created
            print(f"INFO: MDF-e {chave} {'criado' if created else 'encontrado'} no banco.")

        except Exception as db_err:
             print(f"ERRO DB (update_or_create MDF-e {chave}): {db_err}")
             traceback.print_exc()
             return Response({
                 "error": f"Erro ao salvar/atualizar registro do MDF-e no banco: {str(db_err)}"
             }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Chama o parser detalhado
        try:
            result = parse_mdfe_completo(mdfe) # Passa o objeto do modelo
            if result:
                print(f"INFO: parse_mdfe_completo executado com sucesso para MDF-e {chave}.")
                return Response({
                    "message": f"MDF-e {'reprocessado' if reprocessamento else 'processado'} com sucesso",
                    "id": str(mdfe.id),
                    "chave": mdfe.chave,
                    "reprocessamento": reprocessamento
                }, status=status.HTTP_200_OK if reprocessamento else status.HTTP_201_CREATED)
            else:
                print(f"ERROR: parse_mdfe_completo retornou False para MDF-e {chave}.")
                return Response({
                    "error": "Falha no processamento detalhado do MDF-e. Verifique os logs do servidor."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            print(f"ERRO (parse_mdfe_completo MDF-e {chave}): {parse_err}")
            traceback.print_exc()
            try:
                 mdfe.processado = False
                 mdfe.save(update_fields=['processado'])
            except Exception as save_err:
                 print(f"ERRO ao salvar status de erro no MDF-e {chave}: {save_err}")
            return Response({
                "error": f"Erro ao processar dados do MDF-e: {str(parse_err)}",
                # "details": traceback.format_exc() # Opcional
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _process_evento(self, xml_content, xml_retorno_content, arquivo_obj):
        """Processa um XML de evento."""
        try:
            # Passa o conteúdo do XML do evento e do retorno para o parser
            result = parse_evento(xml_content, xml_retorno_content)

            if result is None:
                # O parser de eventos retornou None, significando que o evento não é suportado
                # ou não houve sucesso na validação do retorno SEFAZ (ex: status != 135)
                print(f"INFO: parse_evento retornou None. Evento não processado ou sem sucesso.")
                return Response({
                    "message": "Evento recebido, mas não processado ou não confirmado pela SEFAZ.",
                    "warning": "Verifique se o evento é suportado (Cancelamento, Encerramento, etc.) e se o XML de retorno (caso exista) indica sucesso (status 135)."
                }, status=status.HTTP_202_ACCEPTED) # 202 Accepted indica que foi recebido, mas pode não ter sido processado

            # Determina a mensagem de sucesso com base no tipo de resultado
            evento_tipo = "Evento"
            doc_chave = "N/A"
            doc_id = None

            # Ajusta a mensagem com base no tipo de objeto retornado pelo parser
            if isinstance(result, CTeCancelamento):
                evento_tipo = "Cancelamento de CT-e"
                doc_chave = result.cte.chave
                doc_id = str(result.cte.id)
            elif isinstance(result, MDFeCancelamento):
                evento_tipo = "Cancelamento de MDF-e"
                doc_chave = result.mdfe.chave
                doc_id = str(result.mdfe.id)
            elif isinstance(result, MDFeCancelamentoEncerramento):
                 evento_tipo = "Cancelamento de Encerramento de MDF-e"
                 doc_chave = result.mdfe.chave
                 doc_id = str(result.mdfe.id)
            elif isinstance(result, MDFeCondutor):
                 evento_tipo = "Inclusão de Condutor MDF-e"
                 doc_chave = result.mdfe.chave
                 doc_id = str(result.mdfe.id)
            elif result is True:
                 # Para eventos que apenas retornam True (ex: CCE logada com sucesso)
                 evento_tipo = "Evento processado"
                 # Tenta extrair a chave e tipo do XML original para a resposta
                 try:
                     xml_dict = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                     evento_raiz = next((v for k, v in xml_dict.items() if k.endswith('EventoCTe') or k.endswith('EventoMDFe')), None)
                     if evento_raiz:
                         infEvento = safe_get(evento_raiz, 'infEvento')
                         if infEvento:
                             doc_chave = infEvento.get('chCTe') or infEvento.get('chMDFe') or "N/A"
                             tpEvento = infEvento.get('tpEvento', '')
                             evento_tipo = f"Evento {tpEvento} processado"
                 except Exception as e:
                      print(f"WARN: Não foi possível extrair detalhes do evento que retornou True: {e}")

            print(f"INFO: Evento processado: {evento_tipo} para documento {doc_chave}")
            return Response({
                "message": f"{evento_tipo} processado com sucesso.",
                "documento_chave": doc_chave,
                "documento_id": doc_id,
            }, status=status.HTTP_201_CREATED) # 201 Created para evento registrado

        except ValueError as e:
            # Erros de validação esperados (ex: doc não encontrado, XML inválido)
            print(f"ERRO (parse_evento - Validação): {e}")
            return Response({
                "error": str(e),
                "details": "Verifique se o XML do evento está correto e se o documento principal ao qual ele se refere existe no sistema."
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Erros inesperados durante o processamento do evento
            print(f"ERRO (parse_evento - Inesperado): {e}")
            traceback.print_exc()
            return Response({
                "error": f"Erro inesperado ao processar evento: {str(e)}",
                # "details": traceback.format_exc() # Evitar em produção
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'], serializer_class=BatchUploadXMLSerializer)
    def batch_upload(self, request):
        """
        Recebe e processa o upload em lote de múltiplos arquivos XML.
        """
        # Usa o serializer definido na action
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        arquivos = serializer.validated_data['arquivos_xml']
        resultados = []
        total_success = 0
        total_error = 0
        total_skipped = 0 # Para arquivos não XML ou com erro de leitura inicial

        # Processar cada arquivo individualmente usando a lógica existente
        for arquivo in arquivos:
            resultado_processamento = {'arquivo': arquivo.name, 'status': 'erro', 'erro': 'Erro desconhecido'}
            try:
                # Resetar ponteiro e ler conteúdo
                arquivo.seek(0)
                try:
                    xml_content = arquivo.read().decode('utf-8') # Tenta UTF-8 primeiro
                except UnicodeDecodeError:
                     try:
                         arquivo.seek(0)
                         xml_content = arquivo.read().decode('latin-1') # Tenta Latin-1
                     except Exception as decode_err:
                         resultado_processamento['erro'] = f"Erro ao decodificar (UTF-8/Latin-1): {str(decode_err)}"
                         resultados.append(resultado_processamento)
                         total_skipped += 1
                         print(f"SKIP Lote: Erro decodificação {arquivo.name}")
                         continue # Pula para o próximo arquivo
                except Exception as read_err:
                     resultado_processamento['erro'] = f"Erro ao ler arquivo: {str(read_err)}"
                     resultados.append(resultado_processamento)
                     total_skipped += 1
                     print(f"SKIP Lote: Erro leitura {arquivo.name}")
                     continue

                # Tenta processar o conteúdo
                try:
                     # Parse para detectar tipo
                     xml_dict = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                     root_tag = next(iter(xml_dict), None)

                     if not root_tag:
                          resultado_processamento['erro'] = "XML vazio ou inválido (sem tag raiz)"
                          total_error += 1
                     else:
                        # Chama a função de processamento apropriada
                        response = None
                        if root_tag in ('CTe', 'procCTe', 'cteProc'):
                            response = self._process_cte(xml_content, arquivo, xml_dict)
                        elif root_tag in ('MDFe', 'procMDFe', 'mdfeProc'):
                            response = self._process_mdfe(xml_content, arquivo, xml_dict)
                        elif root_tag in ('eventoCTe', 'procEventoCTe', 'eventoMDFe', 'procEventoMDFe', 'retEventoCTe', 'retEventoMDFe'):
                             # Para lote, geralmente não há arquivo de retorno junto
                             response = self._process_evento(xml_content, None, arquivo)
                        else:
                            response = Response({"error": f"Tipo não reconhecido ({root_tag})"}, status=400)

                        # Analisa a resposta do processamento individual
                        if status.is_success(response.status_code):
                            resultado_processamento = {
                                'arquivo': arquivo.name,
                                'status': 'sucesso',
                                'mensagem': response.data.get('message', 'Processado'),
                                'chave': response.data.get('chave') or response.data.get('documento_chave'),
                                'tipo': root_tag # Assume a tag raiz como tipo
                            }
                            total_success += 1
                        else:
                            # Erro específico retornado pelo processamento
                            resultado_processamento = {
                                'arquivo': arquivo.name,
                                'status': 'erro',
                                'erro': response.data.get('error', f'Status {response.status_code}')
                            }
                            total_error += 1

                except Exception as process_err:
                     # Erro durante o parsing ou chamada de _process_*
                     print(f"ERRO Lote ({arquivo.name}): {process_err}")
                     traceback.print_exc()
                     resultado_processamento = {
                         'arquivo': arquivo.name,
                         'status': 'erro',
                         'erro': f"Erro no processamento interno: {str(process_err)}"
                     }
                     total_error += 1

            except Exception as e:
                # Erro inesperado ao lidar com o arquivo
                 print(f"ERRO Crítico Lote ({arquivo.name}): {e}")
                 traceback.print_exc()
                 resultado_processamento['erro'] = f"Erro crítico no upload: {str(e)}"
                 total_skipped += 1

            resultados.append(resultado_processamento)

        # Retorna o resumo do lote
        final_status = status.HTTP_200_OK if total_error == 0 else status.HTTP_207_MULTI_STATUS
        return Response({
            'message': f"Processamento em lote concluído.",
            'sucesso': total_success,
            'erros': total_error,
            'ignorados': total_skipped, # Arquivos que falharam antes do processamento
            'resultados_detalhados': resultados
        }, status=final_status)