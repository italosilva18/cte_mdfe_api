# transport/services/parser_eventos.py

import xmltodict
import traceback
from decimal import Decimal, InvalidOperation
from datetime import datetime
from dateutil import parser as date_parser
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist

# Reutilizar helpers dos parsers existentes
# Garanta que estas funções estejam acessíveis
try:
    from .parser_cte import (
        safe_get, to_decimal, to_int, to_boolean,
        parse_datetime, parse_date, parse_time
    )
except ImportError:
    print("WARN: Não foi possível importar helpers de parser_cte. Defina localmente se necessário.")
    # (Cole as definições das funções auxiliares de parser_cte.py aqui)
    # Exemplo de safe_get básico se não importar:
    def safe_get(data_dict, key, default=None):
        keys = key.split('.')
        val = data_dict
        for k in keys:
            if isinstance(val, dict):
                val = val.get(k)
                if val is None: return default
            else: return default
        if isinstance(val, dict) and '#text' in val: return val['#text']
        if isinstance(val, dict) and key.split('.')[-1].startswith('@'):
             attr_key = key.split('.')[-1]
             return val.get(attr_key, default)
        return val if val is not None else default
    # Defina os outros helpers (to_decimal, to_int, parse_datetime etc.) aqui se necessário
    pass


# Importar Modelos relevantes
from transport.models import (
    CTeDocumento, CTeCancelamento,
    MDFeDocumento, MDFeCancelamento, MDFeCondutor
)

# === Constantes de Tipos de Evento (Manter como referência) ===
EVENTO_CANCELAMENTO = '110111'
EVENTO_CARTA_CORRECAO = '110110'
EVENTO_EPEC = '110113' # Evento Prévio de Emissão em Contingência (CT-e)
EVENTO_MDFE_ENCERRAMENTO = '110112'
EVENTO_MDFE_INC_CONDUTOR = '110114'
EVENTO_MDFE_CANCEL_ENCERRAMENTO = '110113' # Cancelamento do Encerramento (MDF-e) - Mesmo código do EPEC CT-e

# === Funções Auxiliares Específicas para Eventos ===

def _get_raiz_evento(doc_evento):
    """Encontra o nó raiz do evento (<eventoCTe>, <eventoMDFe>) dentro do XML parseado."""
    # Verifica a raiz direta
    if 'eventoCTe' in doc_evento: return doc_evento['eventoCTe']
    if 'eventoMDFe' in doc_evento: return doc_evento['eventoMDFe']
    # Verifica dentro de procEvento
    if 'procEventoCTe' in doc_evento and 'eventoCTe' in doc_evento['procEventoCTe']:
        return doc_evento['procEventoCTe']['eventoCTe']
    if 'procEventoMDFe' in doc_evento and 'eventoMDFe' in doc_evento['procEventoMDFe']:
        return doc_evento['procEventoMDFe']['eventoMDFe']
    raise ValueError("Raiz do XML do evento (<eventoCTe> ou <eventoMDFe>, com ou sem 'procEvento') não encontrada.")

def _get_raiz_retorno_evento(doc_retorno):
     """Encontra o nó raiz da resposta do evento (<retEventoCTe>, <retEventoMDFe>)."""
     if 'retEventoCTe' in doc_retorno: return doc_retorno['retEventoCTe']
     if 'retEventoMDFe' in doc_retorno: return doc_retorno['retEventoMDFe']
     if 'procEventoCTe' in doc_retorno and 'retEventoCTe' in doc_retorno['procEventoCTe']:
         return doc_retorno['procEventoCTe']['retEventoCTe']
     if 'procEventoMDFe' in doc_retorno and 'retEventoMDFe' in doc_retorno['procEventoMDFe']:
         return doc_retorno['procEventoMDFe']['retEventoMDFe']
     # Pode não haver um nó raiz explícito em retornos simples (ex: CCE só com cStat/xMotivo)
     # Retorna o próprio dict raiz para tentar extrair cStat/xMotivo diretamente
     return doc_retorno

def _get_evento_info(evento_raiz):
    """Extrai informações comuns do cabeçalho do evento (<infEvento>)."""
    inf_evento = safe_get(evento_raiz, 'infEvento')
    if not inf_evento:
        raise ValueError("Nó <infEvento> não encontrado no XML do evento.")

    return {
        'id_evento': safe_get(inf_evento, '@Id'),
        'c_orgao': safe_get(inf_evento, 'cOrgao'),
        'tp_amb': to_int(safe_get(inf_evento, 'tpAmb')),
        'cnpj': safe_get(inf_evento, 'CNPJ'),
        'cpf': safe_get(inf_evento, 'CPF'),
        'ch_documento': safe_get(inf_evento, 'chCTe') or safe_get(inf_evento, 'chMDFe'), # Chave do Doc Original
        'dh_evento': parse_datetime(safe_get(inf_evento, 'dhEvento')),
        'tp_evento': safe_get(inf_evento, 'tpEvento'),
        'n_seq_evento': to_int(safe_get(inf_evento, 'nSeqEvento')),
        # A tag da versão pode variar
        'ver_evento': safe_get(inf_evento, 'verEvento') or safe_get(inf_evento, 'versaoEvento') or safe_get(inf_evento, 'detEvento.@versaoEvento'),
        'det_evento': safe_get(inf_evento, 'detEvento'), # Detalhes específicos (dict)
    }

def _get_retorno_evento_info(ret_evento_raiz):
    """Extrai informações comuns da resposta do evento (<retInfEvento>)."""
    inf_evento_ret = safe_get(ret_evento_raiz, 'infEvento')
    if not inf_evento_ret:
        # Tenta pegar status/motivo do nível raiz se infEvento não existir (comum em retornos simples)
        c_stat = to_int(safe_get(ret_evento_raiz, 'cStat'))
        x_motivo = safe_get(ret_evento_raiz, 'xMotivo')
        if c_stat is not None and x_motivo is not None:
            return {
                'id_retorno': None, # Pode não existir
                'tp_amb': to_int(safe_get(ret_evento_raiz, 'tpAmb')),
                'ver_aplic': safe_get(ret_evento_raiz, 'verAplic'),
                'c_orgao': safe_get(ret_evento_raiz, 'cOrgao'),
                'c_stat': c_stat,
                'x_motivo': x_motivo,
                'ch_documento': safe_get(ret_evento_raiz, 'chCTe') or safe_get(ret_evento_raiz, 'chMDFe'),
                'dh_reg_evento': None, # Provavelmente não existe
                'n_prot_retorno': None, # Provavelmente não existe
            }
        else:
            # Não encontrou nem infEvento nem cStat/xMotivo no raiz
             print("WARN: Estrutura de retorno do evento não reconhecida ou incompleta.")
             return None

    # Se encontrou infEvento, extrai tudo de lá
    return {
        'id_retorno': safe_get(inf_evento_ret, '@Id'),
        'tp_amb': to_int(safe_get(inf_evento_ret, 'tpAmb')),
        'ver_aplic': safe_get(inf_evento_ret, 'verAplic'),
        'c_orgao': safe_get(inf_evento_ret, 'cOrgao'),
        'c_stat': to_int(safe_get(inf_evento_ret, 'cStat')),
        'x_motivo': safe_get(inf_evento_ret, 'xMotivo'),
        'ch_documento': safe_get(inf_evento_ret, 'chCTe') or safe_get(inf_evento_ret, 'chMDFe'),
        'dh_reg_evento': parse_datetime(safe_get(inf_evento_ret, 'dhRegEvento')),
        'n_prot_retorno': safe_get(inf_evento_ret, 'nProt'), # Protocolo do evento
    }

# === Handlers Específicos por Tipo de Evento ===

@transaction.atomic
def _handle_cancelamento_cte(cte_doc, evento_info, ret_evento_info, xml_evento_original):
    """Processa um evento de Cancelamento de CT-e (110111)."""
    det_evento = safe_get(evento_info, 'det_evento')
    if not det_evento:
        raise ValueError("Detalhes do evento de cancelamento (<detEvento>) não encontrados.")

    # Pega protocolo original e justificativa dos detalhes do evento
    n_prot_original = safe_get(det_evento, 'evCancCTe.nProt')
    x_just = safe_get(det_evento, 'evCancCTe.xJust')

    if not n_prot_original or not x_just:
        raise ValueError("Protocolo original (<nProt>) ou justificativa (<xJust>) não encontrados em <evCancCTe>.")

    # Prepara dados do retorno (se houver e for sucesso)
    retorno_data = {}
    status_sucesso = False
    if ret_evento_info:
        # Verifica consistência da chave
        if ret_evento_info.get('ch_documento') and ret_evento_info.get('ch_documento') != cte_doc.chave:
             raise ValueError(f"Chave do documento no retorno ({ret_evento_info.get('ch_documento')}) não confere com CT-e ({cte_doc.chave}).")

        # 135 = Evento registrado e vinculado ao CT-e
        if ret_evento_info.get('c_stat') == 135:
            status_sucesso = True
            retorno_data = {
                'id_retorno': ret_evento_info.get('id_retorno'),
                'ver_aplic': ret_evento_info.get('ver_aplic'),
                'c_stat': ret_evento_info.get('c_stat'),
                'x_motivo': ret_evento_info.get('x_motivo'),
                'dh_reg_evento': ret_evento_info.get('dh_reg_evento'),
                'n_prot_retorno': ret_evento_info.get('n_prot_retorno'),
            }
        else:
             print(f"WARN: Evento de cancelamento para CT-e {cte_doc.chave} recebido com status {ret_evento_info.get('c_stat')} - {ret_evento_info.get('x_motivo')}. Cancelamento NÃO registrado como bem-sucedido.")
             # Não retorna erro, mas não salva o cancelamento. A view pode retornar 202.
             return None

    # Se não houve retorno ou o retorno não foi sucesso, não grava
    if not status_sucesso:
        print(f"INFO: Cancelamento para CT-e {cte_doc.chave} não confirmado pela SEFAZ (sem retorno ou status != 135).")
        return None

    # Dados do evento original + dados do retorno (se sucesso)
    evento_data = {
        'id_evento': evento_info.get('id_evento'),
        'c_orgao': evento_info.get('c_orgao'),
        'tp_amb': evento_info.get('tp_amb'),
        'cnpj': evento_info.get('cnpj'),
        'cpf': evento_info.get('cpf'),
        'dh_evento': evento_info.get('dh_evento'),
        'tp_evento': evento_info.get('tp_evento'),
        'n_seq_evento': evento_info.get('n_seq_evento'),
        'versao_evento': evento_info.get('ver_evento'),
        'n_prot_original': n_prot_original,
        'x_just': x_just,
        'arquivo_xml_evento_original': xml_evento_original, # Salva o XML do evento
        **retorno_data # Adiciona os dados do retorno de sucesso
    }
    evento_data_cleaned = {k: v for k, v in evento_data.items() if v is not None}

    # Cria ou atualiza o registro de cancelamento
    cancelamento, created = CTeCancelamento.objects.update_or_create(
        cte=cte_doc,
        # Considerar usar n_prot_retorno ou id_evento como chave se precisar registrar múltiplas tentativas
        defaults=evento_data_cleaned
    )
    print(f"INFO: Evento de Cancelamento registrado com sucesso para CT-e {cte_doc.chave} (Protocolo: {retorno_data.get('n_prot_retorno')}).")
    return cancelamento

@transaction.atomic
def _handle_cce_cte(cte_doc, evento_info, ret_evento_info, xml_evento_original):
    """Processa um evento de Carta de Correção Eletrônica (CCE) de CT-e (110110)."""
    det_evento = safe_get(evento_info, 'det_evento')
    if not det_evento:
        raise ValueError("Detalhes do evento CCE (<detEvento>) não encontrados.")

    # Verifica o status do retorno (135 ou 136 para CCE)
    status_sucesso = False
    if ret_evento_info:
        if ret_evento_info.get('ch_documento') and ret_evento_info.get('ch_documento') != cte_doc.chave:
             raise ValueError(f"Chave do documento no retorno do evento CCE ({ret_evento_info.get('ch_documento')}) não confere com CT-e ({cte_doc.chave}).")
        if ret_evento_info.get('c_stat') in [135, 136]: # 135 ou 136 (evento registrado)
             status_sucesso = True
        else:
             print(f"WARN: Evento CCE para CT-e {cte_doc.chave} recebido com status {ret_evento_info.get('c_stat')} - {ret_evento_info.get('x_motivo')}. CCE NÃO será aplicada/registrada.")
             return None

    if not status_sucesso:
        print(f"INFO: CCE para CT-e {cte_doc.chave} não confirmada pela SEFAZ.")
        return None

    # --- Lógica para CCE ---
    # Atualmente, apenas loga as informações.
    # Para armazenar, crie um modelo CTeCartaCorrecao similar ao CTeCancelamento
    # e popule-o aqui com os dados de evento_info, ret_evento_info e os detalhes da correção.
    inf_correcao_list = safe_get(det_evento, 'evCCeCTe.infCorrecao', [])
    if not isinstance(inf_correcao_list, list): inf_correcao_list = [inf_correcao_list]

    print(f"INFO: Evento CCE (Seq:{evento_info.get('n_seq_evento')}, Prot:{ret_evento_info.get('n_prot_retorno')}) registrado com sucesso para CT-e {cte_doc.chave}.")
    if not inf_correcao_list:
         print("  - Nenhuma informação de correção (<infCorrecao>) encontrada no detalhe do evento.")
    else:
        for item in inf_correcao_list:
            if isinstance(item, dict):
                print(f"  - Grupo: {safe_get(item, 'grupoAlterado')} / Campo: {safe_get(item, 'campoAlterado')} / Valor: {safe_get(item, 'valorAlterado')}")

    # Exemplo: Se fosse salvar em um campo JSON no CT-e
    # correcoes = [{'grupo': safe_get(i, 'grupoAlterado'), 'campo': safe_get(i, 'campoAlterado'), 'valor': safe_get(i, 'valorAlterado')} for i in inf_correcao_list if isinstance(i, dict)]
    # cte_doc.ultima_cce_info = {'protocolo': ret_evento_info.get('n_prot_retorno'), 'data': ret_evento_info.get('dh_reg_evento'), 'correcoes': correcoes}
    # cte_doc.save()

    return True # Indica que o evento foi processado (logado)


@transaction.atomic
def _handle_cancelamento_mdfe(mdfe_doc, evento_info, ret_evento_info, xml_evento_original):
    """Processa um evento de Cancelamento de MDF-e (110111)."""
    det_evento = safe_get(evento_info, 'det_evento')
    if not det_evento:
        raise ValueError("Detalhes do evento de cancelamento MDF-e (<detEvento>) não encontrados.")

    n_prot_original = safe_get(det_evento, 'evCancMDFe.nProt')
    x_just = safe_get(det_evento, 'evCancMDFe.xJust')

    if not n_prot_original or not x_just:
        raise ValueError("Protocolo original (<nProt>) ou justificativa (<xJust>) não encontrados em <evCancMDFe>.")

    # Prepara dados do retorno (se houver e for sucesso)
    retorno_data = {}
    status_sucesso = False
    if ret_evento_info:
        if ret_evento_info.get('ch_documento') and ret_evento_info.get('ch_documento') != mdfe_doc.chave:
             raise ValueError(f"Chave do documento no retorno ({ret_evento_info.get('ch_documento')}) não confere com MDF-e ({mdfe_doc.chave}).")
        if ret_evento_info.get('c_stat') == 135: # Evento registrado
            status_sucesso = True
            retorno_data = {
                'id_retorno': ret_evento_info.get('id_retorno'),
                'ver_aplic': ret_evento_info.get('ver_aplic'),
                'c_stat': ret_evento_info.get('c_stat'),
                'x_motivo': ret_evento_info.get('x_motivo'),
                'dh_reg_evento': ret_evento_info.get('dh_reg_evento'),
                'n_prot_retorno': ret_evento_info.get('n_prot_retorno'),
            }
        else:
            print(f"WARN: Evento de cancelamento para MDF-e {mdfe_doc.chave} recebido com status {ret_evento_info.get('c_stat')} - {ret_evento_info.get('x_motivo')}. Cancelamento NÃO registrado.")
            return None

    if not status_sucesso:
        print(f"INFO: Cancelamento para MDF-e {mdfe_doc.chave} não confirmado pela SEFAZ.")
        return None

    # Dados do evento original + dados do retorno (se sucesso)
    evento_data = {
        'id_evento': evento_info.get('id_evento'),
        'c_orgao': evento_info.get('c_orgao'),
        'tp_amb': evento_info.get('tp_amb'),
        'cnpj': evento_info.get('cnpj'),
        'cpf': evento_info.get('cpf'),
        'dh_evento': evento_info.get('dh_evento'),
        'tp_evento': evento_info.get('tp_evento'),
        'n_seq_evento': evento_info.get('n_seq_evento'),
        'versao_evento': evento_info.get('ver_evento'),
        'n_prot_original': n_prot_original,
        'x_just': x_just,
        'arquivo_xml_evento': xml_evento_original, # Salva o XML do evento no campo correto
        **retorno_data
    }
    evento_data_cleaned = {k: v for k, v in evento_data.items() if v is not None}

    cancelamento, created = MDFeCancelamento.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=evento_data_cleaned
    )
    print(f"INFO: Evento de Cancelamento registrado com sucesso para MDF-e {mdfe_doc.chave} (Protocolo: {retorno_data.get('n_prot_retorno')}).")
    return cancelamento

@transaction.atomic
def _handle_encerramento_mdfe(mdfe_doc, evento_info, ret_evento_info, xml_evento_original):
    """Processa um evento de Encerramento de MDF-e (110112)."""
    det_evento = safe_get(evento_info, 'det_evento')
    if not det_evento:
        raise ValueError("Detalhes do evento de encerramento MDF-e (<detEvento>) não encontrados.")

    dt_enc = parse_date(safe_get(det_evento, 'evEncMDFe.dtEnc'))
    c_mun_enc = safe_get(det_evento, 'evEncMDFe.cMun')
    uf_enc = safe_get(det_evento, 'evEncMDFe.UF')

    if not dt_enc or not c_mun_enc or not uf_enc:
        raise ValueError("Dados de encerramento (dtEnc, cMun, UF) não encontrados em <evEncMDFe>.")

    # Verifica o status do retorno
    status_sucesso = False
    protocolo_encerramento = None
    if ret_evento_info:
        if ret_evento_info.get('ch_documento') and ret_evento_info.get('ch_documento') != mdfe_doc.chave:
             raise ValueError(f"Chave do documento no retorno ({ret_evento_info.get('ch_documento')}) não confere com MDF-e ({mdfe_doc.chave}).")
        if ret_evento_info.get('c_stat') == 135: # 135 = Evento registrado
             status_sucesso = True
             protocolo_encerramento = ret_evento_info.get('n_prot_retorno')
        else:
             print(f"WARN: Evento de encerramento para MDF-e {mdfe_doc.chave} recebido com status {ret_evento_info.get('c_stat')} - {ret_evento_info.get('x_motivo')}. Encerramento NÃO será registrado.")
             return None

    if not status_sucesso:
        print(f"INFO: Encerramento para MDF-e {mdfe_doc.chave} não confirmado pela SEFAZ.")
        return None

    # --- Lógica para Encerramento ---
    # Atualiza campos no MDFeDocumento.
    # **IMPORTANTE:** Adicione estes campos ao seu modelo MDFeDocumento se ainda não existirem:
    #   encerrado = models.BooleanField(default=False, db_index=True)
    #   data_encerramento = models.DateField(null=True, blank=True)
    #   municipio_encerramento_cod = models.CharField(max_length=7, null=True, blank=True)
    #   uf_encerramento = models.CharField(max_length=2, null=True, blank=True)
    #   protocolo_encerramento = models.CharField(max_length=15, null=True, blank=True, unique=True)

    try:
        mdfe_doc.encerrado = True
        mdfe_doc.data_encerramento = dt_enc
        mdfe_doc.municipio_encerramento_cod = c_mun_enc
        mdfe_doc.uf_encerramento = uf_enc
        mdfe_doc.protocolo_encerramento = protocolo_encerramento
        mdfe_doc.save(update_fields=[
            'encerrado', 'data_encerramento', 'municipio_encerramento_cod',
            'uf_encerramento', 'protocolo_encerramento'
        ])
        print(f"INFO: Evento de Encerramento (Data: {dt_enc}, Mun: {c_mun_enc}/{uf_enc}, Prot: {protocolo_encerramento}) registrado com sucesso para MDF-e {mdfe_doc.chave}.")
        return True # Indica sucesso na atualização
    except AttributeError as e:
         print(f"ERROR: Falha ao atualizar MDF-e {mdfe_doc.chave} com dados de encerramento. Verifique se os campos existem no modelo: {e}")
         # A transação será revertida
         raise ValueError(f"Modelo MDFeDocumento não possui campos para encerramento: {e}")


@transaction.atomic
def _handle_inclusao_condutor_mdfe(mdfe_doc, evento_info, ret_evento_info, xml_evento_original):
    """Processa um evento de Inclusão de Condutor no MDF-e (110114)."""
    det_evento = safe_get(evento_info, 'det_evento')
    if not det_evento:
        raise ValueError("Detalhes do evento de inclusão de condutor (<detEvento>) não encontrados.")

    nome_condutor = safe_get(det_evento, 'evIncCondutorMDFe.condutor.xNome')
    cpf_condutor = safe_get(det_evento, 'evIncCondutorMDFe.condutor.CPF')

    if not nome_condutor or not cpf_condutor:
        raise ValueError("Nome ou CPF do condutor não encontrados em <evIncCondutorMDFe>.")

    # Verifica o status do retorno
    status_sucesso = False
    protocolo_evento = None
    if ret_evento_info:
        if ret_evento_info.get('ch_documento') and ret_evento_info.get('ch_documento') != mdfe_doc.chave:
             raise ValueError(f"Chave do documento no retorno ({ret_evento_info.get('ch_documento')}) não confere com MDF-e ({mdfe_doc.chave}).")
        if ret_evento_info.get('c_stat') == 135:
             status_sucesso = True
             protocolo_evento = ret_evento_info.get('n_prot_retorno')
        else:
             print(f"WARN: Evento de inclusão de condutor para MDF-e {mdfe_doc.chave} recebido com status {ret_evento_info.get('c_stat')} - {ret_evento_info.get('x_motivo')}. Condutor NÃO será adicionado.")
             return None

    if not status_sucesso:
        print(f"INFO: Inclusão de condutor para MDF-e {mdfe_doc.chave} não confirmada pela SEFAZ.")
        return None

    # Adiciona o condutor ao MDF-e (update_or_create para evitar duplicatas)
    condutor, created = MDFeCondutor.objects.update_or_create(
        mdfe=mdfe_doc,
        cpf=cpf_condutor,
        defaults={'nome': nome_condutor}
    )

    if created:
        print(f"INFO: Evento de Inclusão de Condutor (CPF: {cpf_condutor}, Prot: {protocolo_evento}) registrado com sucesso para MDF-e {mdfe_doc.chave}.")
    else:
        print(f"INFO: Evento de Inclusão de Condutor (CPF: {cpf_condutor}, Prot: {protocolo_evento}) recebido para MDF-e {mdfe_doc.chave}, condutor já existia ou foi atualizado.")

    return condutor


# === Função Principal de Parsing de Eventos ===

def parse_evento(xml_evento_text, xml_retorno_text=None):
    """
    Função principal para parsear um XML de evento e seu possível retorno.

    Args:
        xml_evento_text (str): Conteúdo do XML do evento (ex: <eventoCTe>, <procEventoCTe>).
        xml_retorno_text (str, optional): Conteúdo do XML de retorno do evento (ex: <retEventoCTe>).

    Returns:
        object: O objeto do modelo criado/atualizado ou True/None.
        Levanta ValueError em caso de erros de parsing, validação ou se o documento principal não for encontrado.
        Levanta Exception para outros erros inesperados.
    """
    if not xml_evento_text:
        raise ValueError("Conteúdo XML do evento está vazio.")

    try:
        # Parseia XML do evento
        doc_evento = xmltodict.parse(xml_evento_text)
        evento_raiz = _get_raiz_evento(doc_evento) # Pode levantar ValueError
        evento_info = _get_evento_info(evento_raiz) # Pode levantar ValueError

        # Parseia XML de retorno (se fornecido)
        ret_evento_info = None
        if xml_retorno_text:
            try:
                doc_retorno = xmltodict.parse(xml_retorno_text)
                ret_evento_raiz = _get_raiz_retorno_evento(doc_retorno)
                if ret_evento_raiz:
                     ret_evento_info = _get_retorno_evento_info(ret_evento_raiz)
                else:
                     print(f"WARN: Não foi possível encontrar a raiz do XML de retorno para evento {evento_info.get('tp_evento')} chave {evento_info.get('ch_documento')}")
            except Exception as parse_ret_err:
                 print(f"WARN: Falha ao parsear XML de retorno para evento {evento_info.get('tp_evento')} chave {evento_info.get('ch_documento')}: {parse_ret_err}")
                 # Continua sem o retorno

        # --- Identifica o documento principal (CT-e ou MDF-e) ---
        chave_doc = evento_info.get('ch_documento')
        if not chave_doc or len(chave_doc) != 44:
            raise ValueError(f"Chave do documento original inválida ou ausente no evento: {chave_doc}")

        doc_principal = None
        tipo_doc = None
        try:
            # Tenta buscar como CT-e
            doc_principal = CTeDocumento.objects.get(chave=chave_doc)
            tipo_doc = 'CTE'
        except CTeDocumento.DoesNotExist:
            try:
                # Tenta buscar como MDF-e
                doc_principal = MDFeDocumento.objects.get(chave=chave_doc)
                tipo_doc = 'MDFE'
            except MDFeDocumento.DoesNotExist:
                # Erro Crítico: O documento ao qual o evento se refere não existe no banco
                raise ValueError(f"Documento principal (CT-e/MDF-e) com chave {chave_doc} não encontrado no banco de dados.")

        # --- Chama o handler apropriado ---
        tp_evento = evento_info.get('tp_evento')

        if tipo_doc == 'CTE':
            if tp_evento == EVENTO_CANCELAMENTO:
                return _handle_cancelamento_cte(doc_principal, evento_info, ret_evento_info, xml_evento_text)
            elif tp_evento == EVENTO_CARTA_CORRECAO:
                return _handle_cce_cte(doc_principal, evento_info, ret_evento_info, xml_evento_text)
            # Adicionar handlers para outros eventos CT-e (EPEC, etc.)
            # elif tp_evento == EVENTO_EPEC:
            #     return _handle_epec_cte(...)
            else:
                print(f"WARN: Tipo de evento CT-e não suportado pelo parser: {tp_evento} para chave {chave_doc}")
                return None # Indica que não foi processado

        elif tipo_doc == 'MDFE':
            if tp_evento == EVENTO_CANCELAMENTO:
                return _handle_cancelamento_mdfe(doc_principal, evento_info, ret_evento_info, xml_evento_text)
            elif tp_evento == EVENTO_MDFE_ENCERRAMENTO:
                return _handle_encerramento_mdfe(doc_principal, evento_info, ret_evento_info, xml_evento_text)
            elif tp_evento == EVENTO_MDFE_INC_CONDUTOR:
                return _handle_inclusao_condutor_mdfe(doc_principal, evento_info, ret_evento_info, xml_evento_text)
            # Adicionar handlers para outros eventos MDF-e (Cancelamento Encerramento, etc.)
            # elif tp_evento == EVENTO_MDFE_CANCEL_ENCERRAMENTO:
            #    return _handle_cancel_encerramento_mdfe(...)
            else:
                print(f"WARN: Tipo de evento MDF-e não suportado pelo parser: {tp_evento} para chave {chave_doc}")
                return None # Indica que não foi processado
        else:
            # Nunca deve chegar aqui se a busca funcionou
            raise RuntimeError("Tipo de documento principal não determinado.")

    except ValueError as ve:
        # Re-levanta ValueErrors (erros esperados de parsing/validação)
        print(f"Erro de validação ao processar evento: {ve}")
        raise ve
    except Exception as e:
        # Captura outros erros inesperados
        print(f"ERROR: Falha geral inesperada ao processar evento. Erro: {e}")
        print(traceback.format_exc())
        # Re-levanta a exceção original para a view poder tratar como 500
        raise e