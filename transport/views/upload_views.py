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
import re
from datetime import datetime, timezone
from decimal import Decimal
from io import StringIO, BytesIO # Verificar se StringIO/BytesIO são realmente usados aqui

# Imports Django
from django.http import HttpResponse, JsonResponse, FileResponse
from django.conf import settings
from django.db import transaction
from django.db.models import Q # Verificar se Q é usado aqui

# Imports Django REST Framework
# MUDANÇA: Importar GenericViewSet em vez de só ViewSet, se necessário, ou apenas usar viewsets.GenericViewSet abaixo
from rest_framework import viewsets, status, generics # generics inclui GenericViewSet
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

# Imports DRF-YASG (Swagger)
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

# Imports Locais
# Ajustado para importar da nova estrutura de serializers
from ..serializers.upload_serializers import UploadXMLSerializer, BatchUploadXMLSerializer
from ..models import (
    CTeDocumento, CTeCancelamento,
    MDFeDocumento, MDFeCancelamento, MDFeCancelamentoEncerramento, MDFeCondutor # Adicionado MDFeCondutor para _process_evento
)
from ..services.parser_cte import parse_cte_completo
from ..services.parser_mdfe import parse_mdfe_completo
from ..services.parser_eventos import parse_evento

# Lib Externa
import xmltodict
from decimal import Decimal, InvalidOperation # Garanta que Decimal e InvalidOperation estão importados
from dateutil import parser as date_parser   # Garanta que python-dateutil está instalado e importado

# --- Helper Functions (Copiadas do views.py original ou parser_cte.py) ---

def safe_get(data_dict, key, default=None):
    """Acessa um valor em um dicionário aninhado com segurança."""
    keys = key.split('.')
    val = data_dict
    for k in keys:
        if isinstance(val, dict):
            val = val.get(k)
            if val is None:
                return default
        elif isinstance(val, list) and k.isdigit() and int(k) < len(val):
            val = val[int(k)]
        else:
            return default
    if isinstance(val, dict) and '#text' in val:
        return val['#text']
    if isinstance(val, dict) and key.split('.')[-1].startswith('@'):
        attr_key = key.split('.')[-1]
        return val.get(attr_key, default)
    return val if val is not None else default

def to_decimal(value, default=Decimal('0.00')):
    """Converte valor para Decimal com segurança."""
    if value is None: return default
    try:
        cleaned_value = str(value).strip().replace(',', '.')
        return Decimal(cleaned_value)
    except (InvalidOperation, ValueError, TypeError): return default

def to_int(value, default=None):
    """Converte valor para Inteiro com segurança."""
    if value is None: return default
    try: return int(value)
    except (ValueError, TypeError):
        try: return int(float(value))
        except (ValueError, TypeError): return default

def to_boolean(value, default=False):
    """Converte valor para Boolean com segurança."""
    if value is None: return default
    val_str = str(value).strip().lower()
    if val_str in ['1', 'true', 'sim', 's', 'yes', 'verdadeiro']: return True
    if val_str in ['0', 'false', 'nao', 'n', 'não', 'no', 'falso']: return False
    return default

def parse_datetime(value, default=None):
    """Converte string de data/hora para objeto datetime."""
    if not value: return default
    try: return date_parser.parse(value)
    except (ValueError, TypeError, OverflowError): return default

def parse_date(value, default=None):
    """Converte string de data para objeto date."""
    dt = parse_datetime(value)
    return dt.date() if dt else default

def parse_time(value, default=None):
    """Converte string de hora para objeto time."""
    if isinstance(value, str) and len(value) >= 8:
        try: return date_parser.parse(value).time()
        except (ValueError, TypeError): pass
    dt = parse_datetime(value)
    return dt.time() if dt else default

def parse_endereco(endereco_dict):
    """Extrai dados de um bloco de endereço do XML."""
    if not isinstance(endereco_dict, dict): return {}
    # Usa a função safe_get definida acima
    return {
        'logradouro': safe_get(endereco_dict, 'xLgr'), 'numero': safe_get(endereco_dict, 'nro'),
        'complemento': safe_get(endereco_dict, 'xCpl'), 'bairro': safe_get(endereco_dict, 'xBairro'),
        'codigo_municipio': safe_get(endereco_dict, 'cMun'), 'nome_municipio': safe_get(endereco_dict, 'xMun'),
        'cep': safe_get(endereco_dict, 'CEP'), 'uf': safe_get(endereco_dict, 'UF'),
        'codigo_pais': safe_get(endereco_dict, 'cPais', default='1058'),
        'nome_pais': safe_get(endereco_dict, 'xPais', default='BRASIL'),
    }

# --- Fim das Helper Functions ---
# ===============================================================
# ==> UPLOAD e PROCESSAMENTO de XML
# ===============================================================

# MUDANÇA: Herdar de GenericViewSet para ter acesso a get_serializer
class UnifiedUploadViewSet(viewsets.GenericViewSet):
    """
    API para upload e processamento unificado de arquivos XML.
    Detecta automaticamente o tipo de XML e direciona para o parser correto.
    """
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]
    serializer_class = UploadXMLSerializer # Define o serializer padrão

    @swagger_auto_schema(
        operation_description="Envie arquivos XML para processamento automático",
        request_body=UploadXMLSerializer,
        responses={
            200: openapi.Response('Processado com sucesso (Atualização)', examples={'application/json': {'message': 'CT-e reprocessado com sucesso', 'id': 'uuid', 'chave': '...', 'reprocessamento': True}}),
            201: openapi.Response('Processado com sucesso (Criação)', examples={'application/json': {'message': 'CT-e processado com sucesso', 'id': 'uuid', 'chave': '...', 'reprocessamento': False}}),
            202: openapi.Response('Evento recebido, mas sem ação direta no DB ou falha na SEFAZ', examples={'application/json': {'message': 'Evento recebido...', 'warning': '...'}}),
            400: openapi.Response('Erro nos dados ou no arquivo (Bad Request)', examples={'application/json': {'error': 'Mensagem de erro detalhada'}}),
            500: openapi.Response('Erro interno no processamento (Internal Server Error)', examples={'application/json': {'error': 'Mensagem de erro interna', 'details': '...'}})
        }
    )
    # O método 'create' é mapeado para POST por padrão quando herdamos mixins.CreateModelMixin
    # Como não estamos usando o mixin, mas sim GenericViewSet, a definição explícita
    # do método 'create' funciona corretamente para lidar com POST na URL base do ViewSet.
    def create(self, request):
        """Recebe e processa o upload de XML (single file)."""
        # MUDANÇA: Usar self.get_serializer() que agora existe devido a GenericViewSet
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        arquivo_principal = serializer.validated_data['arquivo_xml']
        arquivo_retorno = serializer.validated_data.get('arquivo_xml_retorno')

        try:
            # Ler o conteúdo do XML principal com tratamento de encoding
            try:
                arquivo_principal.seek(0) # Garante leitura do início
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
            except Exception as read_err:
                 return Response({"error": f"Erro ao ler o arquivo principal: {str(read_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


            # Ler o conteúdo do XML de retorno, se existir
            xml_retorno_content = None
            if arquivo_retorno:
                try:
                    arquivo_retorno.seek(0)
                    xml_retorno_content = arquivo_retorno.read().decode('utf-8')
                except UnicodeDecodeError:
                    try:
                        arquivo_retorno.seek(0)
                        xml_retorno_content = arquivo_retorno.read().decode('latin-1')
                    except Exception as decode_err:
                        print(f"Warning: Erro ao decodificar arquivo de retorno: {str(decode_err)}")
                        xml_retorno_content = None # Continua sem o retorno
                except Exception as read_err:
                    print(f"Warning: Erro ao ler arquivo de retorno: {str(read_err)}")
                    xml_retorno_content = None # Continua sem o retorno

            # Parse inicial para detecção de tipo
            try:
                xml_dict_preview = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                root_tag_com_ns = next(iter(xml_dict_preview), None)

                if not root_tag_com_ns:
                     return Response({"error": "Não foi possível identificar a tag raiz do XML."}, status=status.HTTP_400_BAD_REQUEST)

                # MUDANÇA: Extrai o nome local da tag (ignora namespace)
                if ':' in root_tag_com_ns:
                    root_tag = root_tag_com_ns.split(':')[-1]
                else:
                    root_tag = root_tag_com_ns

                print(f"INFO: Upload - Tag raiz detectada (sem NS): {root_tag}")

                # Direciona para o processador correto usando a tag SEM namespace
                if root_tag in ('CTe', 'procCTe', 'cteProc'):
                    return self._process_cte(xml_content, arquivo_principal, xml_dict_preview)
                elif root_tag in ('MDFe', 'procMDFe', 'mdfeProc'):
                    return self._process_mdfe(xml_content, arquivo_principal, xml_dict_preview)
                elif root_tag in ('eventoCTe', 'procEventoCTe', 'eventoMDFe', 'procEventoMDFe', 'retEventoCTe', 'retEventoMDFe'):
                    # Passa o nome original do arquivo para possível referência no parser de evento
                    return self._process_evento(xml_content, xml_retorno_content, arquivo_principal)
                else:
                    return Response({
                        "error": f"Tipo de documento XML não reconhecido. Tag raiz original: '{root_tag_com_ns}'. Arquivos suportados: CT-e, MDF-e ou Eventos."
                    }, status=status.HTTP_400_BAD_REQUEST)

            except Exception as parse_err:
                print(f"ERRO (Upload - Parse XML): {parse_err}")
                traceback.print_exc()
                return Response({
                    "error": f"Não foi possível parsear o XML para identificar o tipo. Erro: {str(parse_err)}. Verifique se o arquivo XML está bem formado."
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            print(f"ERRO (Upload - Geral): {e}")
            traceback.print_exc()
            return Response({
                "error": f"Erro inesperado ao processar o upload: {str(e)}",
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # --- Métodos Auxiliares Internos (sem alterações significativas, mantidos) ---

    def _get_chave_from_dict(self, xml_dict, tipo_doc):
        """ Tenta extrair a chave de acesso do dicionário XML parseado. """
        tipo_doc_lower = tipo_doc.lower()
        tag_inf = f'inf{tipo_doc_lower}'
        prefixo = tipo_doc

        try:
            inf_node = safe_get(xml_dict, f'proc{tipo_doc}.{tipo_doc}.{tag_inf}') or \
                       safe_get(xml_dict, f'{tipo_doc_lower}Proc.{tipo_doc}.{tag_inf}') or \
                       safe_get(xml_dict, f'{tipo_doc}.{tag_inf}') or \
                       safe_get(xml_dict, f'{tag_inf}') # Tenta direto na raiz se não for proc*

            if not inf_node or not isinstance(inf_node, dict) or '@Id' not in inf_node:
                print(f"DEBUG (get_chave_dict): Nó <{tag_inf}> ou atributo @Id não encontrado.")
                return None

            id_completo = inf_node['@Id']
            if not isinstance(id_completo, str) or len(id_completo) < 44:
                 print(f"DEBUG (get_chave_dict): Atributo Id inválido: {id_completo}")
                 return None

            chave_numerica = ''.join(filter(str.isdigit, id_completo))
            if len(chave_numerica) == 44:
                 if id_completo[len(prefixo):] == chave_numerica and id_completo.startswith(prefixo):
                     return chave_numerica
                 else:
                     # Às vezes o ID não tem o prefixo 'CTe'/'MDFe', mas a chave está lá
                     print(f"Warning (get_chave_dict): Id '{id_completo}' não tem o formato esperado '{prefixo}<chave>', mas 44 dígitos foram encontrados.")
                     return chave_numerica
            else:
                 print(f"DEBUG (get_chave_dict): Não extraiu 44 dígitos do Id: {id_completo}")
                 return None

        except Exception as e:
            print(f"Erro (get_chave_dict {tipo_doc}): {e}")
            return None

    def _get_chave_from_regex(self, xml_content, tipo_doc):
        """ Tenta extrair a chave usando regex como fallback. """
        tag_inf = f'inf{tipo_doc}'
        pattern = rf'<{tag_inf}[^>]*\sId\s*=\s*["\']{tipo_doc}(\d{{44}})["\']'
        match = re.search(pattern, xml_content, re.IGNORECASE)

        if match:
            return match.group(1)
        else:
            pattern_sem_prefixo = rf'<{tag_inf}[^>]*\sId\s*=\s*["\'](\d{{44}})["\']'
            match_sem_prefixo = re.search(pattern_sem_prefixo, xml_content, re.IGNORECASE)
            if match_sem_prefixo:
                print(f"Warning (get_chave_regex): Chave {tipo_doc} encontrada sem prefixo no Id.")
                return match_sem_prefixo.group(1)
            return None

    @transaction.atomic # Processamento do documento deve ser atômico
    def _process_cte(self, xml_content, arquivo_obj, xml_dict):
        """ Processa um XML de CT-e. """
        chave = self._get_chave_from_dict(xml_dict, 'CTe') or self._get_chave_from_regex(xml_content, 'CTe')
        if not chave:
            return Response({"error": "Não foi possível identificar a chave do CT-e no XML."}, status=status.HTTP_400_BAD_REQUEST)

        versao = safe_get(xml_dict, 'procCTe.@versao') or \
                 safe_get(xml_dict, 'cteProc.@versao') or \
                 safe_get(xml_dict, 'CTe.@versao') or \
                 safe_get(xml_dict, 'CTe.infCte.@versao') or '4.00'

        try:
            cte, created = CTeDocumento.objects.update_or_create(
                chave=chave,
                defaults={'xml_original': xml_content, 'arquivo_xml': arquivo_obj, 'processado': False, 'versao': versao}
            )
            reprocessamento = not created
            print(f"INFO: CT-e {chave} {'criado' if created else 'encontrado'}.")
        except Exception as db_err:
            print(f"ERRO DB (CT-e {chave}): {db_err}")
            traceback.print_exc()
            return Response({"error": f"Erro DB ao salvar CT-e: {str(db_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = parse_cte_completo(cte)
            if result:
                print(f"INFO: parse_cte_completo OK para CT-e {chave}.")
                return Response({
                    "message": f"CT-e {'reprocessado' if reprocessamento else 'processado'} com sucesso",
                    "id": str(cte.id), "chave": cte.chave, "reprocessamento": reprocessamento
                }, status=status.HTTP_200_OK if reprocessamento else status.HTTP_201_CREATED)
            else:
                print(f"ERROR: parse_cte_completo FALHOU para CT-e {chave}.")
                return Response({"error": "Falha no processamento detalhado do CT-e."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            print(f"ERRO (parse_cte_completo {chave}): {parse_err}")
            traceback.print_exc()
            cte.processado = False; cte.save(update_fields=['processado'])
            return Response({"error": f"Erro ao processar dados do CT-e: {str(parse_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @transaction.atomic
    def _process_mdfe(self, xml_content, arquivo_obj, xml_dict):
        """ Processa um XML de MDF-e. """
        chave = self._get_chave_from_dict(xml_dict, 'MDFe') or self._get_chave_from_regex(xml_content, 'MDFe')
        if not chave:
            return Response({"error": "Não foi possível identificar a chave do MDF-e no XML."}, status=status.HTTP_400_BAD_REQUEST)

        versao = safe_get(xml_dict, 'procMDFe.@versao') or \
                 safe_get(xml_dict, 'mdfeProc.@versao') or \
                 safe_get(xml_dict, 'MDFe.@versao') or \
                 safe_get(xml_dict, 'MDFe.infMDFe.@versao') or '3.00'

        try:
            mdfe, created = MDFeDocumento.objects.update_or_create(
                chave=chave,
                defaults={'xml_original': xml_content, 'arquivo_xml': arquivo_obj, 'processado': False, 'versao': versao}
            )
            reprocessamento = not created
            print(f"INFO: MDF-e {chave} {'criado' if created else 'encontrado'}.")
        except Exception as db_err:
            print(f"ERRO DB (MDF-e {chave}): {db_err}")
            traceback.print_exc()
            return Response({"error": f"Erro DB ao salvar MDF-e: {str(db_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = parse_mdfe_completo(mdfe)
            if result:
                print(f"INFO: parse_mdfe_completo OK para MDF-e {chave}.")
                return Response({
                    "message": f"MDF-e {'reprocessado' if reprocessamento else 'processado'} com sucesso",
                    "id": str(mdfe.id), "chave": mdfe.chave, "reprocessamento": reprocessamento
                }, status=status.HTTP_200_OK if reprocessamento else status.HTTP_201_CREATED)
            else:
                print(f"ERROR: parse_mdfe_completo FALHOU para MDF-e {chave}.")
                return Response({"error": "Falha no processamento detalhado do MDF-e."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            print(f"ERRO (parse_mdfe_completo {chave}): {parse_err}")
            traceback.print_exc()
            mdfe.processado = False; mdfe.save(update_fields=['processado'])
            return Response({"error": f"Erro ao processar dados do MDF-e: {str(parse_err)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Não precisa de @transaction.atomic aqui, pois parse_evento já usa dentro de seus handlers
    def _process_evento(self, xml_content, xml_retorno_content, arquivo_obj):
        """ Processa um XML de evento. """
        try:
            result = parse_evento(xml_content, xml_retorno_content)

            if result is None:
                print(f"INFO: parse_evento retornou None.")
                return Response({
                    "message": "Evento recebido, mas não processado ou não confirmado pela SEFAZ.",
                    "warning": "Verifique o tipo de evento e o XML de retorno (se aplicável)."
                }, status=status.HTTP_202_ACCEPTED)

            evento_tipo = "Evento"
            doc_chave = "N/A"
            doc_id = None

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
            elif result is True: # CCE ou Encerramento MDF-e (que retorna True se bem sucedido)
                 evento_tipo = "Evento processado"
                 try:
                     xml_dict = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                     evento_raiz = next((v for k, v in xml_dict.items() if k.endswith('EventoCTe') or k.endswith('EventoMDFe')), None)
                     if evento_raiz:
                         infEvento = safe_get(evento_raiz, 'infEvento')
                         if infEvento:
                             doc_chave = infEvento.get('chCTe') or infEvento.get('chMDFe') or "N/A"
                             tpEvento = infEvento.get('tpEvento', '')
                             evento_tipo = f"Evento {tpEvento} processado"
                             # Tenta pegar o ID do documento principal se a chave foi encontrada
                             if doc_chave != "N/A":
                                doc_obj = CTeDocumento.objects.filter(chave=doc_chave).first() or \
                                          MDFeDocumento.objects.filter(chave=doc_chave).first()
                                if doc_obj: doc_id = str(doc_obj.id)
                 except Exception as e: print(f"WARN: Não foi possível extrair detalhes do evento True: {e}")

            print(f"INFO: Evento processado: {evento_tipo} para documento {doc_chave}")
            return Response({
                "message": f"{evento_tipo} processado com sucesso.",
                "documento_chave": doc_chave,
                "documento_id": doc_id,
            }, status=status.HTTP_201_CREATED)

        except ValueError as e:
            print(f"ERRO (parse_evento - Validação): {e}")
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            print(f"ERRO (parse_evento - Inesperado): {e}")
            traceback.print_exc()
            return Response({"error": f"Erro inesperado ao processar evento: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    # --- Action para Upload em Lote ---
    @action(detail=False, methods=['post'], serializer_class=BatchUploadXMLSerializer)
    def batch_upload(self, request):
        """ Recebe e processa o upload em lote de múltiplos arquivos XML. """
        serializer = self.get_serializer(data=request.data) # Usa o serializer da action
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        arquivos = serializer.validated_data['arquivos_xml']
        resultados = []
        total_success = 0
        total_error = 0
        total_skipped = 0

        for arquivo in arquivos:
            resultado_processamento = {'arquivo': arquivo.name, 'status': 'erro', 'erro': 'Erro desconhecido'}
            xml_content = None
            xml_dict = None
            try:
                # Leitura e decode
                arquivo.seek(0)
                try: xml_content = arquivo.read().decode('utf-8')
                except UnicodeDecodeError:
                    try: arquivo.seek(0); xml_content = arquivo.read().decode('latin-1')
                    except Exception as decode_err:
                        resultado_processamento['erro'] = f"Erro decode: {str(decode_err)}"
                        total_skipped += 1; print(f"SKIP Lote Decode: {arquivo.name}"); resultados.append(resultado_processamento); continue
                except Exception as read_err:
                    resultado_processamento['erro'] = f"Erro leitura: {str(read_err)}"
                    total_skipped += 1; print(f"SKIP Lote Leitura: {arquivo.name}"); resultados.append(resultado_processamento); continue

                # Parsing inicial e detecção de tipo
                try:
                    xml_dict = xmltodict.parse(xml_content, process_namespaces=True, namespaces={'': None})
                    root_tag_com_ns = next(iter(xml_dict), None)
                    if not root_tag_com_ns: raise ValueError("XML sem tag raiz.")
                    root_tag = root_tag_com_ns.split(':')[-1] if ':' in root_tag_com_ns else root_tag_com_ns

                    # Chamada ao processador apropriado
                    response = None
                    if root_tag in ('CTe', 'procCTe', 'cteProc'): response = self._process_cte(xml_content, arquivo, xml_dict)
                    elif root_tag in ('MDFe', 'procMDFe', 'mdfeProc'): response = self._process_mdfe(xml_content, arquivo, xml_dict)
                    elif root_tag in ('eventoCTe', 'procEventoCTe', 'eventoMDFe', 'procEventoMDFe', 'retEventoCTe', 'retEventoMDFe'): response = self._process_evento(xml_content, None, arquivo)
                    else: response = Response({"error": f"Tipo não reconhecido ({root_tag_com_ns})"}, status=400)

                    # Análise da resposta
                    if status.is_success(response.status_code):
                        resultado_processamento = {
                            'arquivo': arquivo.name, 'status': 'sucesso',
                            'mensagem': response.data.get('message', 'Processado'),
                            'chave': response.data.get('chave') or response.data.get('documento_chave'),
                            'tipo': root_tag }
                        total_success += 1
                    else:
                        resultado_processamento['erro'] = response.data.get('error', f'Status {response.status_code}')
                        total_error += 1

                except Exception as process_err:
                    print(f"ERRO Lote Proc ({arquivo.name}): {process_err}")
                    # traceback.print_exc() # Descomentar para debug detalhado
                    resultado_processamento['erro'] = f"Erro processamento: {str(process_err)}"
                    total_error += 1

            except Exception as e:
                 print(f"ERRO Crítico Lote ({arquivo.name}): {e}")
                 # traceback.print_exc()
                 resultado_processamento['erro'] = f"Erro crítico upload: {str(e)}"
                 total_skipped += 1

            resultados.append(resultado_processamento)

        final_status = status.HTTP_200_OK if total_error == 0 and total_skipped == 0 else status.HTTP_207_MULTI_STATUS
        return Response({
            'message': f"Processamento em lote concluído.",
            'sucesso': total_success,
            'erros': total_error,
            'ignorados': total_skipped,
            'resultados_detalhados': resultados
        }, status=final_status)