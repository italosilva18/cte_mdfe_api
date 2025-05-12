# transport/views/upload_views.py

import os
import json
import traceback
import re
from decimal import Decimal, InvalidOperation
from io import BytesIO 

from django.conf import settings
from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

import xmltodict
from dateutil import parser as date_parser

from ..serializers.upload_serializers import UploadXMLSerializer, BatchUploadXMLSerializer
from ..models import (
    CTeDocumento, CTeCancelamento,
    MDFeDocumento, MDFeCancelamento, MDFeCancelamentoEncerramento, MDFeCondutor
)
from ..services.parser_cte import parse_cte_completo
from ..services.parser_mdfe import parse_mdfe_completo
from ..services.parser_eventos import parse_evento

# --- Helper Functions ---
def safe_get(data_dict, key, default=None):
    keys = key.split('.')
    val = data_dict
    for k_part in keys:
        # Para lidar com namespaces, verificamos se alguma chave no dict atual termina com a parte da chave desejada
        if isinstance(val, dict):
            found_key = None
            if k_part in val: # Tentativa direta primeiro
                found_key = k_part
            else: # Tenta encontrar ignorando namespace
                for dict_key in val.keys():
                    if dict_key.endswith(f':{k_part}') or dict_key == k_part:
                        found_key = dict_key
                        break
            if found_key:
                val = val.get(found_key)
            else:
                return default # Chave não encontrada
            if val is None: return default
        elif isinstance(val, list) and k_part.isdigit() and int(k_part) < len(val):
            val = val[int(k_part)]
        else:
            return default # Não é dict nem lista acessível
            
    if isinstance(val, dict) and '#text' in val and len(val) == 1: return val['#text']
    if isinstance(val, dict) and keys[-1].startswith('@'):
        attr_key_no_ns = keys[-1] # o '@' já está no nome da chave em xmltodict
        found_attr_key = None
        if attr_key_no_ns in val:
            found_attr_key = attr_key_no_ns
        else:
            for dict_key in val.keys():
                 if dict_key.endswith(f':{attr_key_no_ns}') or dict_key == attr_key_no_ns:
                      found_attr_key = dict_key
                      break
        return val.get(found_attr_key, default) if found_attr_key else default
        
    return val if val is not None else default

def to_decimal(value, default=Decimal('0.00')):
    if value is None: return default
    try: return Decimal(str(value).strip().replace(',', '.'))
    except: return default

def to_int(value, default=None):
    if value is None: return default
    try: return int(value)
    except:
        try: return int(float(value))
        except: return default

def parse_datetime(value, default=None):
    if not value: return default
    try: return date_parser.parse(value)
    except: return default
# --- Fim Helper Functions ---

def _get_chave_from_filename(filename):
    if not filename: return None
    match = re.search(r'(\d{44})', filename)
    return match.group(1) if match else None

def _get_tag_sem_namespace(tag_com_ns):
    """Retorna a tag sem o prefixo de namespace, se houver."""
    return tag_com_ns.split(':')[-1] if ':' in tag_com_ns else tag_com_ns

class UnifiedUploadViewSet(viewsets.GenericViewSet):
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'batch_upload':
            return BatchUploadXMLSerializer
        return UploadXMLSerializer

    def _read_xml_file_content(self, file_obj):
        if not file_obj: return None, "Objeto de arquivo não fornecido."
        try:
            file_obj.seek(0)
            content = None
            error_msg = None
            try:
                content = file_obj.read().decode('utf-8').strip()
            except UnicodeDecodeError:
                file_obj.seek(0)
                content = file_obj.read().decode('latin-1').strip()
            
            # Remover BOM (Byte Order Mark) se presente
            if content and content.startswith('\ufeff'):
                content = content[1:]
            return content, None
        except Exception as e:
            return None, f"Erro ao ler conteúdo do arquivo {file_obj.name}: {str(e)}"

    def _get_chave_from_dict(self, xml_dict, tipo_doc_prefix):
        # Usado para CT-e e MDF-e principais
        tipo_doc_lower = tipo_doc_prefix.lower()
        
        # Tenta encontrar 'infCTe' ou 'infMDFe'
        # safe_get agora lida com namespaces
        inf_node_data = safe_get(xml_dict, f'proc{tipo_doc_prefix}.{tipo_doc_prefix}.inf{tipo_doc_lower}') or \
                        safe_get(xml_dict, f'{tipo_doc_lower}Proc.{tipo_doc_prefix}.inf{tipo_doc_lower}') or \
                        safe_get(xml_dict, f'{tipo_doc_prefix}.inf{tipo_doc_lower}')
        
        if not inf_node_data or not isinstance(inf_node_data, dict):
            return None

        id_completo = safe_get(inf_node_data, '@Id') # safe_get lida com namespace no atributo
        if id_completo and isinstance(id_completo, str):
            chave_numerica = ''.join(filter(str.isdigit, id_completo))
            if len(chave_numerica) == 44:
                return chave_numerica
        return None

    def _get_chave_from_regex(self, xml_content, tipo_doc_prefix_or_evento_base):
        # Para documentos principais
        pattern_id_principal = rf'<inf(?:{tipo_doc_prefix_or_evento_base})[^>]*\sId\s*=\s*["\'](?:{tipo_doc_prefix_or_evento_base})?(\d{{44}})["\']'
        match_id = re.search(pattern_id_principal, xml_content, re.IGNORECASE)
        if match_id and len(match_id.group(1)) == 44:
            return match_id.group(1)

        # Para chaves de eventos (chCTe, chMDFe em infEvento)
        # Esta regex é mais genérica e pode ser usada para extrair a chave do documento principal de um evento
        pattern_ch_evento = rf'<infEvento[^>]*>.*?<ch(?:CTe|MDFe)>(\d{{44}})</ch(?:CTe|MDFe)>.*?</infEvento>'
        match_ch_evento = re.search(pattern_ch_evento, xml_content, re.DOTALL | re.IGNORECASE)
        if match_ch_evento and len(match_ch_evento.group(1)) == 44:
            return match_ch_evento.group(1)
            
        return None
        
    def _identificar_xml_e_chave(self, filename, content):
        chave_doc = None
        tipo_xml = "DESCONHECIDO"
        is_retorno_confirmado = False # True se for um retEvento* ou procEvento* com confirmação SEFAZ
        xml_dict = None
        root_tag_no_ns = None

        try:
            if not content: # Se o conteúdo estiver vazio após a leitura
                tipo_xml = "CONTEUDO_VAZIO"
                return tipo_xml, None, False, None, None

            xml_dict = xmltodict.parse(content, process_namespaces=True, namespaces={'': None})
            root_tag_com_ns = next(iter(xml_dict), "")
            root_tag_no_ns = _get_tag_sem_namespace(root_tag_com_ns)

            # 1. Documentos Principais (CT-e, MDF-e)
            if root_tag_no_ns in ('CTe', 'procCTe', 'cteProc'):
                tipo_xml = "CT"
                chave_doc = self._get_chave_from_dict(xml_dict, "CTe") or self._get_chave_from_regex(content, "CTe")
            elif root_tag_no_ns in ('MDFe', 'procMDFe', 'mdfeProc'):
                tipo_xml = "MDFE"
                chave_doc = self._get_chave_from_dict(xml_dict, "MDFe") or self._get_chave_from_regex(content, "MDFe")
            
            # 2. Eventos (envio, procEvento, retEvento)
            # Prioriza a identificação mais específica (procEvento, retEvento) sobre evento de envio puro
            elif root_tag_no_ns in ('procEventoCTe', 'procEventoMDFe'):
                is_retorno_confirmado = True # procEvento já contém a resposta
                path_prefix_ns = root_tag_com_ns # Mantenha o namespace para safe_get
                
                # Tentativa 1: Estrutura padrão <procEvento*><evento*><infEvento>
                evento_node_name_sem_ns = 'eventoCTe' if 'CTe' in root_tag_no_ns else 'eventoMDFe'
                inf_evento = safe_get(xml_dict, f'{path_prefix_ns}.{evento_node_name_sem_ns}.infEvento')
                
                # Tentativa 2: Estrutura alternativa <procEvento*><infEvento> (sem o wrapper <evento*>)
                if not inf_evento:
                    inf_evento = safe_get(xml_dict, f'{path_prefix_ns}.infEvento')
                    if inf_evento: print(f"INFO (Identificar): Encontrado <infEvento> diretamente sob <{root_tag_no_ns}> para {filename}")

                if inf_evento:
                    chave_doc_principal_evento = safe_get(inf_evento, 'chCTe') or safe_get(inf_evento, 'chMDFe')
                    tp_evento = safe_get(inf_evento, 'tpEvento')
                    if chave_doc_principal_evento and tp_evento:
                        chave_doc = chave_doc_principal_evento
                        doc_tipo_base = "CT" if safe_get(inf_evento, 'chCTe') else "MDFE"
                        tipo_xml = f"PROC_EVENTO_{doc_tipo_base}_{tp_evento}"
                        print(f"INFO (Identificar): Arq {filename} (root: {root_tag_no_ns}) classificado como {tipo_xml}, Chave: {chave_doc}")
            
            elif root_tag_no_ns in ('retEventoCTe', 'retEventoMDFe'):
                is_retorno_confirmado = True
                path_prefix_ns = root_tag_com_ns
                inf_evento_ret = safe_get(xml_dict, f'{path_prefix_ns}.infEvento')
                if inf_evento_ret:
                    chave_doc = safe_get(inf_evento_ret, 'chCTe') or safe_get(inf_evento_ret, 'chMDFe')
                    tp_evento = safe_get(inf_evento_ret, 'tpEvento')
                    if chave_doc and tp_evento:
                        doc_tipo_base = "CT" if safe_get(inf_evento_ret, 'chCTe') else "MDFE"
                        tipo_xml = f"RET_EVENTO_{doc_tipo_base}_{tp_evento}"
                elif safe_get(xml_dict, f'{path_prefix_ns}.infProt'): # Fallback para retornos mais simples
                    inf_prot = safe_get(xml_dict, f'{path_prefix_ns}.infProt')
                    chave_doc = safe_get(inf_prot, 'chCTe') or safe_get(inf_prot, 'chMDFe')
                    if chave_doc:
                         doc_tipo_base = "CT" if safe_get(inf_prot, 'chCTe') else "MDFE"
                         tipo_xml = f"RET_EVENTO_{doc_tipo_base}_GENERICO"

            elif root_tag_no_ns in ('eventoCTe', 'eventoMDFe'): # Evento de envio puro
                path_prefix_ns = root_tag_com_ns
                inf_evento = safe_get(xml_dict, f'{path_prefix_ns}.infEvento')
                if inf_evento:
                    chave_doc_principal_evento = safe_get(inf_evento, 'chCTe') or safe_get(inf_evento, 'chMDFe')
                    tp_evento = safe_get(inf_evento, 'tpEvento')
                    if chave_doc_principal_evento and tp_evento:
                        chave_doc = chave_doc_principal_evento
                        doc_tipo_base = "CT" if safe_get(inf_evento, 'chCTe') else "MDFE"
                        tipo_xml = f"EVENTO_{doc_tipo_base}_{tp_evento}"
                        is_retorno_confirmado = False # É apenas o envio
            
            if not chave_doc: # Fallback final para chave no nome do arquivo
                chave_doc = _get_chave_from_filename(filename)
                if chave_doc and tipo_xml == "DESCONHECIDO": # Se encontrou chave no nome e ainda não classificou
                    if "procEvento" in filename.lower() or "retEvento" in filename.lower():
                        is_retorno_confirmado = True; tipo_xml = "RET_EVENTO_NOME" # Indica que é um retorno/processado
                    elif "evento" in filename.lower(): # Se nome tem "evento" mas não "proc" ou "ret"
                        tipo_xml = "EVENTO_NOME" # Evento de envio por nome
                    # Se tem chave no nome, mas tipo ainda desconhecido e não parece evento/retorno pelo nome
                    # Deixa como DESCONHECIDO, o batch_upload tentará como principal se o root_tag for CT/MDFE
                    elif root_tag_no_ns in ('CTe', 'procCTe', 'cteProc', 'MDFe', 'procMDFe', 'mdfeProc'):
                        # Isso não deveria acontecer se a extração por dict/regex funcionou
                        print(f"WARN (Identificar-FallbackNome): Arq {filename} com chave {chave_doc} (nome) e root '{root_tag_no_ns}' suspeito de ser principal, mas não classificado antes.")
                        # tipo_xml poderia ser CT ou MDFE aqui se tivéssemos certeza, mas _get_chave_from_dict/regex deveriam ter pego.

        except Exception as e:
            print(f"WARN (Identificar XML): Erro crítico ao parsear/identificar {filename}: {e}.")
            traceback.print_exc()
            # Tenta pegar chave pelo nome como último recurso
            if not chave_doc: chave_doc = _get_chave_from_filename(filename)
            if chave_doc and ("ret" in filename.lower() or "procevento" in filename.lower()) and tipo_xml == "DESCONHECIDO":
                is_retorno_confirmado = True; tipo_xml = "RET_EVENTO_NOME"
        
        if tipo_xml == "DESCONHECIDO" and chave_doc:
            print(f"WARN (Lote - Identificar Final): Arq {filename} com chave {chave_doc} (root: {root_tag_no_ns}), mas tipo final DESCONHECIDO.")

        return tipo_xml, chave_doc, is_retorno_confirmado, xml_dict, root_tag_no_ns


    @swagger_auto_schema(
        operation_description="Envie um arquivo XML principal e opcionalmente um XML de retorno.",
        request_body=UploadXMLSerializer,
        responses={200: "OK", 201: "Criado", 202: "Aceito", 400: "Erro", 500: "Erro Servidor"}
    )
    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        arquivo_principal_obj = serializer.validated_data['arquivo_xml']
        arquivo_retorno_obj = serializer.validated_data.get('arquivo_xml_retorno')
        
        xml_content_principal, error_msg_p = self._read_xml_file_content(arquivo_principal_obj)
        if error_msg_p:
            return Response({"error": error_msg_p, "filename": arquivo_principal_obj.name}, status=status.HTTP_400_BAD_REQUEST)

        xml_content_retorno = None
        if arquivo_retorno_obj:
            xml_content_retorno, error_msg_r = self._read_xml_file_content(arquivo_retorno_obj)
            if error_msg_r:
                print(f"Warning (Upload Individual): Erro ao ler XML de retorno ({arquivo_retorno_obj.name}): {error_msg_r}")

        try:
            tipo_detectado, _chave_detectada, _is_ret, xml_dict_principal, root_tag_principal = self._identificar_xml_e_chave(arquivo_principal_obj.name, xml_content_principal)

            if not xml_dict_principal or not root_tag_principal:
                 return Response({"error": "Tag raiz do XML principal não identificada ou XML inválido.", "filename": arquivo_principal_obj.name}, status=status.HTTP_400_BAD_REQUEST)

            print(f"INFO: Upload Individual - Raiz: {root_tag_principal}, Arq: {arquivo_principal_obj.name}, Tipo Det.: {tipo_detectado}")

            if tipo_detectado == "CT": # Usa o tipo detectado
                return self._process_cte(xml_content_principal, arquivo_principal_obj, xml_dict_principal)
            elif tipo_detectado == "MDFE": # Usa o tipo detectado
                return self._process_mdfe(xml_content_principal, arquivo_principal_obj, xml_dict_principal)
            elif "EVENTO" in tipo_detectado: # Inclui PROC_EVENTO, RET_EVENTO, EVENTO
                 # Se for PROC_EVENTO ou RET_EVENTO, xml_content_retorno opcional é redundante mas não prejudica.
                 # Se for EVENTO puro, xml_content_retorno (se houver) será usado.
                return self._process_evento(xml_content_principal, xml_content_retorno, arquivo_principal_obj)
            else: # Fallback para root_tag se _identificar_xml_e_chave não foi conclusivo
                if root_tag_principal in ('CTe', 'procCTe', 'cteProc'): return self._process_cte(xml_content_principal, arquivo_principal_obj, xml_dict_principal)
                elif root_tag_principal in ('MDFe', 'procMDFe', 'mdfeProc'): return self._process_mdfe(xml_content_principal, arquivo_principal_obj, xml_dict_principal)
                return Response({
                    "error": f"Tipo de XML não reconhecido. Raiz: '{root_tag_principal}'. Tipo detectado: '{tipo_detectado}'", "filename": arquivo_principal_obj.name
                }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            print(f"ERRO (Upload Individual - Parse/Process): {e} para arq {arquivo_principal_obj.name}")
            traceback.print_exc()
            return Response({"error": f"Erro inesperado no processamento do XML: {str(e)}", "filename": arquivo_principal_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @transaction.atomic
    def _process_cte(self, xml_content, arquivo_obj, xml_dict_principal):
        # ... (Mantido, usar self._get_chave_from_dict e self._get_chave_from_regex)
        chave = self._get_chave_from_dict(xml_dict_principal, 'CTe') or self._get_chave_from_regex(xml_content, 'CTe')
        if not chave: return Response({"error": "Chave CT-e não identificada.", "filename": arquivo_obj.name}, status=status.HTTP_400_BAD_REQUEST)
        versao = safe_get(xml_dict_principal, 'CTe.infCte.@versao') or '4.00'
        try:
            cte, created = CTeDocumento.objects.update_or_create(chave=chave, defaults={'xml_original': xml_content, 'processado': False, 'versao': versao})
            if arquivo_obj and (created or not cte.arquivo_xml): cte.arquivo_xml.save(arquivo_obj.name, arquivo_obj, save=False) 
            cte.save()
        except Exception as db_err: return Response({"error": f"DB Error (CTe {chave}): {str(db_err)}", "filename": arquivo_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        try:
            if parse_cte_completo(cte):
                return Response({"message": f"CT-e {'reprocessado' if not created else 'processado'}.", "id": str(cte.id), "chave": cte.chave, "reprocessamento": not created, "filename": arquivo_obj.name}, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)
            return Response({"error": "Falha parser CT-e.", "chave": chave, "filename": arquivo_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            cte.processado = False; cte.save(update_fields=['processado'])
            return Response({"error": f"Erro parser CT-e: {str(parse_err)}", "chave": chave, "filename": arquivo_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @transaction.atomic
    def _process_mdfe(self, xml_content, arquivo_obj, xml_dict_principal):
        # ... (Mantido, usar self._get_chave_from_dict e self._get_chave_from_regex)
        chave = self._get_chave_from_dict(xml_dict_principal, 'MDFe') or self._get_chave_from_regex(xml_content, 'MDFe')
        if not chave: return Response({"error": "Chave MDF-e não identificada.", "filename": arquivo_obj.name}, status=status.HTTP_400_BAD_REQUEST)
        versao = safe_get(xml_dict_principal, 'MDFe.infMDFe.@versao') or '3.00'
        try:
            mdfe, created = MDFeDocumento.objects.update_or_create(chave=chave, defaults={'xml_original': xml_content, 'processado': False, 'versao': versao})
            if arquivo_obj and (created or not mdfe.arquivo_xml): mdfe.arquivo_xml.save(arquivo_obj.name, arquivo_obj, save=False)
            mdfe.save()
        except Exception as db_err: return Response({"error": f"DB Error (MDF-e {chave}): {str(db_err)}", "filename": arquivo_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        try:
            if parse_mdfe_completo(mdfe):
                return Response({"message": f"MDF-e {'reprocessado' if not created else 'processado'}.", "id": str(mdfe.id), "chave": mdfe.chave, "reprocessamento": not created, "filename": arquivo_obj.name}, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)
            return Response({"error": "Falha parser MDF-e.", "chave": chave, "filename": arquivo_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as parse_err:
            mdfe.processado = False; mdfe.save(update_fields=['processado'])
            return Response({"error": f"Erro parser MDF-e: {str(parse_err)}", "chave": chave, "filename": arquivo_obj.name}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _process_evento(self, xml_content_principal_evento, xml_content_retorno_opcional, arquivo_obj_principal_evento):
        # ... (Mantido, mas garantir que `parse_evento` em `services/parser_eventos.py` está robusto)
        # `parse_evento` deve ser capaz de usar `xml_content_principal_evento` se ele for um procEvento*
        # e `xml_content_retorno_opcional` for None.
        filename = arquivo_obj_principal_evento.name if arquivo_obj_principal_evento else "N/A"
        try:
            result = parse_evento(xml_content_principal_evento, xml_content_retorno_opcional) # `parse_evento` é chave aqui
            if result is None:
                 return Response({ "message": f"Evento (arq: {filename}) recebido, mas não efetivado.", "warning": "Verifique SEFAZ ou doc. principal."}, status=status.HTTP_202_ACCEPTED)
            # ... (Lógica de sucesso do evento como antes) ...
            evento_tipo_str, doc_chave_afetada, doc_id_afetado, dados_adicionais = "Evento", "N/A", None, {}
            if isinstance(result, CTeCancelamento): evento_tipo_str, doc_chave_afetada, doc_id_afetado, dados_adicionais['protocolo_evento'] = "Cancelamento CT-e", result.cte.chave, str(result.cte.id), result.n_prot_retorno
            elif isinstance(result, MDFeCancelamento): evento_tipo_str, doc_chave_afetada, doc_id_afetado, dados_adicionais['protocolo_evento'] = "Cancelamento MDF-e", result.mdfe.chave, str(result.mdfe.id), result.n_prot_retorno
            elif result is True : evento_tipo_str = "Evento Genérico Processado" # Melhorar
            return Response({
                "message": f"{evento_tipo_str} para '{doc_chave_afetada}' (arq: {filename}) processado.",
                "documento_chave": doc_chave_afetada, "documento_id": doc_id_afetado,
                "detalhes_evento": dados_adicionais, "filename": filename
            }, status=status.HTTP_201_CREATED)
        except ValueError as ve: return Response({"error": str(ve), "filename": filename}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            traceback.print_exc()
            return Response({"error": f"Erro ao processar evento: {str(e)}", "filename": filename}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    @swagger_auto_schema(
        # ... (schema para batch_upload mantido) ...
    )
    @action(detail=False, methods=['post'], serializer_class=BatchUploadXMLSerializer)
    def batch_upload(self, request):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        todos_arquivos_obj_list = request.FILES.getlist('arquivos_xml')
        if not todos_arquivos_obj_list:
            return Response({"error": "Nenhum arquivo XML fornecido."}, status=status.HTTP_400_BAD_REQUEST)

        resultados_finais = []
        sucesso_count, erro_count, ignorado_count = 0, 0, 0
        
        arquivos_classificados = []
        for arq_obj in todos_arquivos_obj_list:
            content, error_msg = self._read_xml_file_content(arq_obj)
            if error_msg:
                resultados_finais.append({'arquivo_principal_nome': arq_obj.name, 'status': 'ignorado', 'erro': error_msg})
                ignorado_count += 1; continue
            
            # CORREÇÃO: Chamada correta
            tipo, chave, is_ret, xml_dict, root_tag = self._identificar_xml_e_chave(arq_obj.name, content)
            
            arquivos_classificados.append({
                'obj': arq_obj, 'content': content, 'name': arq_obj.name, 
                'tipo_xml': tipo, 'chave_doc': chave, 
                'is_retorno_confirmado': is_ret, # Flag de _identificar_xml_e_chave
                'xml_dict': xml_dict, 'root_tag': root_tag
            })

        # Agrupar por chave
        arquivos_por_chave = {}
        # CORREÇÃO: Inicialização de arquivos_sem_chave_validos
        arquivos_sem_chave_validos = [] 

        for arq_info in arquivos_classificados:
            if arq_info['chave_doc']:
                chave = arq_info['chave_doc']
                if chave not in arquivos_por_chave:
                    arquivos_por_chave[chave] = {'principais': [], 'eventos_envio': [], 'retornos_e_proc_eventos': []}
                
                grupo = arquivos_por_chave[chave]
                if arq_info['tipo_xml'] in ["CT", "MDFE"]:
                    # Lógica para evitar duplicidade de principais, se necessário
                    if not any(p['name'] == arq_info['name'] for p in grupo['principais']):
                        grupo['principais'].append(arq_info)
                elif "PROC_EVENTO" in arq_info['tipo_xml'] or "RET_EVENTO" in arq_info['tipo_xml'] or arq_info['is_retorno_confirmado']:
                    grupo['retornos_e_proc_eventos'].append(arq_info)
                elif "EVENTO" in arq_info['tipo_xml']: # Evento de envio puro
                    grupo['eventos_envio'].append(arq_info)
                else: # DESCONHECIDO com chave
                    print(f"WARN (Lote - Agrupamento): Arq {arq_info['name']} com chave {chave} mas tipo {arq_info['tipo_xml']}. Tentando como principal.")
                    if not any(p['name'] == arq_info['name'] for p in grupo['principais']):
                         grupo['principais'].append(arq_info)
            else: # Sem chave
                if arq_info['tipo_xml'] in ["CT", "MDFE"]:
                     arquivos_sem_chave_validos.append(arq_info)
                elif arq_info['tipo_xml'] != "CONTEUDO_VAZIO": # Não ignorar conteúdo vazio silenciosamente
                    resultados_finais.append({'arquivo_principal_nome': arq_info['name'], 'status': 'ignorado', 'erro': f"Sem chave e tipo ({arq_info['tipo_xml']}) não é CT/MDFE principal.", 'chave': None})
                    ignorado_count += 1
        
        # Fase 2A: Processar todos os Documentos Principais PRIMEIRO
        for chave, grupo in arquivos_por_chave.items():
            # Ordenar principais: não-proc antes de proc (se houver essa distinção e ambos existirem)
            # Se houver múltiplos, processa apenas um (o primeiro ou o mais "completo")
            doc_principal_a_processar = None
            if grupo['principais']:
                # Heurística: se tiver um "procCTe" e um "CTe" para mesma chave, o "procCTe" é geralmente mais completo.
                # Se só tiver um, usa esse.
                grupo['principais'].sort(key=lambda x: 0 if 'proc' in x.get('root_tag', '').lower() else 1)
                doc_principal_a_processar = grupo['principais'][0] # Pega o mais provável de ser o completo
                
                # Marcar outros "principais" para a mesma chave como ignorados se não forem o escolhido
                for i, principal_cand in enumerate(grupo['principais']):
                    if i > 0: # Se não for o primeiro (escolhido)
                         resultados_finais.append({'arquivo_principal_nome': principal_cand['name'], 'status': 'ignorado', 
                                                   'erro': f'Múltiplos XMLs principais para chave {chave}, priorizando {doc_principal_a_processar["name"]}.', 'chave': chave})
                         ignorado_count += 1


            if doc_principal_a_processar:
                print(f"INFO (Lote - Fase 2A): Processando principal {doc_principal_a_processar['name']} para chave {chave}")
                resultado_p = {'arquivo_principal_nome': doc_principal_a_processar['name'], 'chave': chave, 'status': 'erro'}
                try:
                    resp_obj = None
                    # xml_dict já está em doc_principal_a_processar['xml_dict']
                    if doc_principal_a_processar['tipo_xml'] == "CT":
                        resp_obj = self._process_cte(doc_principal_a_processar['content'], doc_principal_a_processar['obj'], doc_principal_a_processar['xml_dict'])
                    elif doc_principal_a_processar['tipo_xml'] == "MDFE":
                        resp_obj = self._process_mdfe(doc_principal_a_processar['content'], doc_principal_a_processar['obj'], doc_principal_a_processar['xml_dict'])
                    else: 
                        resultado_p['erro'] = f"Tipo principal inesperado '{doc_principal_a_processar['tipo_xml']}' para processamento."
                        erro_count +=1; resultados_finais.append(resultado_p); continue
                    
                    if resp_obj and status.is_success(resp_obj.status_code):
                        resultado_p.update(resp_obj.data); resultado_p['status'] = 'sucesso'; sucesso_count += 1
                        grupo['principal_processado_ok'] = True # Flag para eventos
                    else:
                        msg_err = resp_obj.data.get('error', 'Falha processador doc. principal.') if resp_obj and resp_obj.data else 'Processador principal não retornou.'
                        resultado_p['erro'] = msg_err
                        if resp_obj and resp_obj.data and resp_obj.data.get('warning'): resultado_p['aviso'] = resp_obj.data.get('warning')
                        erro_count += 1
                except Exception as e_p:
                    resultado_p['erro'] = f"Exceção processando principal {doc_principal_a_processar['name']}: {str(e_p)}"; erro_count += 1
                resultados_finais.append(resultado_p)
            else: # Nenhum principal claro para esta chave, mas pode ter eventos
                grupo['principal_processado_ok'] = False # Ou True se confiamos que já existe no DB
                 # Se não há principal no lote, mas há eventos, precisamos verificar o DB.
                 # Para simplificar, se o principal não está no lote, assumimos que já está no DB ou o evento falhará.


        # Fase 2B: Processar Eventos (após todos os principais do lote terem sido tentados)
        for chave, grupo in arquivos_por_chave.items():
            eventos_envio_restantes = list(grupo['eventos_envio'])
            
            # Processar retornos e procEventos primeiro, tentando emparelhar com envios puros
            for ret_proc_info in grupo['retornos_e_proc_eventos']:
                xml_envio_content = None
                obj_envio = None
                nome_arq_envio_final = None
                
                xml_retorno_content_para_parser = ret_proc_info['content'] # Para RET_EVENTO ou PROC_EVENTO
                nome_arq_retorno_final_display = ret_proc_info['name']

                if "PROC_EVENTO" in ret_proc_info['tipo_xml']:
                    # Para PROC_EVENTO, o próprio arquivo é o "principal" para parse_evento, e também o "retorno"
                    xml_envio_content = ret_proc_info['content']
                    obj_envio = ret_proc_info['obj']
                    nome_arq_envio_final = ret_proc_info['name']
                    # nome_arq_retorno_final_display já é ret_proc_info['name']
                else: # É um RET_EVENTO puro, precisa de um EVENTO_ENVIO correspondente
                    # (Lógica de emparelhamento como antes)
                    tp_evento_ret = ret_proc_info['tipo_xml'].split('_')[-1] if ret_proc_info['tipo_xml'] else None
                    doc_base_ret = "_".join(ret_proc_info['tipo_xml'].split('_')[2:-1]) if ret_proc_info['tipo_xml'] else None
                    par_idx = -1
                    for i, evt_envio_info in enumerate(eventos_envio_restantes):
                        tp_evento_env = evt_envio_info['tipo_xml'].split('_')[-1] if evt_envio_info['tipo_xml'] else None
                        doc_base_env = "_".join(evt_envio_info['tipo_xml'].split('_')[1:-1]) if evt_envio_info['tipo_xml'] else None # EVENTO_CT -> CT
                        if tp_evento_env and tp_evento_ret and tp_evento_env == tp_evento_ret and \
                           doc_base_env and doc_base_ret and doc_base_env == doc_base_ret:
                            xml_envio_content, obj_envio, nome_arq_envio_final = evt_envio_info['content'], evt_envio_info['obj'], evt_envio_info['name']
                            par_idx = i; break
                    if par_idx != -1: eventos_envio_restantes.pop(par_idx)
                    else:
                        resultados_finais.append({'arquivo_principal_nome': None, 'arquivo_retorno_nome': ret_proc_info['name'], 'chave': chave, 'status': 'ignorado', 'erro': 'Retorno de evento sem envio correspondente no lote.'})
                        ignorado_count += 1; continue
                
                if not xml_envio_content: # Segurança
                    resultados_finais.append({'arquivo_principal_nome': nome_arq_envio_final, 'arquivo_retorno_nome': nome_arq_retorno_final_display, 'chave': chave, 'status': 'ignorado', 'erro': 'XML de envio do evento não determinado.'})
                    ignorado_count +=1; continue

                resultado_e = {'arquivo_principal_nome': nome_arq_envio_final, 
                               'arquivo_retorno_nome': nome_arq_retorno_final_display if nome_arq_retorno_final_display != nome_arq_envio_final else None, 
                               'chave': chave, 'status': 'erro'}
                try:
                    # O obj_envio é o do arquivo que contém o <evento*> (seja evento puro ou procEvento)
                    resp_obj_e = self._process_evento(xml_envio_content, xml_retorno_content_para_parser, obj_envio)
                    if resp_obj_e and status.is_success(resp_obj_e.status_code):
                        resultado_e.update(resp_obj_e.data); resultado_e['status'] = 'sucesso'; sucesso_count += 1
                    else:
                        # ... (tratamento de erro do evento)
                        erro_count +=1
                except Exception as e_e:
                    resultado_e['erro'] = f"Exceção evento {nome_arq_envio_final}: {str(e_e)}"; erro_count += 1
                resultados_finais.append(resultado_e)

            # Eventos de envio puros que sobraram (sem retorno explícito/procEvento no lote)
            for evt_envio_sozinho in eventos_envio_restantes:
                resultado_es = {'arquivo_principal_nome': evt_envio_sozinho['name'], 'arquivo_retorno_nome': None, 'chave': chave, 'status': 'erro'}
                try:
                    # Tenta processar, `parse_evento` deve ser inteligente se evt_envio_sozinho['content'] for um procEvento
                    resp_obj_es = self._process_evento(evt_envio_sozinho['content'], None, evt_envio_sozinho['obj'])
                    if resp_obj_es and status.is_success(resp_obj_es.status_code):
                        resultado_es.update(resp_obj_es.data); resultado_es['status'] = 'sucesso'; sucesso_count += 1
                    else:
                        # ... (tratamento de erro/ignorado)
                        if resp_obj_es and resp_obj_es.status_code == status.HTTP_202_ACCEPTED: ignorado_count +=1
                        else: erro_count +=1
                except Exception as e_es:
                    resultado_es['erro'] = f"Exceção evento {evt_envio_sozinho['name']} (sem ret.): {str(e_es)}"; erro_count += 1
                resultados_finais.append(resultado_es)

        # Fase 3: Processar arquivos sem chave que foram identificados como CT/MDFE
        for arq_sem_chave in arquivos_sem_chave_validos:
            # ... (lógica de processamento individual como na versão anterior) ...
            resultado_sc = {'arquivo_principal_nome': arq_sem_chave['name'], 'chave': None, 'status': 'erro'}
            try:
                resp_obj_sc = None
                if arq_sem_chave['tipo_xml'] == "CT":
                    resp_obj_sc = self._process_cte(arq_sem_chave['content'], arq_sem_chave['obj'], arq_sem_chave['xml_dict'])
                elif arq_sem_chave['tipo_xml'] == "MDFE":
                    resp_obj_sc = self._process_mdfe(arq_sem_chave['content'], arq_sem_chave['obj'], arq_sem_chave['xml_dict'])
                
                if resp_obj_sc and status.is_success(resp_obj_sc.status_code):
                    resultado_sc.update(resp_obj_sc.data); resultado_sc['status'] = 'sucesso'; sucesso_count += 1
                    resultado_sc['chave'] = resp_obj_sc.data.get('chave') 
                else:
                    resultado_sc['erro'] = resp_obj_sc.data.get('error', 'Falha proc. ind. sem chave.') if resp_obj_sc and resp_obj_sc.data else 'Proc. ind. sem chave não retornou.'
                    erro_count += 1
            except Exception as e_sc:
                resultado_sc['erro'] = f"Exceção proc. ind. {arq_sem_chave['name']}: {str(e_sc)}"; erro_count += 1
            resultados_finais.append(resultado_sc)

        final_code = status.HTTP_200_OK
        if erro_count > 0 or ignorado_count > 0: final_code = status.HTTP_207_MULTI_STATUS
        if sucesso_count == 0 and (erro_count > 0 or ignorado_count > 0): final_code = status.HTTP_400_BAD_REQUEST
            
        return Response({
            'message': "Processamento em lote concluído.",
            'sucesso': sucesso_count, 'erros': erro_count, 'ignorados': ignorado_count,
            'resultados_detalhados': resultados_finais
        }, status=final_code)