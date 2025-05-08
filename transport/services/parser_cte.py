# transport/services/parser_cte.py

import xmltodict
import traceback
from decimal import Decimal, InvalidOperation
from datetime import datetime
from dateutil import parser as date_parser # pip install python-dateutil
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.utils import timezone
from dateutil import parser as date_parser
from django.conf import settings

# Importar todos os modelos CT-e e o Endereco base
from transport.models import (
    Endereco,
    CTeDocumento, CTeIdentificacao, CTeComplemento, CTeObservacaoContribuinte,
    CTeObservacaoFisco, CTeEmitente, CTeRemetente, CTeExpedidor, CTeRecebedor,
    CTEDestinatario, CTePrestacaoServico, CTeComponenteValor, CTeTributos,
    CTeCarga, CTeQuantidadeCarga, CTeDocumentoTransportado, CTeSeguro,
    CTeModalRodoviario, CTeVeiculoRodoviario, CTeMotorista, CTeAutXML,
    CTeResponsavelTecnico, CTeProtocoloAutorizacao, CTeSuplementar,
    CTeCancelamento
)

# --- Helper Functions (Funções Auxiliares) ---

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
             # Permite acesso a listas por índice (ex: 'infNFe.0.chave')
             val = val[int(k)]
        else:
            return default
    # Trata o caso de #text comum em xmltodict
    if isinstance(val, dict) and '#text' in val:
        return val['#text']
    # Trata o caso de @attribute comum em xmltodict
    if isinstance(val, dict) and key.split('.')[-1].startswith('@'):
        attr_key = key.split('.')[-1]
        return val.get(attr_key, default)

    return val if val is not None else default

def to_decimal(value, default=Decimal('0.00')):
    """Converte valor para Decimal com segurança."""
    if value is None:
        return default
    try:
        cleaned_value = str(value).strip().replace(',', '.')
        return Decimal(cleaned_value)
    except (InvalidOperation, ValueError, TypeError):
        return default

def to_int(value, default=None):
    """Converte valor para Inteiro com segurança."""
    if value is None:
        return default
    try:
        # Tenta converter diretamente para int
        return int(value)
    except (ValueError, TypeError):
        try:
            # Se falhar, tenta converter para float e depois int (lida com "1.0")
            return int(float(value))
        except (ValueError, TypeError):
            return default

def to_boolean(value, default=False):
    """Converte valor para Boolean com segurança (considera '0', '1', 'S', 'N')."""
    if value is None:
        return default
    val_str = str(value).strip().lower()
    if val_str in ['1', 'true', 'sim', 's', 'yes', 'verdadeiro']:
        return True
    if val_str in ['0', 'false', 'nao', 'n', 'não', 'no', 'falso']:
        return False
    return default

def parse_datetime(value, default=None):
    """Converte string de data/hora (com ou sem timezone) para objeto datetime AWARE."""
    if not value:
        return default
    try:
        dt = date_parser.parse(value)
        # Torna o datetime AWARE se o Django estiver configurado para usar timezones
        if settings.USE_TZ and timezone.is_naive(dt):
            # Assume o timezone default do Django se a string não tiver info de timezone
            # Cuidado: Se o XML tiver datas em fusos diferentes, isso pode não ser ideal.
            # Uma solução mais robusta seria exigir timezones nos dados de entrada ou
            # ter uma configuração para o fuso horário dos XMLs.
            dt = timezone.make_aware(dt, timezone.get_default_timezone())
        elif not settings.USE_TZ and timezone.is_aware(dt):
             # Se Django não usa TZ mas o datetime tem, torna naive
             dt = timezone.make_naive(dt, timezone.get_default_timezone())
        return dt
    except (ValueError, TypeError, OverflowError):
        print(f"WARN: Falha ao converter data/hora: {value}")
        return default

def parse_date(value, default=None):
    """Converte string de data para objeto date."""
    dt = parse_datetime(value)
    return dt.date() if dt else default

def parse_time(value, default=None):
    """Converte string de hora para objeto time."""
    # Tentar parsear diretamente como time pode ser mais simples se o formato for conhecido
    if isinstance(value, str) and len(value) >= 8: # Ex: HH:MM:SS
        try:
             return date_parser.parse(value).time()
        except (ValueError, TypeError):
             pass # Tenta o parse_datetime abaixo
    # Fallback para parse_datetime se o formato for incerto
    dt = parse_datetime(value)
    return dt.time() if dt else default

def parse_endereco(endereco_dict):
    """Extrai dados de um bloco de endereço do XML."""
    if not isinstance(endereco_dict, dict):
        return {}
    return {
        'logradouro': safe_get(endereco_dict, 'xLgr'),
        'numero': safe_get(endereco_dict, 'nro'),
        'complemento': safe_get(endereco_dict, 'xCpl'),
        'bairro': safe_get(endereco_dict, 'xBairro'),
        'codigo_municipio': safe_get(endereco_dict, 'cMun'),
        'nome_municipio': safe_get(endereco_dict, 'xMun'),
        'cep': safe_get(endereco_dict, 'CEP'),
        'uf': safe_get(endereco_dict, 'UF'),
        'codigo_pais': safe_get(endereco_dict, 'cPais', default='1058'),
        'nome_pais': safe_get(endereco_dict, 'xPais', default='BRASIL'),
    }

def get_cte_infcte(xml_dict):
    """Encontra o bloco <infCte> no dicionário XML parseado."""
    proc_cte = xml_dict.get('procCTe')
    cte_proc = xml_dict.get('cteProc')

    # Verifica as estruturas mais comuns primeiro
    if proc_cte and 'CTe' in proc_cte and 'infCte' in proc_cte['CTe']:
        return proc_cte['CTe']['infCte'], proc_cte.get('@versao')
    elif cte_proc and 'CTe' in cte_proc and 'infCte' in cte_proc['CTe']:
        return cte_proc['CTe']['infCte'], cte_proc.get('@versao')
    # Tenta a estrutura sem 'proc'
    elif 'CTe' in xml_dict and 'infCte' in xml_dict['CTe']:
         return xml_dict['CTe']['infCte'], xml_dict['CTe'].get('@versao')
    else:
        raise ValueError("Não foi possível encontrar o bloco <infCte> ou <CTe> no XML.")

def get_cte_protocolo(xml_dict):
    """Encontra o bloco <protCTe> no dicionário XML parseado."""
    proc_cte = xml_dict.get('procCTe')
    cte_proc = xml_dict.get('cteProc')

    if proc_cte and 'protCTe' in proc_cte:
        return proc_cte['protCTe']
    elif cte_proc and 'protCTe' in cte_proc:
        return cte_proc['protCTe']
    return None

def get_cte_suplementar(xml_dict):
    """Encontra o bloco <infCTeSupl> no dicionário XML parseado."""
    # Ele geralmente está dentro de <CTe>, não dentro de <procCTe> ou <cteProc>
    cte_node = xml_dict.get('procCTe', {}).get('CTe') or \
               xml_dict.get('cteProc', {}).get('CTe') or \
               xml_dict.get('CTe')
    if cte_node:
        return safe_get(cte_node, 'infCTeSupl')
    return None

# --- Parser Functions por Seção do Modelo ---

@transaction.atomic
def parse_cte_identificacao(cte_doc, infcte):
    """Parseia o bloco <ide> e salva em CTeIdentificacao."""
    ide = safe_get(infcte, 'ide')
    if not ide:
        print(f"WARN: Bloco <ide> não encontrado para CT-e {cte_doc.chave}")
        return None

    # Tratamento do Tomador (pode ser <toma3> ou <toma4>)
    toma_node = None
    toma_tipo = None
    if safe_get(ide, 'toma3'):
        toma_node = safe_get(ide, 'toma3')
        toma_tipo = safe_get(toma_node, 'toma')
    elif safe_get(ide, 'toma4'):
        toma_node = safe_get(ide, 'toma4')
        toma_tipo = safe_get(toma_node, 'toma')
    else:
        toma_node = {} # Default vazio se não encontrar
        toma_tipo = '0'  # Default 0 (Remetente)
        print(f"WARN: Tomador <toma3> ou <toma4> não encontrado para CT-e {cte_doc.chave}. Usando padrão '0'.")

    # Preparar dados do endereço do tomador (somente se toma=4)
    tomador_endereco = None
    if toma_tipo == '4':
        endereco_tomador_data = parse_endereco(safe_get(toma_node, 'enderToma'))
        if any(endereco_tomador_data.values()):
            # Cria um novo endereço para o tomador.
            # Considerar get_or_create se houver chance de reutilização e um critério único.
            tomador_endereco = Endereco.objects.create(**endereco_tomador_data)

    # Garantir campos obrigatórios
    codigo_uf = to_int(safe_get(ide, 'cUF'))
    if not codigo_uf:
        codigo_uf = 42  # SC (valor padrão)
        print(f"WARN: <cUF> não encontrado para CT-e {cte_doc.chave}. Usando valor padrão.")

    cfop = safe_get(ide, 'CFOP')
    if not cfop:
        cfop = "6353"  # Prestação de serviço de transporte (valor padrão)
        print(f"WARN: <CFOP> não encontrado para CT-e {cte_doc.chave}. Usando valor padrão.")

    ident_data = {
        'codigo_uf': codigo_uf,
        'codigo_control': safe_get(ide, 'cCT'),
        'cfop': cfop,
        'natureza_operacao': safe_get(ide, 'natOp') or "PRESTAÇÃO DE SERVIÇO DE TRANSPORTE",
        'modelo': safe_get(ide, 'mod') or "57",
        'serie': to_int(safe_get(ide, 'serie')) or 0,
        'numero': to_int(safe_get(ide, 'nCT')) or 0,
        'data_emissao': parse_datetime(safe_get(ide, 'dhEmi')) or datetime.now(),
        'tipo_impressao': to_int(safe_get(ide, 'tpImp')) or 1,
        'tipo_emissao': to_int(safe_get(ide, 'tpEmis')) or 1,
        'digito_verificador': to_int(safe_get(ide, 'cDV')) or 0,
        'ambiente': to_int(safe_get(ide, 'tpAmb')) or 2,  # 2 = Homologação padrão
        'tipo_cte': to_int(safe_get(ide, 'tpCTe')) or 0,  # 0 = Normal padrão
        'processo_emissao': to_int(safe_get(ide, 'procEmi')) or 0,
        'versao_processo': safe_get(ide, 'verProc') or "1.0",
        # Chave referenciada pode estar em locais diferentes dependendo do tipo de CT-e
        'chave_referenciada': safe_get(ide, 'infCteAnu.chCte') or \
                             safe_get(ide, 'infCTeNorm.infDocRef.chCTe') or \
                             safe_get(ide, 'infCteComp.chCTe'), # Verificar outros casos se necessário
        'codigo_mun_envio': safe_get(ide, 'cMunEnv') or "4200000",  # Município padrão
        'nome_mun_envio': safe_get(ide, 'xMunEnv') or "MUNICÍPIO NÃO INFORMADO",
        'uf_envio': safe_get(ide, 'UFEnv') or "SC",  # UF padrão
        'modal': safe_get(ide, 'modal') or "01",  # Rodoviário padrão
        'tipo_servico': safe_get(ide, 'tpServ') or "0",  # Normal padrão
        'codigo_mun_ini': safe_get(ide, 'cMunIni') or "4200000",
        'nome_mun_ini': safe_get(ide, 'xMunIni') or "MUNICÍPIO NÃO INFORMADO",
        'uf_ini': safe_get(ide, 'UFIni') or "SC",
        'codigo_mun_fim': safe_get(ide, 'cMunFim') or "4200000",
        'nome_mun_fim': safe_get(ide, 'xMunFim') or "MUNICÍPIO NÃO INFORMADO",
        'uf_fim': safe_get(ide, 'UFFim') or "SC",
        'retira': to_boolean(safe_get(ide, 'retira', '0')), # Default '0' se ausente
        'detalhes_retira': safe_get(ide, 'xDetRetira'),
        'ind_ie_tomador': to_int(safe_get(toma_node, 'indIEToma')) or 9, # Padrão 9 = Não contribuinte
        'toma': to_int(toma_tipo) or 0, # 0=Rem, 1=Exp, 2=Rec, 3=Dest, 4=Outros
        # Dados do Tomador (se toma=4)
        'tomador_cnpj': safe_get(toma_node, 'CNPJ') if toma_tipo == '4' else None,
        'tomador_cpf': safe_get(toma_node, 'CPF') if toma_tipo == '4' else None,
        'tomador_ie': safe_get(toma_node, 'IE') if toma_tipo == '4' else None,
        'tomador_razao_social': safe_get(toma_node, 'xNome') if toma_tipo == '4' else None,
        'tomador_nome_fantasia': safe_get(toma_node, 'xFant') if toma_tipo == '4' else None,
        'tomador_telefone': safe_get(toma_node, 'fone') if toma_tipo == '4' else None,
        'tomador_endereco': tomador_endereco, # Objeto Endereco ou None
        # Novo campo de distância KM
        'dist_km': to_int(safe_get(ide, 'infGlobalizado.distCont') or safe_get(ide, 'infCTeNorm.infModal.rodo.dist')) or 0,
    }

    # Remove chaves com valor None para evitar sobrescrever com null no update_or_create
    ident_data_cleaned = {k: v for k, v in ident_data.items() if v is not None}

    try:
        identificacao, created = CTeIdentificacao.objects.update_or_create(
            cte=cte_doc,
            defaults=ident_data_cleaned
        )
        return identificacao
    except Exception as e:
        print(f"ERRO ao criar identificação para CT-e {cte_doc.chave}: {e}")
        # Re-raise para a transação reverter
        raise

@transaction.atomic
def parse_cte_complemento(cte_doc, infcte):
    """Parseia o bloco <compl> e salva em CTeComplemento e relacionados."""
    compl = safe_get(infcte, 'compl')
    if not compl:
        CTeComplemento.objects.filter(cte=cte_doc).delete()  # Limpa qualquer complemento existente
        return None

    # Dados da Entrega
    entrega_data = safe_get(compl, 'Entrega', {})
    # Dados de Origem/Destino Cálculo (podem não existir)
    orig_data = safe_get(compl, 'origCalc', {})
    dest_data = safe_get(compl, 'destCalc', {})

    compl_data = {
        'x_carac_ad': safe_get(compl, 'xCaracAd'),
        'x_carac_ser': safe_get(compl, 'xCaracSer'),
        'x_emi': safe_get(compl, 'xEmi'),
        # Entrega: Verifica o tipo de período/hora antes de pegar o valor
        'entrega_sem_data': safe_get(entrega_data, 'semData.@tpPer') == '0',
        'entrega_com_data_d_prev': parse_date(safe_get(entrega_data, 'comData.dProg')) if safe_get(entrega_data, 'comData.@tpPer') == '1' else None,
        'entrega_no_periodo_d_ini': parse_date(safe_get(entrega_data, 'noPeriodo.dIni') or safe_get(entrega_data, 'noData.dIni')) if safe_get(entrega_data, 'noPeriodo.@tpPer') == '2' or safe_get(entrega_data, 'noData.@tpPer') == '2' else None,
        'entrega_no_periodo_d_fin': parse_date(safe_get(entrega_data, 'noPeriodo.dFim') or safe_get(entrega_data, 'noData.dFim')) if safe_get(entrega_data, 'noPeriodo.@tpPer') == '2' or safe_get(entrega_data, 'noData.@tpPer') == '2' else None,
        # Ajustado para versões diferentes que podem usar noPeriodo ou noData

        'entrega_sem_hora': safe_get(entrega_data, 'semHora.@tpHor') == '0',
        'entrega_com_hora_h_prev': parse_time(safe_get(entrega_data, 'comHora.hProg')) if safe_get(entrega_data, 'comHora.@tpHor') == '1' else None,
        'entrega_no_periodo_h_ini': parse_time(safe_get(entrega_data, 'noInter.hIni') or safe_get(entrega_data, 'noHora.hIni')) if safe_get(entrega_data, 'noInter.@tpHor') == '2' or safe_get(entrega_data, 'noHora.@tpHor') == '2' else None,
        'entrega_no_periodo_h_fin': parse_time(safe_get(entrega_data, 'noInter.hFim') or safe_get(entrega_data, 'noHora.hFim')) if safe_get(entrega_data, 'noInter.@tpHor') == '2' or safe_get(entrega_data, 'noHora.@tpHor') == '2' else None,
        # Ajustado para versões diferentes que podem usar noInter ou noHora

        # Orig/Dest Calc
        'orig_cod_mun': safe_get(orig_data, 'cMunOrig'),
        'orig_nome_mun': safe_get(orig_data, 'xMunOrig'),
        'orig_uf': safe_get(orig_data, 'UFOrig'),
        'dest_cod_mun': safe_get(dest_data, 'cMunDest'),
        'dest_nome_mun': safe_get(dest_data, 'xMunDest'),
        'dest_uf': safe_get(dest_data, 'UFDest'),
        'x_obs': safe_get(compl, 'xObs'),
    }
    compl_data_cleaned = {k: v for k, v in compl_data.items() if v is not None}

    try:
        complemento, created = CTeComplemento.objects.update_or_create(
            cte=cte_doc,
            defaults=compl_data_cleaned
        )

        # --- Observações Contribuinte <ObsCont> ---
        obs_cont_list = safe_get(compl, 'ObsCont', [])
        if not isinstance(obs_cont_list, list): obs_cont_list = [obs_cont_list] # Garante que seja lista
        CTeObservacaoContribuinte.objects.filter(complemento=complemento).delete() # Limpa anteriores
        for obs in obs_cont_list:
            if isinstance(obs, dict):
                CTeObservacaoContribuinte.objects.create(
                    complemento=complemento,
                    campo=safe_get(obs, '@xCampo') or "CAMPO_PADRAO",
                    texto=safe_get(obs, 'xTexto') or ""
                )

        # --- Observações Fisco <ObsFisco> ---
        obs_fisco_list = safe_get(compl, 'ObsFisco', [])
        if not isinstance(obs_fisco_list, list): obs_fisco_list = [obs_fisco_list]
        CTeObservacaoFisco.objects.filter(complemento=complemento).delete() # Limpa anteriores
        for obs in obs_fisco_list:
             if isinstance(obs, dict):
                CTeObservacaoFisco.objects.create(
                    complemento=complemento,
                    campo=safe_get(obs, '@xCampo') or "CAMPO_PADRAO",
                    texto=safe_get(obs, 'xTexto') or ""
                )

        return complemento
    except Exception as e:
        print(f"ERRO ao processar complemento para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_entidade(cte_doc, infcte, tag, model_class):
    """Parseia um bloco de entidade fiscal (<emit>, <rem>, <dest>, <exped>, <receb>)."""
    entidade_dict = safe_get(infcte, tag)
    if not entidade_dict:
        # É normal expedidor e recebedor não existirem, não logar warning para eles
        if tag not in ['exped', 'receb']:
           print(f"WARN: Bloco <{tag}> não encontrado para CT-e {cte_doc.chave}")
        # Garante que qualquer registro antigo seja deletado se o bloco não vier mais
        model_class.objects.filter(cte=cte_doc).delete()
        return None

    # Define o nome da tag do endereço (ex: enderEmit, enderReme)
    endereco_tag = 'ender' + tag.capitalize()
    endereco_data = parse_endereco(safe_get(entidade_dict, endereco_tag))

    # Garante que pelo menos um identificador (CNPJ/CPF) e nome existam
    if not safe_get(entidade_dict, 'CNPJ') and not safe_get(entidade_dict, 'CPF'):
        print(f"WARN: Nem CNPJ nem CPF informados para <{tag}> no CT-e {cte_doc.chave}. Usando valores padrão.")
        if tag == 'emit':  # Para emitente, usamos CNPJ padrão
            cnpj_padrao = "00000000000000"
            cpf_padrao = None
        else:  # Para outros, usamos CPF padrão
            cnpj_padrao = None
            cpf_padrao = "00000000000"
    else:
        cnpj_padrao = None
        cpf_padrao = None

    razao_social = safe_get(entidade_dict, 'xNome')
    if not razao_social:
        razao_social = f"{tag.upper()} NÃO INFORMADO"
        print(f"WARN: Razão social não informada para <{tag}> no CT-e {cte_doc.chave}. Usando valor padrão.")

    entidade_data = {
        'cnpj': safe_get(entidade_dict, 'CNPJ') or cnpj_padrao,
        'cpf': safe_get(entidade_dict, 'CPF') or cpf_padrao,
        'ie': safe_get(entidade_dict, 'IE'),
        'razao_social': razao_social,
        'nome_fantasia': safe_get(entidade_dict, 'xFant'),
        'telefone': safe_get(entidade_dict, 'fone'),
        'email': safe_get(entidade_dict, 'email'), # Campo adicionado ao modelo base
        # Campos específicos por entidade
        'crt': safe_get(entidade_dict, 'CRT') if tag == 'emit' else None,
        'isuf': safe_get(entidade_dict, 'ISUF') if tag == 'dest' else None,
        # Adiciona os campos do endereço extraído
        **endereco_data
    }
    
    # Se nome_municipio ou uf estiverem ausentes no endereco, define valores padrão
    if 'nome_municipio' not in endereco_data or not endereco_data['nome_municipio']:
        entidade_data['nome_municipio'] = "MUNICÍPIO NÃO INFORMADO"
    
    if 'uf' not in endereco_data or not endereco_data['uf']:
        entidade_data['uf'] = "SC"  # UF padrão

    entidade_data_cleaned = {k: v for k, v in entidade_data.items() if v is not None}

    try:
        # Cria ou atualiza a entidade.
        # Como Endereco é a base concreta, o update_or_create lida com a herança.
        # Ele criará/atualizará a linha em Endereco e a linha na tabela específica (CTeEmitente, etc.)
        obj, created = model_class.objects.update_or_create(
            cte=cte_doc,
            defaults=entidade_data_cleaned
        )
        return obj
    except Exception as e:
        print(f"ERRO ao processar entidade <{tag}> para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_valores(cte_doc, infcte):
    """Parseia os blocos <vPrest> e <imp>."""
    vprest = safe_get(infcte, 'vPrest')
    if not vprest:
        # Limpa registros anteriores se o bloco não existir
        CTePrestacaoServico.objects.filter(cte=cte_doc).delete()
        CTeTributos.objects.filter(cte=cte_doc).delete()
        return None, None # Retorna None para prestacao e tributos

    # Garante que valores obrigatórios estejam presentes
    valor_total = to_decimal(safe_get(vprest, 'vTPrest'))
    if valor_total is None or valor_total == 0:
        valor_total = Decimal('0.01')  # Valor mínimo positivo
        print(f"WARN: Valor total da prestação não informado ou zero para CT-e {cte_doc.chave}. Usando valor padrão.")

    valor_recebido = to_decimal(safe_get(vprest, 'vRec'))
    if valor_recebido is None:
        valor_recebido = valor_total  # Usa o mesmo valor do total se não informado
        print(f"WARN: Valor a receber não informado para CT-e {cte_doc.chave}. Usando valor total.")

    # --- Prestação de Serviço ---
    prest_data = {
        'valor_total_prestado': valor_total,
        'valor_recebido': valor_recebido,
        # Campos CIF/FOB - Detectar modalidade baseado no tomador ou outros valores
        'valor_cif': to_decimal(safe_get(vprest, 'vCIF')), # Só se existir no XML
        'valor_fob': to_decimal(safe_get(vprest, 'vFOB')), # Só se existir no XML
    }
    prest_data_cleaned = {k: v for k, v in prest_data.items() if v is not None}
    
    try:
        prestacao, created_prest = CTePrestacaoServico.objects.update_or_create(
            cte=cte_doc,
            defaults=prest_data_cleaned
        )

        # Componentes de Valor <Comp>
        comp_list = safe_get(vprest, 'Comp', [])
        if not isinstance(comp_list, list): comp_list = [comp_list]
        CTeComponenteValor.objects.filter(prestacao=prestacao).delete() # Limpa anteriores
        for comp in comp_list:
             if isinstance(comp, dict):
                nome_comp = safe_get(comp, 'xNome')
                valor_comp = to_decimal(safe_get(comp, 'vComp'))
                
                if nome_comp and valor_comp is not None:
                    CTeComponenteValor.objects.create(
                        prestacao=prestacao,
                        nome=nome_comp,
                        valor=valor_comp
                    )
    except Exception as e:
        print(f"ERRO ao processar valores de prestação para CT-e {cte_doc.chave}: {e}")
        raise

    # --- Impostos ---
    imp = safe_get(infcte, 'imp')
    tributos = None
    if imp:
        # Tenta extrair a estrutura do ICMS (pode variar muito)
        # Armazenar como JSON é a abordagem mais flexível
        icms_node = safe_get(imp, 'ICMS', {})
        icms_data = {}
        # Verifica qual tipo de ICMS está presente
        if 'ICMS00' in icms_node: icms_data = safe_get(icms_node, 'ICMS00')
        elif 'ICMS20' in icms_node: icms_data = safe_get(icms_node, 'ICMS20')
        elif 'ICMS45' in icms_node: icms_data = safe_get(icms_node, 'ICMS45')
        elif 'ICMS60' in icms_node: icms_data = safe_get(icms_node, 'ICMS60')
        elif 'ICMS90' in icms_node: icms_data = safe_get(icms_node, 'ICMS90')
        elif 'ICMSOutraUF' in icms_node: icms_data = safe_get(icms_node, 'ICMSOutraUF')
        elif 'ICMSSN' in icms_node: icms_data = safe_get(icms_node, 'ICMSSN')
        # Adicionar ICMSST se necessário
        elif 'ICMSST' in icms_node: icms_data = safe_get(icms_node, 'ICMSST')

        # Verifica se icms_data é um dicionário antes de usar
        if not isinstance(icms_data, dict):
             icms_data = {'raw': icms_data} # Guarda o valor bruto se não for dict

        try:
            trib_data = {
                'icms': icms_data if icms_data else None,
                'valor_total_tributos': to_decimal(safe_get(imp, 'vTotTrib')),
                'info_ad_fisco': safe_get(imp, 'infAdFisco'),
                # ICMSUFFim (<ICMSUFFim>) é complexo, pode ser adicionado como JSON se necessário
            }
            trib_data_cleaned = {k: v for k, v in trib_data.items() if v is not None}
            tributos, created_trib = CTeTributos.objects.update_or_create(
                cte=cte_doc,
                defaults=trib_data_cleaned
            )
        except Exception as e:
            print(f"ERRO ao processar tributos para CT-e {cte_doc.chave}: {e}")
            # Tenta continuar sem criar tributos
            tributos = None
    else:
        # Limpa tributos anteriores se o bloco <imp> não existir
        CTeTributos.objects.filter(cte=cte_doc).delete()

    return prestacao, tributos

@transaction.atomic
def parse_cte_carga(cte_doc, infcte):
    """Parseia o bloco <infCarga>."""
    # O bloco pode estar dentro de <infCteNorm> ou <infCteComp> etc.
    inf_carga = safe_get(infcte, 'infCteNorm.infCarga') or \
                safe_get(infcte, 'infCteComp.infCarga') or \
                safe_get(infcte, 'infCteAnu.infCarga') # Adicione outros se necessário
    if not inf_carga:
        CTeCarga.objects.filter(cte=cte_doc).delete() # Limpa carga anterior
        return None

    # Garantir que campos obrigatórios existam
    valor_carga = to_decimal(safe_get(inf_carga, 'vCarga'))
    if valor_carga is None or valor_carga == 0:
        valor_carga = Decimal('0.01')  # Valor mínimo
        print(f"WARN: Valor da carga não informado ou zero para CT-e {cte_doc.chave}. Usando valor padrão.")

    produto_predominante = safe_get(inf_carga, 'proPred')
    if not produto_predominante:
        produto_predominante = "MERCADORIA DIVERSA"
        print(f"WARN: Produto predominante não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

    try:
        carga_data = {
            'valor_carga': valor_carga,
            'produto_predominante': produto_predominante,
            'outras_caracteristicas': safe_get(inf_carga, 'xOutCat'),
            'valor_carga_averbada': to_decimal(safe_get(inf_carga, 'vCargaAverb')),
        }
        carga_data_cleaned = {k: v for k, v in carga_data.items() if v is not None}
        carga, created = CTeCarga.objects.update_or_create(
            cte=cte_doc,
            defaults=carga_data_cleaned
        )

        # Quantidades de Carga <infQ>
        inf_q_list = safe_get(inf_carga, 'infQ', [])
        if not isinstance(inf_q_list, list): inf_q_list = [inf_q_list]
        CTeQuantidadeCarga.objects.filter(carga=carga).delete() # Limpa anteriores
        for inf_q in inf_q_list:
             if isinstance(inf_q, dict):
                codigo = safe_get(inf_q, 'cUnid')
                tipo = safe_get(inf_q, 'tpMed')
                quantidade = to_decimal(safe_get(inf_q, 'qCarga'))
                
                if codigo and tipo and quantidade is not None:
                    CTeQuantidadeCarga.objects.create(
                        carga=carga,
                        codigo_unidade=codigo,
                        tipo_medida=tipo,
                        quantidade=quantidade
                    )
        return carga
    except Exception as e:
        print(f"ERRO ao processar carga para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_documentos(cte_doc, infcte):
    """Parseia o bloco <infDoc> (NF-e, NF, Outros)."""
    # O bloco pode estar dentro de <infCteNorm> ou <infCteComp> etc.
    inf_doc = safe_get(infcte, 'infCteNorm.infDoc') or \
              safe_get(infcte, 'infCteComp.infDoc') or \
              safe_get(infcte, 'infCteAnu.infDoc') # Adicione outros se necessário

    CTeDocumentoTransportado.objects.filter(cte=cte_doc).delete() # Limpa todos os anteriores para este CT-e
    if not inf_doc:
        return 0 # Retorna 0 documentos processados

    try:
        count = 0

        # Notas Fiscais Eletrônicas <infNFe>
        inf_nfe_list = safe_get(inf_doc, 'infNFe', [])
        if not isinstance(inf_nfe_list, list): inf_nfe_list = [inf_nfe_list]
        for nfe in inf_nfe_list:
             if isinstance(nfe, dict):
                # dPrev não mapeado diretamente, pode ir para observações se necessário
                # infUnidCarga e infUnidTransp omitidos por complexidade
                chave_nfe = safe_get(nfe, 'chave')
                if chave_nfe:
                    CTeDocumentoTransportado.objects.create(
                        cte=cte_doc,
                        tipo_documento='NFe',
                        chave_nfe=chave_nfe,
                        pin_suframa_nf=safe_get(nfe, 'PIN'),
                    )
                    count += 1

        # Notas Fiscais (Papel) <infNF>
        inf_nf_list = safe_get(inf_doc, 'infNF', [])
        if not isinstance(inf_nf_list, list): inf_nf_list = [inf_nf_list]
        for nf in inf_nf_list:
             if isinstance(nf, dict):
                # Remetente/Dest da NF omitidos (usar os do CT-e)
                # infUnidCarga e infUnidTransp omitidos por complexidade
                modelo = safe_get(nf, 'mod')
                numero = safe_get(nf, 'nDoc')
                
                if modelo and numero:
                    CTeDocumentoTransportado.objects.create(
                        cte=cte_doc,
                        tipo_documento='NF',
                        modelo_nf=modelo,
                        serie_nf=safe_get(nf, 'serie'),
                        numero_nf=numero,
                        data_emissao_nf=parse_date(safe_get(nf, 'dEmi')),
                        valor_bc_icms_nf=to_decimal(safe_get(nf, 'vBC')),
                        valor_icms_nf=to_decimal(safe_get(nf, 'vICMS')),
                        valor_bc_st_nf=to_decimal(safe_get(nf, 'vBCST')),
                        valor_st_nf=to_decimal(safe_get(nf, 'vST')),
                        valor_produtos_nf=to_decimal(safe_get(nf, 'vProd')),
                        valor_total_nf=to_decimal(safe_get(nf, 'vNF')),
                        cfop_pred_nf=safe_get(nf, 'nCFOP'), # Mapeia nCFOP para cfop_pred_nf
                        peso_total_kg_nf=to_decimal(safe_get(nf, 'nPeso'), default=Decimal('0.000')),
                        pin_suframa_nf=safe_get(nf, 'PIN'),
                    )
                    count += 1

        # Outros Documentos <infOutros>
        inf_outros_list = safe_get(inf_doc, 'infOutros', [])
        if not isinstance(inf_outros_list, list): inf_outros_list = [inf_outros_list]
        for outro in inf_outros_list:
             if isinstance(outro, dict):
                # infUnidCarga e infUnidTransp omitidos
                tipo_doc = safe_get(outro, 'tpDoc')
                numero = safe_get(outro, 'nDoc')
                
                if tipo_doc and numero:
                    CTeDocumentoTransportado.objects.create(
                        cte=cte_doc,
                        tipo_documento='Outros',
                        tipo_doc_outros=tipo_doc,
                        desc_outros=safe_get(outro, 'descOutros'),
                        numero_outros=numero,
                        data_emissao_outros=parse_date(safe_get(outro, 'dEmi')),
                        valor_doc_outros=to_decimal(safe_get(outro, 'vDocFisc')),
                    )
                    count += 1

        return count
    except Exception as e:
        print(f"ERRO ao processar documentos transportados para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_seguro(cte_doc, infcte):
    """Parseia o bloco <seg>."""
    # O bloco pode estar dentro de <infCteNorm>
    seg_list = safe_get(infcte, 'infCteNorm.seg', [])
    if not isinstance(seg_list, list): seg_list = [seg_list]

    # Se não tiver seguro, limpa os anteriores
    if not seg_list or all(not isinstance(seg, dict) for seg in seg_list):
        CTeSeguro.objects.filter(cte=cte_doc).delete()
        return 0

    try:
        CTeSeguro.objects.filter(cte=cte_doc).delete() # Limpa anteriores
        count = 0
        for seg in seg_list:
             if isinstance(seg, dict):
                # Garantir valores obrigatórios
                responsavel = safe_get(seg, 'respSeg')
                if not responsavel:
                    responsavel = '5'  # 5 = Emitente CT-e (valor padrão)
                    print(f"WARN: Responsável pelo seguro não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

                nome_seguradora = safe_get(seg, 'xSeg')
                if not nome_seguradora:
                    nome_seguradora = "SEGURADORA NÃO INFORMADA"
                    print(f"WARN: Nome da seguradora não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

                numero_apolice = safe_get(seg, 'nApol')
                if not numero_apolice:
                    numero_apolice = "APÓLICE NÃO INFORMADA"
                    print(f"WARN: Número da apólice não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

                # Valor da carga é obrigatório
                valor_carga = to_decimal(safe_get(seg, 'vCarga'))
                if valor_carga is None or valor_carga == 0:
                    valor_carga = Decimal('0.01')  # Valor mínimo
                    print(f"WARN: Valor da carga no seguro não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

                CTeSeguro.objects.create(
                    cte=cte_doc,
                    responsavel=responsavel,
                    nome_seguradora=nome_seguradora,
                    numero_apolice=numero_apolice,
                    numero_averbacao=safe_get(seg, 'nAver'),
                    valor_carga_averbada=valor_carga,
                )
                count += 1
        return count
    except Exception as e:
        print(f"ERRO ao processar seguro para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_modal_rodoviario(cte_doc, infcte):
    """Parseia o bloco <infModal versaoModal='x.xx'><rodo>."""
    # O bloco pode estar dentro de <infCteNorm> etc.
    inf_modal = safe_get(infcte, 'infCteNorm.infModal') or safe_get(infcte, 'infModal')
    if not inf_modal or safe_get(inf_modal, '@versaoModal') is None:
        CTeModalRodoviario.objects.filter(cte=cte_doc).delete() # Limpa anterior
        return None

    rodo = safe_get(inf_modal, 'rodo')
    if not rodo:
        CTeModalRodoviario.objects.filter(cte=cte_doc).delete() # Limpa anterior
        return None # Não é modal rodoviário

    try:
        # Garantir RNTRC obrigatório
        rntrc = safe_get(rodo, 'RNTRC')
        if not rntrc:
            rntrc = "00000000"  # Valor padrão
            print(f"WARN: RNTRC não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

        modal_data = {
            'rntrc': rntrc,
            'data_prevista_entrega': parse_date(safe_get(rodo, 'dPrev')),
            'lotacao': to_boolean(safe_get(rodo, 'lota', '0')), # Indicador de Lotação
            # <occ> (Ordem de Coleta) omitido
        }
        modal_data_cleaned = {k: v for k, v in modal_data.items() if v is not None}
        modal, created = CTeModalRodoviario.objects.update_or_create(
            cte=cte_doc,
            defaults=modal_data_cleaned
        )

        # --- Veículos <veic> ---
        veic_list = safe_get(rodo, 'veic', [])
        if not isinstance(veic_list, list): veic_list = [veic_list]
        CTeVeiculoRodoviario.objects.filter(modal=modal).delete() # Limpa anteriores
        for veic in veic_list:
             if isinstance(veic, dict):
                prop = safe_get(veic, 'prop') # Dados do proprietário (opcional)
                placa = safe_get(veic, 'placa')
                
                if placa:  # Garante que pelo menos placa exista
                    veic_data = {
                        'placa': placa,
                        'renavam': safe_get(veic, 'RENAVAM'),
                        'tara': to_int(safe_get(veic, 'tara')) or 0,  # Garante valor default
                        'cap_kg': to_int(safe_get(veic, 'capKG')),
                        'cap_m3': to_int(safe_get(veic, 'capM3')),
                        'tipo_proprietario': safe_get(veic, 'tpProp'),
                        'tipo_veiculo': safe_get(veic, 'tpVeic'),
                        'tipo_rodado': safe_get(veic, 'tpRod'),
                        'tipo_carroceria': safe_get(veic, 'tpCar'),
                        'uf_licenciamento': safe_get(veic, 'UF'),
                        # Proprietário (se houver dentro de <veic>)
                        'prop_cnpj': safe_get(prop, 'CNPJ') if prop else None,
                        'prop_cpf': safe_get(prop, 'CPF') if prop else None,
                        'prop_rntrc': safe_get(prop, 'RNTRC') if prop else None,
                        'prop_razao_social': safe_get(prop, 'xNome') if prop else None,
                        'prop_ie': safe_get(prop, 'IE') if prop else None,
                        'prop_uf': safe_get(prop, 'UF') if prop else None,
                    }
                    veic_data_cleaned = {k: v for k, v in veic_data.items() if v is not None}
                    CTeVeiculoRodoviario.objects.create(modal=modal, **veic_data_cleaned)

        # --- Motoristas <moto> ---
        moto_list = safe_get(rodo, 'moto', [])
        if not isinstance(moto_list, list): moto_list = [moto_list]
        CTeMotorista.objects.filter(modal=modal).delete() # Limpa anteriores
        for moto in moto_list:
            if isinstance(moto, dict):
                nome = safe_get(moto, 'xNome')
                cpf = safe_get(moto, 'CPF')
                
                if nome and cpf:  # Garante que nome e CPF existam
                    CTeMotorista.objects.create(
                        modal=modal,
                        nome=nome,
                        cpf=cpf
                    )

        return modal
    except Exception as e:
        print(f"ERRO ao processar modal rodoviário para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_autorizados_xml(cte_doc, infcte):
    """Parseia o bloco <autXML>."""
    aut_list = safe_get(infcte, 'autXML', [])
    if not isinstance(aut_list, list): aut_list = [aut_list]

    try:
        CTeAutXML.objects.filter(cte=cte_doc).delete() # Limpa anteriores
        count = 0
        for aut in aut_list:
             if isinstance(aut, dict):
                cnpj = safe_get(aut, 'CNPJ')
                cpf = safe_get(aut, 'CPF')
                # Pelo menos um identificador é obrigatório
                if cnpj or cpf:
                    CTeAutXML.objects.create(
                        cte=cte_doc,
                        cnpj=cnpj,
                        cpf=cpf
                    )
                    count += 1
        return count
    except Exception as e:
        print(f"ERRO ao processar autorizados XML para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_responsavel_tecnico(cte_doc, infcte):
    """Parseia o bloco <infRespTec>."""
    resp_tec = safe_get(infcte, 'infRespTec')
    if not resp_tec:
        CTeResponsavelTecnico.objects.filter(cte=cte_doc).delete() # Limpa anterior
        return None

    try:
        # Garantir campos obrigatórios
        cnpj = safe_get(resp_tec, 'CNPJ')
        if not cnpj:
            cnpj = "00000000000000"  # Valor padrão
            print(f"WARN: CNPJ do responsável técnico não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

        contato = safe_get(resp_tec, 'xContato')
        if not contato:
            contato = "CONTATO NÃO INFORMADO"
            print(f"WARN: Nome do contato técnico não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

        email = safe_get(resp_tec, 'email')
        if not email:
            email = "email@nao.informado"
            print(f"WARN: Email do contato técnico não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

        telefone = safe_get(resp_tec, 'fone')
        if not telefone:
            telefone = "0000000000"
            print(f"WARN: Telefone do contato técnico não informado para CT-e {cte_doc.chave}. Usando valor padrão.")

        resp_data = {
            'cnpj': cnpj,
            'contato': contato,
            'email': email,
            'telefone': telefone,
            'id_csr': safe_get(resp_tec, 'idCSRT'),
            'hash_csr': safe_get(resp_tec, 'hashCSRT'),
        }
        resp_data_cleaned = {k: v for k, v in resp_data.items() if v is not None}

        obj, created = CTeResponsavelTecnico.objects.update_or_create(
            cte=cte_doc,
            defaults=resp_data_cleaned
        )
        return obj
    except Exception as e:
        print(f"ERRO ao processar responsável técnico para CT-e {cte_doc.chave}: {e}")
        raise

@transaction.atomic
def parse_cte_protocolo(cte_doc, prot_cte):
    """Parseia o bloco <protCTe> que vem dentro de <procCTe> ou <cteProc>."""
    if not prot_cte or not isinstance(prot_cte, dict):
        # Não deleta, pois pode já ter sido salvo antes sem protocolo
        # CTeProtocoloAutorizacao.objects.filter(cte=cte_doc).delete()
        return None

    inf_prot = safe_get(prot_cte, 'infProt')
    if not inf_prot:
        # CTeProtocoloAutorizacao.objects.filter(cte=cte_doc).delete()
        return None

    # Verifica se a chave do protocolo bate com a chave do documento
    chave_protocolo = safe_get(inf_prot, 'chCTe')
    if chave_protocolo and chave_protocolo != cte_doc.chave:
        print(f"ERROR: Chave no protocolo ({chave_protocolo}) diferente da chave do CT-e ({cte_doc.chave})")
        # Decidir como tratar: ignorar protocolo, logar erro, etc.
        return None # Ignora protocolo inconsistente

    try:
        # Garantir campos obrigatórios
        codigo_status = to_int(safe_get(inf_prot, 'cStat'))
        if codigo_status is None:
            codigo_status = 0  # Valor padrão
            print(f"WARN: Código de status não informado no protocolo para CT-e {cte_doc.chave}. Usando valor padrão.")

        motivo_status = safe_get(inf_prot, 'xMotivo')
        if not motivo_status:
            motivo_status = "MOTIVO NÃO INFORMADO"
            print(f"WARN: Motivo do status não informado no protocolo para CT-e {cte_doc.chave}. Usando valor padrão.")

        prot_data = {
            'ambiente': to_int(safe_get(inf_prot, 'tpAmb')) or 2,  # 2 = Homologação padrão
            'versao_aplic': safe_get(inf_prot, 'verAplic') or "VERSÃO NÃO INFORMADA",
            'data_recebimento': parse_datetime(safe_get(inf_prot, 'dhRecbto')) or datetime.now(),
            'numero_protocolo': safe_get(inf_prot, 'nProt') or "PROTOCOLO NÃO INFORMADO",
            'digest_value': safe_get(inf_prot, 'digVal'),
            'codigo_status': codigo_status,
            'motivo_status': motivo_status,
        }

        prot_data_cleaned = {k: v for k, v in prot_data.items() if v is not None}

        # Protocolo deve ser único por CT-e, mas número de protocolo é globalmente único
        obj, created = CTeProtocoloAutorizacao.objects.update_or_create(
            cte=cte_doc,
            # Usar numero_protocolo como chave de busca alternativa se necessário garantir unicidade
            # numero_protocolo=prot_data_cleaned.get('numero_protocolo'),
            defaults=prot_data_cleaned
        )
        return obj
    except Exception as e:
        print(f"ERRO ao processar protocolo para CT-e {cte_doc.chave}: {e}")
        # Continue sem o protocolo
        return None

@transaction.atomic
def parse_cte_suplementar(cte_doc, inf_supl):
    """Parseia o bloco <infCTeSupl>."""
    if not inf_supl:
        CTeSuplementar.objects.filter(cte=cte_doc).delete() # Limpa anterior
        return None

    try:
        # Garantir URL QR Code obrigatória
        qr_code_url = safe_get(inf_supl, 'qrCodCTe')
        if not qr_code_url:
            print(f"WARN: QR Code não informado para CT-e {cte_doc.chave}. Ignorando bloco suplementar.")
            CTeSuplementar.objects.filter(cte=cte_doc).delete()
            return None

        supl_data = {
            'qr_code_url': qr_code_url,
        }
        supl_data_cleaned = {k: v for k, v in supl_data.items() if v is not None}

        obj, created = CTeSuplementar.objects.update_or_create(
            cte=cte_doc,
            defaults=supl_data_cleaned
        )
        return obj
    except Exception as e:
        print(f"ERRO ao processar dados suplementares para CT-e {cte_doc.chave}: {e}")
        # Continue sem dados suplementares
        return None

# --- Main Parser Orchestrator ---

def parse_cte_completo(cte_doc):
    """
    Função principal para parsear todo o XML do CTeDocumento.
    Assume que cte_doc.xml_original contém o texto do XML.
    Retorna True se o processamento foi bem-sucedido (mesmo que parcial), False se houve erro crítico.
    """
    if not cte_doc.xml_original:
        print(f"ERROR: CT-e {cte_doc.chave} não possui XML original para processar.")
        cte_doc.processado = False
        cte_doc.save(update_fields=['processado']) # Marca como não processado
        return False

    try:
        xml_dict = xmltodict.parse(cte_doc.xml_original)
        infcte, versao_proc = get_cte_infcte(xml_dict) # Pode levantar ValueError
        prot_cte = get_cte_protocolo(xml_dict) # Pode ser None
        inf_supl = get_cte_suplementar(xml_dict) # Pode ser None

        # Atualiza a versão no documento principal se não foi pega na view
        if not cte_doc.versao or cte_doc.versao == 'N/A':
            cte_doc.versao = versao_proc or infcte.get('@versao', '4.00') # Pega do proc ou do infCte

    except Exception as e:
        print(f"ERROR: Falha ao parsear XML base ou encontrar <infCte> para CT-e {cte_doc.chave}: {e}")
        cte_doc.processado = False
        cte_doc.save(update_fields=['processado', 'versao']) # Salva o status de erro e versão
        return False # Indica falha no processamento

    try:
        # --- Processamento dentro de uma única transação ---
        with transaction.atomic():
            # Parsear seções principais - na ordem correta para evitar problemas de referência
            identificacao = parse_cte_identificacao(cte_doc, infcte)
            parse_cte_complemento(cte_doc, infcte)
            parse_entidade(cte_doc, infcte, 'emit', CTeEmitente)
            parse_entidade(cte_doc, infcte, 'rem', CTeRemetente)
            parse_entidade(cte_doc, infcte, 'dest', CTEDestinatario)
           # Parsear opcionais
            parse_entidade(cte_doc, infcte, 'exped', CTeExpedidor)
            parse_entidade(cte_doc, infcte, 'receb', CTeRecebedor)
            # Valores e Impostos
            prestacao, tributos = parse_cte_valores(cte_doc, infcte)
            # Carga
            parse_cte_carga(cte_doc, infcte)
            # Documentos Transportados
            parse_cte_documentos(cte_doc, infcte)
            # Seguro
            parse_cte_seguro(cte_doc, infcte)
            # Modal Rodoviário
            parse_cte_modal_rodoviario(cte_doc, infcte)
            # Outros
            parse_cte_autorizados_xml(cte_doc, infcte)
            parse_cte_responsavel_tecnico(cte_doc, infcte)

            # --- Parsear Protocolo e Suplementar (fora do infCte) ---
            if prot_cte:
                 parse_cte_protocolo(cte_doc, prot_cte)
            if inf_supl:
                 parse_cte_suplementar(cte_doc, inf_supl)

            # --- Atualizar o CTeDocumento ---
            # Atualiza a modalidade (CIF/FOB) - Lógica de exemplo:
            # Determina a modalidade a partir do XML ou dados extraídos
            modalidade_frete = None
            if identificacao and identificacao.toma is not None:
                 # Lógica baseada no tomador ou documentos transportados
                 if identificacao.toma == 0: # Remetente paga = CIF (geralmente)
                     modalidade_frete = 'CIF'
                 elif identificacao.toma == 3: # Destinatário paga = FOB (geralmente)
                      modalidade_frete = 'FOB'
                 else:
                      # Tentar detectar de outras formas
                      # Olhar em <vPrest><Comp> por componentes nomeados como CIF/FOB
                      if prestacao:
                          comp_values = CTeComponenteValor.objects.filter(prestacao=prestacao)
                          for comp in comp_values:
                              if 'CIF' in comp.nome.upper():
                                  modalidade_frete = 'CIF'
                                  break
                              elif 'FOB' in comp.nome.upper():
                                  modalidade_frete = 'FOB'
                                  break
            
            # Tentar também por observações contribuinte
            if not modalidade_frete and hasattr(cte_doc, 'complemento') and cte_doc.complemento:
                obs_list = CTeObservacaoContribuinte.objects.filter(complemento=cte_doc.complemento)
                for obs in obs_list:
                    if 'CIF' in obs.campo.upper() or 'CIF' in obs.texto.upper():
                        modalidade_frete = 'CIF'
                        break
                    elif 'FOB' in obs.campo.upper() or 'FOB' in obs.texto.upper():
                        modalidade_frete = 'FOB'
                        break
            
            # Valor padrão se não conseguiu detectar
            if not modalidade_frete:
                modalidade_frete = 'CIF'  # Valor padrão se não identificar
                print(f"INFO: Não foi possível determinar modalidade CIF/FOB para CT-e {cte_doc.chave}. Usando valor padrão CIF.")

            cte_doc.modalidade = modalidade_frete
            cte_doc.processado = True # Marcar como processado se chegou até aqui
            cte_doc.save() # Salva CTeDocumento com status e modalidade

        print(f"INFO: CT-e {cte_doc.chave} processado com sucesso.")
        return True # Sucesso

    except Exception as e:
        # Log detalhado do erro
        print(f"ERROR: Falha ao processar dados detalhados do CT-e {cte_doc.chave}. Erro: {e}")
        print(traceback.format_exc())
        # A transação será revertida automaticamente pelo @transaction.atomic
        # Garante que o status processado continue False (ou volte a False se já tinha sido salvo)
        # Tenta salvar o status de erro mesmo com o rollback
        try:
            cte_doc_error = CTeDocumento.objects.get(pk=cte_doc.pk)
            cte_doc_error.processado = False
            cte_doc_error.save(update_fields=['processado'])
        except Exception as save_err:
             print(f"ERROR: Falha ao salvar status de erro para CT-e {cte_doc.chave}: {save_err}")

        return False # Indica falha no processamento