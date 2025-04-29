# transport/services/parser_mdfe.py

import xmltodict
import traceback
from decimal import Decimal, InvalidOperation
from datetime import datetime
from dateutil import parser as date_parser # pip install python-dateutil
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist, ValidationError

# Reutilizar helpers do parser_cte (ou copiar/colar aqui)
# Certifique-se de que essas funções estejam acessíveis.
try:
    from .parser_cte import (
        safe_get, to_decimal, to_int, to_boolean,
        parse_datetime, parse_date, parse_time, parse_endereco
    )
except ImportError:
    # Defina as funções aqui como fallback se não puder importar
    print("WARN: Não foi possível importar helpers de parser_cte. Definindo localmente.")
    
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
        """Converte string de data/hora (com ou sem timezone) para objeto datetime."""
        if not value:
            return default
        try:
            # dateutil.parser lida com vários formatos, incluindo timezone
            dt = date_parser.parse(value)
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
        if isinstance(value, str) and len(value) >= 8: # Ex: HH:MM:SS
            try:
                 return date_parser.parse(value).time()
            except (ValueError, TypeError):
                 pass
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

# Importar todos os Modelos MDF-e e relacionados (CTeDocumento para vínculo)
from transport.models import (
    Endereco, CTeDocumento,
    MDFeDocumento, MDFeIdentificacao, MDFeMunicipioCarregamento, MDFePercurso,
    MDFeEmitente, MDFeModalRodoviario, MDFeVeiculoTracao, MDFeVeiculoReboque,
    MDFeCondutor, MDFeCIOT, MDFeValePedagio, MDFeContratante,
    MDFeMunicipioDescarga, MDFeDocumentosVinculados, MDFeProdutoPerigoso,
    MDFeSeguroCarga, MDFeAverbacaoSeguro, MDFeProdutoPredominante, MDFeTotais,
    MDFeLacreRodoviario, MDFeAutXML, MDFeInformacoesAdicionais,
    MDFeResponsavelTecnico, MDFeProtocoloAutorizacao, MDFeSuplementar,
    MDFeCancelamento
)

# --- Helper Functions Específicas (se necessário) ---

def get_mdfe_infmdfe(xml_dict):
    """Encontra o bloco <infMDFe> no dicionário XML parseado e a versão."""
    proc_mdfe = xml_dict.get('procMDFe')
    mdfe_proc = xml_dict.get('mdfeProc')

    if proc_mdfe and 'MDFe' in proc_mdfe and 'infMDFe' in proc_mdfe['MDFe']:
        return proc_mdfe['MDFe']['infMDFe'], proc_mdfe.get('@versao')
    elif mdfe_proc and 'MDFe' in mdfe_proc and 'infMDFe' in mdfe_proc['MDFe']:
        return mdfe_proc['MDFe']['infMDFe'], mdfe_proc.get('@versao')
    elif 'MDFe' in xml_dict and 'infMDFe' in xml_dict['MDFe']: # Sem proc
        return xml_dict['MDFe']['infMDFe'], xml_dict['MDFe'].get('@versao')
    else:
        raise ValueError("Não foi possível encontrar o bloco <infMDFe> ou <MDFe> no XML.")

def get_mdfe_protocolo(xml_dict):
    """Encontra o bloco <protMDFe> no dicionário XML parseado."""
    proc_mdfe = xml_dict.get('procMDFe')
    mdfe_proc = xml_dict.get('mdfeProc')

    if proc_mdfe and 'protMDFe' in proc_mdfe:
        return proc_mdfe['protMDFe']
    elif mdfe_proc and 'protMDFe' in mdfe_proc:
        return mdfe_proc['protMDFe']
    return None

def get_mdfe_suplementar(xml_dict):
     """Encontra o bloco <infMDFeSupl> no dicionário XML parseado."""
     # Ele geralmente está dentro de <MDFe>, não dentro de <procMDFe> etc.
     mdfe_node = xml_dict.get('procMDFe', {}).get('MDFe') or \
                xml_dict.get('mdfeProc', {}).get('MDFe') or \
                xml_dict.get('MDFe')
     if mdfe_node:
         return safe_get(mdfe_node, 'infMDFeSupl')
     return None

# --- Parser Functions por Seção do Modelo ---

@transaction.atomic
def parse_mdfe_identificacao(mdfe_doc, infmdfe):
    """Parseia o bloco <ide> do MDF-e."""
    ide = safe_get(infmdfe, 'ide')
    if not ide:
        print(f"WARN: Bloco <ide> não encontrado para MDF-e {mdfe_doc.chave}")
        MDFeIdentificacao.objects.filter(mdfe=mdfe_doc).delete() # Limpa anterior
        return None

    ide_data = {
        'c_uf': to_int(safe_get(ide, 'cUF')),
        'tp_amb': to_int(safe_get(ide, 'tpAmb')),
        'tp_emit': to_int(safe_get(ide, 'tpEmit')),
        'tp_transp': to_int(safe_get(ide, 'tpTransp')), # Opcional
        'mod': safe_get(ide, 'mod'),
        'serie': to_int(safe_get(ide, 'serie')),
        'n_mdf': to_int(safe_get(ide, 'nMDF')),
        'c_mdf': safe_get(ide, 'cMDF'), # Código numérico da chave
        'c_dv': safe_get(ide, 'cDV'), # Dígito verificador
        'modal': safe_get(ide, 'modal'),
        'dh_emi': parse_datetime(safe_get(ide, 'dhEmi')),
        'tp_emis': to_int(safe_get(ide, 'tpEmis')),
        'proc_emi': to_int(safe_get(ide, 'procEmi')),
        'ver_proc': safe_get(ide, 'verProc'),
        'uf_ini': safe_get(ide, 'UFIni'),
        'uf_fim': safe_get(ide, 'UFFim'),
        # infViagem é opcional e pode não existir em versões antigas
        'dh_ini_viagem': parse_datetime(safe_get(ide, 'infViagem.dhIniViagem')),
        'ind_carga_posterior': to_boolean(safe_get(ide, 'infViagem.indCargaPosterior', '0')),
        'ind_canal_verde': to_boolean(safe_get(ide, 'indCanalVerde', '0')), # Opcional
    }
    ide_data_cleaned = {k: v for k, v in ide_data.items() if v is not None}

    identificacao, created = MDFeIdentificacao.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=ide_data_cleaned
    )

    # --- Municípios de Carregamento <infMunCarrega> ---
    mun_carrega_list = safe_get(ide, 'infMunCarrega', [])
    if not isinstance(mun_carrega_list, list): mun_carrega_list = [mun_carrega_list]
    MDFeMunicipioCarregamento.objects.filter(identificacao=identificacao).delete() # Limpa anteriores
    for mun in mun_carrega_list:
        if isinstance(mun, dict):
            MDFeMunicipioCarregamento.objects.create(
                identificacao=identificacao,
                c_mun_carrega=safe_get(mun, 'cMunCarrega'),
                x_mun_carrega=safe_get(mun, 'xMunCarrega')
            )

    # --- Percurso <infPercurso> ---
    percurso_list = safe_get(ide, 'infPercurso', [])
    if not isinstance(percurso_list, list): percurso_list = [percurso_list]
    MDFePercurso.objects.filter(identificacao=identificacao).delete() # Limpa anteriores
    for per in percurso_list:
        if isinstance(per, dict):
            MDFePercurso.objects.create(
                identificacao=identificacao,
                uf_per=safe_get(per, 'UFPer')
            )

    return identificacao


@transaction.atomic
def parse_mdfe_emitente(mdfe_doc, infmdfe):
    """Parseia o bloco <emit> do MDF-e."""
    emit_dict = safe_get(infmdfe, 'emit')
    if not emit_dict:
        print(f"WARN: Bloco <emit> não encontrado para MDF-e {mdfe_doc.chave}")
        MDFeEmitente.objects.filter(mdfe=mdfe_doc).delete() # Limpa anterior
        return None

    endereco_data = parse_endereco(safe_get(emit_dict, 'enderEmit'))
    emit_data = {
        'cnpj': safe_get(emit_dict, 'CNPJ'),
        'cpf': safe_get(emit_dict, 'CPF'),
        'ie': safe_get(emit_dict, 'IE'),
        'razao_social': safe_get(emit_dict, 'xNome'),
        'nome_fantasia': safe_get(emit_dict, 'xFant'),
        'telefone': safe_get(emit_dict, 'fone'),
        'email': safe_get(emit_dict, 'email'), # Não padrão no schema, mas pode existir
        **endereco_data
    }
    emit_data_cleaned = {k: v for k, v in emit_data.items() if v is not None}

    # Cria ou atualiza a entidade (incluindo o endereço base)
    obj, created = MDFeEmitente.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=emit_data_cleaned
    )
    return obj

@transaction.atomic
def parse_mdfe_modal_rodoviario(mdfe_doc, infmdfe):
    """Parseia o bloco <infModal versaoModal='x.xx'><rodo> do MDF-e."""
    inf_modal = safe_get(infmdfe, 'infModal')
    if not inf_modal or safe_get(inf_modal, '@versaoModal') is None:
        MDFeModalRodoviario.objects.filter(mdfe=mdfe_doc).delete() # Limpa anterior
        return None

    rodo = safe_get(inf_modal, 'rodo')
    if not rodo:
        MDFeModalRodoviario.objects.filter(mdfe=mdfe_doc).delete() # Limpa anterior
        return None # Não é modal rodoviário

    # --- Informações ANTT e Agendamento Porto ---
    inf_antt = safe_get(rodo, 'infANTT', {}) # Pode não existir
    modal_data = {
        # RNTRC pode estar em <infANTT> ou diretamente em <rodo> em versões antigas
        'rntrc': safe_get(inf_antt, 'RNTRC') or safe_get(rodo, 'RNTRC'),
        'codigo_agendamento_porto': safe_get(rodo, 'codAgPorto'), # Opcional
    }
    modal_data_cleaned = {k: v for k, v in modal_data.items() if v is not None}
    modal, created_modal = MDFeModalRodoviario.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=modal_data_cleaned
    )

    # --- Veículo Tração <veicTracao> (OneToOne com Modal) ---
    veic_tracao_dict = safe_get(rodo, 'veicTracao')
    MDFeVeiculoTracao.objects.filter(modal=modal).delete() # Limpa anterior
    if isinstance(veic_tracao_dict, dict):
        prop_tracao = safe_get(veic_tracao_dict, 'prop') # Opcional
        condutor_list_tracao = safe_get(veic_tracao_dict, 'condutor', []) # Condutor pode estar aqui
        if not isinstance(condutor_list_tracao, list): condutor_list_tracao = [condutor_list_tracao]

        tracao_data = {
            'placa': safe_get(veic_tracao_dict, 'placa'),
            'renavam': safe_get(veic_tracao_dict, 'RENAVAM'),
            'tara': to_int(safe_get(veic_tracao_dict, 'tara')),
            'cap_kg': to_int(safe_get(veic_tracao_dict, 'capKG')),
            'cap_m3': to_int(safe_get(veic_tracao_dict, 'capM3')),
            'tp_rod': safe_get(veic_tracao_dict, 'tpRod'),
            'tp_car': safe_get(veic_tracao_dict, 'tpCar'),
            'uf': safe_get(veic_tracao_dict, 'UF'),
            # Proprietário (se houver)
            'prop_cnpj': safe_get(prop_tracao, 'CNPJ') if prop_tracao else None,
            'prop_cpf': safe_get(prop_tracao, 'CPF') if prop_tracao else None,
            'prop_rntrc': safe_get(prop_tracao, 'RNTRC') if prop_tracao else None,
            'prop_razao_social': safe_get(prop_tracao, 'xNome') if prop_tracao else None,
            'prop_ie': safe_get(prop_tracao, 'IE') if prop_tracao else None,
            'prop_uf': safe_get(prop_tracao, 'UF') if prop_tracao else None,
            'prop_tp': safe_get(prop_tracao, 'tpProp') if prop_tracao else None,
        }
        tracao_data_cleaned = {k: v for k, v in tracao_data.items() if v is not None}
        veic_tracao, created_tracao = MDFeVeiculoTracao.objects.update_or_create(
            modal=modal, # Já criado ou atualizado acima
            defaults=tracao_data_cleaned
        )

        # --- Condutores <condutor> associados ao veículo de tração ---
        # Salva no MDFeCondutor principal, ligado ao MDFeDocumento
        # Limpa todos os condutores ANTES de processar para evitar duplicação se vierem em eventos também
        MDFeCondutor.objects.filter(mdfe=mdfe_doc).delete()
        for condutor in condutor_list_tracao:
            if isinstance(condutor, dict):
                cpf_condutor = safe_get(condutor, 'CPF')
                nome_condutor = safe_get(condutor, 'xNome')
                if cpf_condutor and nome_condutor:
                    MDFeCondutor.objects.update_or_create( # Evita duplicar se CPF já existe
                        mdfe=mdfe_doc,
                        cpf=cpf_condutor,
                        defaults={'nome': nome_condutor}
                    )

    # --- Veículos Reboque <veicReboque> (ForeignKey com Modal) ---
    reboque_list = safe_get(rodo, 'veicReboque', [])
    if not isinstance(reboque_list, list): reboque_list = [reboque_list]
    MDFeVeiculoReboque.objects.filter(modal=modal).delete() # Limpa anteriores
    for reboque_dict in reboque_list:
        if isinstance(reboque_dict, dict):
            prop_reboque = safe_get(reboque_dict, 'prop') # Opcional
            reboque_data = {
                'placa': safe_get(reboque_dict, 'placa'),
                'renavam': safe_get(reboque_dict, 'RENAVAM'),
                'tara': to_int(safe_get(reboque_dict, 'tara')),
                'cap_kg': to_int(safe_get(reboque_dict, 'capKG')),
                'cap_m3': to_int(safe_get(reboque_dict, 'capM3')),
                'tp_car': safe_get(reboque_dict, 'tpCar'),
                'uf': safe_get(reboque_dict, 'UF'),
                # Proprietário (se houver)
                'prop_cnpj': safe_get(prop_reboque, 'CNPJ') if prop_reboque else None,
                'prop_cpf': safe_get(prop_reboque, 'CPF') if prop_reboque else None,
                'prop_rntrc': safe_get(prop_reboque, 'RNTRC') if prop_reboque else None,
                'prop_razao_social': safe_get(prop_reboque, 'xNome') if prop_reboque else None,
                'prop_ie': safe_get(prop_reboque, 'IE') if prop_reboque else None,
                'prop_uf': safe_get(prop_reboque, 'UF') if prop_reboque else None,
                'prop_tp': safe_get(prop_reboque, 'tpProp') if prop_reboque else None,
            }
            reboque_data_cleaned = {k: v for k, v in reboque_data.items() if v is not None}
            MDFeVeiculoReboque.objects.create(modal=modal, **reboque_data_cleaned)

    # --- CIOT <infANTT><infCIOT> ---
    ciot_list = safe_get(inf_antt, 'infCIOT', []) # Pega de dentro de infANTT
    if not isinstance(ciot_list, list): ciot_list = [ciot_list]
    MDFeCIOT.objects.filter(modal=modal).delete() # Limpa anteriores
    for ciot_dict in ciot_list:
        if isinstance(ciot_dict, dict):
            MDFeCIOT.objects.create(
                modal=modal,
                ciot=safe_get(ciot_dict, 'CIOT'),
                cnpj_responsavel=safe_get(ciot_dict, 'CNPJ'), # CNPJ/CPF do responsável pelo CIOT
                cpf_responsavel=safe_get(ciot_dict, 'CPF')
            )

    # --- Vale Pedágio <infANTT><valePed> ---
    vale_list = safe_get(inf_antt, 'valePed', []) # Pega de dentro de infANTT
    if not isinstance(vale_list, list): vale_list = [vale_list]
    MDFeValePedagio.objects.filter(modal=modal).delete() # Limpa anteriores
    for vale_dict in vale_list:
        if isinstance(vale_dict, dict):
            # <disp> é uma lista dentro de <valePed>
            disp_list = safe_get(vale_dict, 'disp', [])
            if not isinstance(disp_list, list): disp_list = [disp_list]
            for disp in disp_list:
                 if isinstance(disp, dict):
                     MDFeValePedagio.objects.create(
                         modal=modal,
                         cnpj_fornecedor=safe_get(disp, 'CNPJForn'),
                         cnpj_pagador=safe_get(disp, 'CNPJPg'),
                         cpf_pagador=safe_get(disp, 'CPFPg'),
                         numero_compra=safe_get(disp, 'nCompra'),
                         valor_vale=to_decimal(safe_get(disp, 'vValePed')),
                         # tpValePed não mapeado
                     )

    # --- Contratantes <infANTT><infContratante> ---
    contratante_list = safe_get(inf_antt, 'infContratante', []) # Pega de dentro de infANTT
    if not isinstance(contratante_list, list): contratante_list = [contratante_list]
    MDFeContratante.objects.filter(modal=modal).delete() # Limpa anteriores
    for cont_dict in contratante_list:
        if isinstance(cont_dict, dict):
            MDFeContratante.objects.create(
                modal=modal,
                cnpj=safe_get(cont_dict, 'CNPJ'),
                cpf=safe_get(cont_dict, 'CPF')
            )

    return modal


@transaction.atomic
def parse_mdfe_documentos(mdfe_doc, infmdfe):
    """Parseia o bloco <infDoc> (municípios de descarga e documentos vinculados)."""
    inf_doc = safe_get(infmdfe, 'infDoc')
    if not inf_doc:
        # Limpa registros antigos se bloco não existir
        MDFeDocumentosVinculados.objects.filter(mdfe=mdfe_doc).delete()
        MDFeMunicipioDescarga.objects.filter(mdfe=mdfe_doc).delete()
        return 0 # Nenhum documento processado

    # Limpa todos os vínculos e municípios antigos ANTES de processar o bloco atual
    MDFeDocumentosVinculados.objects.filter(mdfe=mdfe_doc).delete()
    MDFeMunicipioDescarga.objects.filter(mdfe=mdfe_doc).delete()

    mun_descarga_list = safe_get(inf_doc, 'infMunDescarga', [])
    if not isinstance(mun_descarga_list, list): mun_descarga_list = [mun_descarga_list]

    total_docs_vinculados = 0

    for mun_dict in mun_descarga_list:
        if not isinstance(mun_dict, dict): continue

        # Cria o Município de Descarga
        c_mun = safe_get(mun_dict, 'cMunDescarga')
        if not c_mun:
            print(f"WARN: Município de descarga sem código para MDF-e {mdfe_doc.chave}. Pulando...")
            continue

        municipio, created_mun = MDFeMunicipioDescarga.objects.get_or_create(
            mdfe=mdfe_doc,
            c_mun_descarga=c_mun,
            defaults={'x_mun_descarga': safe_get(mun_dict, 'xMunDescarga')}
        )

        # Processa Documentos Vinculados a este município
        # --- CT-es Vinculados <infCTe> ---
        inf_cte_list = safe_get(mun_dict, 'infCTe', [])
        if not isinstance(inf_cte_list, list): inf_cte_list = [inf_cte_list]
        for cte_dict in inf_cte_list:
            if not isinstance(cte_dict, dict): continue

            chave_cte = safe_get(cte_dict, 'chCTe')
            if not chave_cte: continue

            # Tenta encontrar o CT-e no banco
            cte_relacionado_obj = CTeDocumento.objects.filter(chave=chave_cte).first()

            doc_vinculado, created_doc = MDFeDocumentosVinculados.objects.update_or_create(
                mdfe=mdfe_doc,
                chave_documento=chave_cte, # Chave única para o vínculo no MDF-e
                defaults={
                    'municipio_descarga': municipio, # Associa ao município atual
                    'seg_cod_barras': safe_get(cte_dict, 'segCodBarra'),
                    'ind_reentrega': to_boolean(safe_get(cte_dict, 'indReentrega', '0')),
                    'cte_relacionado': cte_relacionado_obj # Associa se encontrou
                    # infUnidCarga/infUnidTransp omitidos
                }
            )
            total_docs_vinculados += 1

            # Produtos Perigosos <peri> dentro de <infCTe>
            peri_list = safe_get(cte_dict, 'peri', [])
            if not isinstance(peri_list, list): peri_list = [peri_list]
            # Limpa perigosos antigos para este doc específico
            MDFeProdutoPerigoso.objects.filter(documento_vinculado=doc_vinculado).delete()
            for peri_dict in peri_list:
                 if isinstance(peri_dict, dict):
                     MDFeProdutoPerigoso.objects.create(
                         documento_vinculado=doc_vinculado,
                         n_onu=safe_get(peri_dict, 'nONU'),
                         x_nome_ae=safe_get(peri_dict, 'xNomeAE'),
                         x_cla_risco=safe_get(peri_dict, 'xClaRisco'),
                         gr_emb=safe_get(peri_dict, 'grEmb'),
                         q_tot_prod=safe_get(peri_dict, 'qTotProd'),
                         q_vol_tipo=safe_get(peri_dict, 'qVolTipo')
                         # pontoFulgor omitido
                     )

        # --- NF-es Vinculadas <infNFe> ---
        inf_nfe_list = safe_get(mun_dict, 'infNFe', [])
        if not isinstance(inf_nfe_list, list): inf_nfe_list = [inf_nfe_list]
        for nfe_dict in inf_nfe_list:
             if not isinstance(nfe_dict, dict): continue

             chave_nfe = safe_get(nfe_dict, 'chNFe')
             if not chave_nfe: continue

             # Tenta encontrar a NF-e no banco (se houver modelo NFeDocumento)
             # nfe_relacionada_obj = NFeDocumento.objects.filter(chave=chave_nfe).first()

             doc_vinculado, created_doc = MDFeDocumentosVinculados.objects.update_or_create(
                 mdfe=mdfe_doc,
                 chave_documento=chave_nfe, # Chave única para o vínculo no MDF-e
                 defaults={
                     'municipio_descarga': municipio,
                     'seg_cod_barras': safe_get(nfe_dict, 'segCodBarra'),
                     'ind_reentrega': to_boolean(safe_get(nfe_dict, 'indReentrega', '0')),
                     # 'nfe_relacionada': nfe_relacionada_obj # Associa se encontrou
                     # infUnidCarga/infUnidTransp omitidos
                 }
             )
             total_docs_vinculados += 1

             # Produtos Perigosos <peri> dentro de <infNFe>
             peri_list = safe_get(nfe_dict, 'peri', [])
             if not isinstance(peri_list, list): peri_list = [peri_list]
             MDFeProdutoPerigoso.objects.filter(documento_vinculado=doc_vinculado).delete() # Limpa anteriores
             for peri_dict in peri_list:
                  if isinstance(peri_dict, dict):
                      MDFeProdutoPerigoso.objects.create(
                          documento_vinculado=doc_vinculado,
                          n_onu=safe_get(peri_dict, 'nONU'),
                          x_nome_ae=safe_get(peri_dict, 'xNomeAE'),
                          x_cla_risco=safe_get(peri_dict, 'xClaRisco'),
                          gr_emb=safe_get(peri_dict, 'grEmb'),
                          q_tot_prod=safe_get(peri_dict, 'qTotProd'),
                          q_vol_tipo=safe_get(peri_dict, 'qVolTipo')
                          # pontoFulgor omitido
                      )

        # --- MDF-e Anteriores <infMDFeTransp> --- (Omitido por complexidade)

    return total_docs_vinculados

@transaction.atomic
def parse_mdfe_seguro(mdfe_doc, infmdfe):
    """Parseia o bloco <seg>."""
    seg_list = safe_get(infmdfe, 'seg', [])
    if not isinstance(seg_list, list): seg_list = [seg_list]

    # Se não houver seguros, limpamos os anteriores
    if not seg_list or len(seg_list) == 0:
        MDFeSeguroCarga.objects.filter(mdfe=mdfe_doc).delete()
        print(f"INFO: Nenhum bloco <seg> encontrado para MDF-e {mdfe_doc.chave}.")
        return 0

    MDFeSeguroCarga.objects.filter(mdfe=mdfe_doc).delete() # Limpa seguros anteriores
    count = 0
    for seg_dict in seg_list:
        if not isinstance(seg_dict, dict): 
            continue

        # Dados do Responsável pelo seguro
        inf_resp = safe_get(seg_dict, 'infResp', {}) # Responsável pode não existir

        # Dados da Seguradora
        inf_seg = safe_get(seg_dict, 'infSeg')
        if not inf_seg:
            print(f"WARN: Bloco <seg> sem <infSeg> para MDF-e {mdfe_doc.chave}. Pulando...")
            continue

        # CORREÇÃO: Garantir que responsavel sempre tenha um valor válido
        responsavel = safe_get(seg_dict, 'respSeg')
        if not responsavel:
            responsavel = '1'  # Valor padrão (1 = Emitente MDF-e)
            print(f"WARN: <respSeg> não encontrado para MDF-e {mdfe_doc.chave}. Usando valor padrão: {responsavel}")

        # Garantir que nome_seguradora e cnpj_seguradora tenham valores
        nome_seguradora = safe_get(inf_seg, 'xSeg')
        if not nome_seguradora:
            nome_seguradora = "SEGURADORA NÃO INFORMADA"
            print(f"WARN: <xSeg> não encontrado para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

        cnpj_seguradora = safe_get(inf_seg, 'CNPJ')
        if not cnpj_seguradora:
            cnpj_seguradora = "00000000000000"  # CNPJ padrão
            print(f"WARN: <CNPJ> da seguradora não encontrado para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

        numero_apolice = safe_get(inf_seg, 'nApol')
        if not numero_apolice:
            numero_apolice = "APOLICE-PADRAO"
            print(f"WARN: <nApol> não encontrado para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

        try:
            seguro = MDFeSeguroCarga.objects.create(
                mdfe=mdfe_doc,
                responsavel=responsavel,  # Agora garantimos que tem valor
                # Dados do responsável (se houver)
                cnpj_responsavel=safe_get(inf_resp, 'CNPJ'),
                cpf_responsavel=safe_get(inf_resp, 'CPF'),
                # Dados da seguradora (garantindo valores)
                nome_seguradora=nome_seguradora,
                cnpj_seguradora=cnpj_seguradora,
                numero_apolice=numero_apolice,
            )
            count += 1

            # Averbações <nAver> (pode ser uma lista de strings)
            aver_list = safe_get(inf_seg, 'nAver', [])
            if not isinstance(aver_list, list): aver_list = [aver_list]
            # Limpa averbações anteriores para este seguro
            MDFeAverbacaoSeguro.objects.filter(seguro=seguro).delete()
            for n_aver in aver_list:
                # nAver pode ser só a string ou um dict {'#text': 'string'}
                numero_averbacao = n_aver if isinstance(n_aver, str) else safe_get(n_aver, '#text')
                if numero_averbacao:
                    MDFeAverbacaoSeguro.objects.create(
                        seguro=seguro,
                        numero=numero_averbacao
                    )
        except Exception as e:
            print(f"ERRO ao criar seguro para MDF-e {mdfe_doc.chave}: {e}")
            # Continua tentando processar outros seguros
    
    return count

@transaction.atomic
def parse_mdfe_produto_predominante(mdfe_doc, infmdfe):
    """Parseia o bloco <prodPred>."""
    prod_pred_dict = safe_get(infmdfe, 'prodPred')
    if not prod_pred_dict:
        MDFeProdutoPredominante.objects.filter(mdfe=mdfe_doc).delete() # Limpa
        return None

    # Certifique-se de que o campo tp_carga tenha um valor (obrigatório)
    tp_carga = safe_get(prod_pred_dict, 'tpCarga')
    if not tp_carga:
        tp_carga = "01"  # Carga Geral (valor padrão)
        print(f"WARN: <tpCarga> não encontrado em <prodPred> para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

    # Certifique-se de que o campo x_prod tenha um valor (obrigatório)
    x_prod = safe_get(prod_pred_dict, 'xProd')
    if not x_prod:
        x_prod = "PRODUTO PREDOMINANTE NÃO ESPECIFICADO"
        print(f"WARN: <xProd> não encontrado em <prodPred> para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

    # infLotacao omitido por simplicidade (pode ser JSON)
    prod_data = {
        'tp_carga': tp_carga,
        'x_prod': x_prod,
        'ncm': safe_get(prod_pred_dict, 'infLotacao.NCM') or safe_get(prod_pred_dict, 'NCM'), # Tenta pegar de dentro de infLotacao primeiro
    }
    prod_data_cleaned = {k: v for k, v in prod_data.items() if v is not None}

    obj, created = MDFeProdutoPredominante.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=prod_data_cleaned
    )
    return obj

@transaction.atomic
def parse_mdfe_totais(mdfe_doc, infmdfe):
    """Parseia o bloco <tot>."""
    tot_dict = safe_get(infmdfe, 'tot')
    if not tot_dict:
        MDFeTotais.objects.filter(mdfe=mdfe_doc).delete() # Limpa
        return None

    # Garantir que campos obrigatórios estejam preenchidos
    v_carga = to_decimal(safe_get(tot_dict, 'vCarga'))
    if v_carga is None or v_carga == 0:
        v_carga = Decimal('0.01')  # Valor mínimo permitido
        print(f"WARN: <vCarga> não encontrado ou zero em <tot> para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

    c_unid = safe_get(tot_dict, 'cUnid')
    if not c_unid:
        c_unid = "01"  # KG (unidade de medida padrão)
        print(f"WARN: <cUnid> não encontrado em <tot> para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

    q_carga = to_decimal(safe_get(tot_dict, 'qCarga'))
    if q_carga is None or q_carga == 0:
        q_carga = Decimal('0.0001')  # Valor mínimo permitido
        print(f"WARN: <qCarga> não encontrado ou zero em <tot> para MDF-e {mdfe_doc.chave}. Usando valor padrão.")

    tot_data = {
        'q_cte': to_int(safe_get(tot_dict, 'qCTe')),
        'q_nfe': to_int(safe_get(tot_dict, 'qNFe')),
        'v_carga': v_carga,
        'c_unid': c_unid,
        'q_carga': q_carga,
    }
    tot_data_cleaned = {k: v for k, v in tot_data.items() if v is not None}

    obj, created = MDFeTotais.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=tot_data_cleaned
    )
    return obj

@transaction.atomic
def parse_mdfe_lacres(mdfe_doc, infmdfe):
    """Parseia o bloco <lacres>."""
    # Lacres podem estar direto em <infMDFe> ou dentro de <rodo>
    lacres_gerais = safe_get(infmdfe, 'lacres.nLacre', [])
    lacres_rodo = safe_get(infmdfe, 'infModal.rodo.lacres.nLacre', [])
    # Outros tipos de lacre: lacUnidCarga, lacUnidTransp (omitidos)

    lacre_list = []
    if isinstance(lacres_gerais, list): lacre_list.extend(lacres_gerais)
    elif lacres_gerais: lacre_list.append(lacres_gerais) # Se for string única

    if isinstance(lacres_rodo, list): lacre_list.extend(lacres_rodo)
    elif lacres_rodo: lacre_list.append(lacres_rodo)

    MDFeLacreRodoviario.objects.filter(mdfe=mdfe_doc).delete() # Limpa todos anteriores
    count = 0
    processed_lacres = set() # Para evitar duplicatas se aparecer em ambos os locais
    for n_lacre in lacre_list:
        numero_lacre = n_lacre if isinstance(n_lacre, str) else safe_get(n_lacre, '#text')
        if numero_lacre and numero_lacre not in processed_lacres:
             MDFeLacreRodoviario.objects.create(
                 mdfe=mdfe_doc,
                 numero=numero_lacre
             )
             processed_lacres.add(numero_lacre)
             count += 1
    return count

@transaction.atomic
def parse_mdfe_autorizados_xml(mdfe_doc, infmdfe):
    """Parseia o bloco <autXML>."""
    aut_list = safe_get(infmdfe, 'autXML', [])
    if not isinstance(aut_list, list): aut_list = [aut_list]

    MDFeAutXML.objects.filter(mdfe=mdfe_doc).delete() # Limpa anteriores
    count = 0
    for aut in aut_list:
         if isinstance(aut, dict):
            cnpj = safe_get(aut, 'CNPJ')
            cpf = safe_get(aut, 'CPF')
            if cnpj or cpf:
                MDFeAutXML.objects.create(
                    mdfe=mdfe_doc,
                    cnpj=cnpj,
                    cpf=cpf
                )
                count += 1
    return count

@transaction.atomic
def parse_mdfe_informacoes_adicionais(mdfe_doc, infmdfe):
    """Parseia o bloco <infAdic>."""
    inf_adic = safe_get(infmdfe, 'infAdic')
    if not inf_adic:
        MDFeInformacoesAdicionais.objects.filter(mdfe=mdfe_doc).delete() # Limpa
        return None

    adic_data = {
        'inf_ad_fisco': safe_get(inf_adic, 'infAdFisco'),
        'inf_cpl': safe_get(inf_adic, 'infCpl'),
    }
    adic_data_cleaned = {k: v for k, v in adic_data.items() if v is not None}
    obj, created = MDFeInformacoesAdicionais.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=adic_data_cleaned
    )
    return obj

@transaction.atomic
def parse_mdfe_responsavel_tecnico(mdfe_doc, infmdfe):
    """Parseia o bloco <infRespTec>."""
    resp_tec = safe_get(infmdfe, 'infRespTec')
    if not resp_tec:
        MDFeResponsavelTecnico.objects.filter(mdfe=mdfe_doc).delete() # Limpa
        return None

    resp_data = {
        'cnpj': safe_get(resp_tec, 'CNPJ'),
        'contato': safe_get(resp_tec, 'xContato'),
        'email': safe_get(resp_tec, 'email'),
        'telefone': safe_get(resp_tec, 'fone'),
        'id_csr': safe_get(resp_tec, 'idCSRT'),
        'hash_csr': safe_get(resp_tec, 'hashCSRT'),
    }
    resp_data_cleaned = {k: v for k, v in resp_data.items() if v is not None}

    obj, created = MDFeResponsavelTecnico.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=resp_data_cleaned
    )
    return obj

@transaction.atomic
def parse_mdfe_protocolo(mdfe_doc, prot_mdfe):
    """Parseia o bloco <protMDFe>."""
    if not prot_mdfe or not isinstance(prot_mdfe, dict):
        # Não deleta, pode ter sido salvo sem protocolo
        return None

    inf_prot = safe_get(prot_mdfe, 'infProt')
    if not inf_prot:
        return None

    chave_protocolo = safe_get(inf_prot, 'chMDFe')
    if chave_protocolo and chave_protocolo != mdfe_doc.chave:
        print(f"ERROR: Chave no protocolo MDF-e ({chave_protocolo}) diferente da chave do documento ({mdfe_doc.chave})")
        return None # Ignora protocolo inconsistente

    prot_data = {
        'ambiente': to_int(safe_get(inf_prot, 'tpAmb')),
        'versao_aplic': safe_get(inf_prot, 'verAplic'),
        'data_recebimento': parse_datetime(safe_get(inf_prot, 'dhRecbto')),
        'numero_protocolo': safe_get(inf_prot, 'nProt'),
        'digest_value': safe_get(inf_prot, 'digVal'),
        'codigo_status': to_int(safe_get(inf_prot, 'cStat')),
        'motivo_status': safe_get(inf_prot, 'xMotivo'),
    }
    prot_data_cleaned = {k: v for k, v in prot_data.items() if v is not None}

    obj, created = MDFeProtocoloAutorizacao.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=prot_data_cleaned
    )
    return obj

@transaction.atomic
def parse_mdfe_suplementar(mdfe_doc, inf_supl):
    """Parseia o bloco <infMDFeSupl>."""
    if not inf_supl:
        MDFeSuplementar.objects.filter(mdfe=mdfe_doc).delete() # Limpa
        return None

    supl_data = {
        'qr_code_url': safe_get(inf_supl, 'qrCodMDFe'),
    }
    supl_data_cleaned = {k: v for k, v in supl_data.items() if v is not None}
    if not supl_data_cleaned.get('qr_code_url'):
        print(f"WARN: Bloco <infMDFeSupl> presente mas sem <qrCodMDFe> para MDF-e {mdfe_doc.chave}")
        MDFeSuplementar.objects.filter(mdfe=mdfe_doc).delete()
        return None

    obj, created = MDFeSuplementar.objects.update_or_create(
        mdfe=mdfe_doc,
        defaults=supl_data_cleaned
    )
    return obj

# --- Main Parser Orchestrator ---

def parse_mdfe_completo(mdfe_doc):
    """
    Função principal para parsear todo o XML do MDFeDocumento.
    Assume que mdfe_doc.xml_original contém o texto do XML.
    Retorna True se o processamento foi bem-sucedido, False caso contrário.
    """
    if not mdfe_doc.xml_original:
        print(f"ERROR: MDF-e {mdfe_doc.chave} não possui XML original para processar.")
        mdfe_doc.processado = False
        mdfe_doc.save(update_fields=['processado'])
        return False

    try:
        xml_dict = xmltodict.parse(mdfe_doc.xml_original)
        infmdfe, versao_proc = get_mdfe_infmdfe(xml_dict) # Pode levantar ValueError
        prot_mdfe = get_mdfe_protocolo(xml_dict) # Pode ser None
        inf_supl = get_mdfe_suplementar(xml_dict) # Pode ser None

        # Atualiza a versão no documento principal se necessário
        if not mdfe_doc.versao or mdfe_doc.versao == 'N/A':
            mdfe_doc.versao = versao_proc or infmdfe.get('@versao', '3.00') # Default 3.00

    except Exception as e:
        print(f"ERROR: Falha ao parsear XML base ou encontrar <infMDFe> para MDF-e {mdfe_doc.chave}: {e}")
        mdfe_doc.processado = False
        mdfe_doc.save(update_fields=['processado', 'versao']) # Salva erro e versão
        return False

    try:
        with transaction.atomic():
            # Parsear seções principais - na ordem correta para evitar problemas de referência
            identificacao = parse_mdfe_identificacao(mdfe_doc, infmdfe)
            emitente = parse_mdfe_emitente(mdfe_doc, infmdfe)
            totais = parse_mdfe_totais(mdfe_doc, infmdfe)
            modal = parse_mdfe_modal_rodoviario(mdfe_doc, infmdfe)
            
            # Parsear seções opcionais ou dependentes
            produto = parse_mdfe_produto_predominante(mdfe_doc, infmdfe)
            documentos = parse_mdfe_documentos(mdfe_doc, infmdfe)
            seguro = parse_mdfe_seguro(mdfe_doc, infmdfe)
            lacres = parse_mdfe_lacres(mdfe_doc, infmdfe)
            autorizados = parse_mdfe_autorizados_xml(mdfe_doc, infmdfe)
            informacoes = parse_mdfe_informacoes_adicionais(mdfe_doc, infmdfe)
            responsavel = parse_mdfe_responsavel_tecnico(mdfe_doc, infmdfe)

            # Processar Protocolo e Suplementar (fora do infMDFe)
            if prot_mdfe:
                protocolo = parse_mdfe_protocolo(mdfe_doc, prot_mdfe)
            if inf_supl:
                suplementar = parse_mdfe_suplementar(mdfe_doc, inf_supl)

            # Marcar como processado
            mdfe_doc.processado = True
            mdfe_doc.save() # Salva o documento com status processado e versão

        print(f"INFO: MDF-e {mdfe_doc.chave} processado com sucesso.")
        return True

    except Exception as e:
        print(f"ERROR: Falha ao processar dados detalhados do MDF-e {mdfe_doc.chave}. Erro: {e}")
        print(traceback.format_exc())
        # A transação será revertida. Tenta marcar como não processado.
        try:
            mdfe_doc_error = MDFeDocumento.objects.get(pk=mdfe_doc.pk)
            mdfe_doc_error.processado = False
            mdfe_doc_error.save(update_fields=['processado'])
        except Exception as save_err:
             print(f"ERROR: Falha ao salvar status de erro para MDF-e {mdfe_doc.chave}: {save_err}")
        return False