# transport/models.py
import uuid
from decimal import Decimal
from django.db import models
from django.db.models import JSONField

# ---------------------------------------------------------------------------
#  B A S E S   A B S T R A T A S
# ---------------------------------------------------------------------------
class Endereco(models.Model):
    """Endereço genérico usado por emitente, remetente, destinatário, etc."""
    logradouro = models.CharField(max_length=60, null=True, blank=True)
    numero = models.CharField(max_length=10, null=True, blank=True)
    complemento = models.CharField(max_length=60, null=True, blank=True)
    bairro = models.CharField(max_length=60, null=True, blank=True)
    codigo_municipio = models.CharField(max_length=7, null=True, blank=True)
    nome_municipio = models.CharField(max_length=60, null=True, blank=True)
    cep = models.CharField(max_length=8, null=True, blank=True)
    uf = models.CharField(max_length=2, null=True, blank=True)
    codigo_pais = models.CharField(max_length=4, default="1058", null=True, blank=True)
    nome_pais = models.CharField(max_length=60, default="BRASIL", null=True, blank=True)

    # Não é abstrato para permitir herança concreta
    # class Meta:
    #    abstract = True


class EntidadeFiscal(Endereco):
    """Pessoa jurídica ou física envolvida no CT-e ou MDF-e."""
    cnpj = models.CharField(max_length=14, null=True, blank=True)
    cpf = models.CharField(max_length=11, null=True, blank=True)
    ie = models.CharField("Inscrição Estadual", max_length=14, null=True, blank=True)
    razao_social = models.CharField("Razão Social/Nome", max_length=60)
    nome_fantasia = models.CharField("Nome Fantasia", max_length=60, null=True, blank=True)
    telefone = models.CharField(max_length=14, null=True, blank=True)
    email = models.EmailField(null=True, blank=True) # Adicionado para abranger casos

    class Meta:
        abstract = True

# ---------------------------------------------------------------------------
#  M O D E L O S   C T - e   (Conhecimento de Transporte Eletrônico)
# ---------------------------------------------------------------------------

class CTeDocumento(models.Model):
    """Raiz do CT-e – mantém a chave e o XML bruto."""
    MODALIDADE_CHOICES = [('CIF','CIF'), ('FOB','FOB')] # Novas Opções CIF/FOB

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    chave = models.CharField("Chave CT-e", max_length=44, unique=True, db_index=True)
    versao = models.CharField("Versão Schema", max_length=5)
    xml_original = models.TextField(null=True, blank=True) # Permite nulo inicialmente
    arquivo_xml = models.FileField(upload_to='xml_ctes/', null=True, blank=True, verbose_name="Arquivo XML")
    data_upload = models.DateTimeField(auto_now_add=True)
    processado = models.BooleanField(default=False, help_text="Indica se o XML foi processado e os dados extraídos.")
    modalidade = models.CharField("Modalidade Frete", max_length=3, choices=MODALIDADE_CHOICES, null=True, blank=True, db_index=True) # NOVO CAMPO

    # Relacionamento com MDF-e (definido mais abaixo via add_to_class)
    # mdfe_vinculado = models.ManyToManyField('MDFeDocumento', through='MDFeDocumentosVinculados', related_name='ctes_transportados')

    class Meta:
        db_table = "cte_documento"
        verbose_name = "CT-e (Documento)"
        verbose_name_plural = "CT-e (Documentos)"
        ordering = ['-identificacao__data_emissao']
        index_together = [ # NOVO ÍNDICE
            ('modalidade', 'data_upload'),
            ('processado', 'data_upload'), # Exemplo de outro índice útil
        ]

    def __str__(self):
        return self.chave

class CTeIdentificacao(models.Model):
    """<ide>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="identificacao")
    codigo_uf = models.PositiveSmallIntegerField("Código UF Emitente")
    codigo_control = models.CharField("Código Numérico Chave", max_length=8)
    cfop = models.CharField("CFOP", max_length=4)
    natureza_operacao = models.CharField("Natureza da Operação", max_length=60)
    modelo = models.CharField("Modelo", max_length=2)
    serie = models.PositiveSmallIntegerField("Série")
    numero = models.PositiveIntegerField("Número CT-e")
    data_emissao = models.DateTimeField("Data/Hora Emissão", db_index=True) # Adicionado índice
    tipo_impressao = models.PositiveSmallIntegerField("Tipo Impressão DACTE")
    tipo_emissao = models.PositiveSmallIntegerField("Tipo Emissão")
    digito_verificador = models.PositiveSmallIntegerField("Dígito Verificador Chave")
    ambiente = models.PositiveSmallIntegerField("Ambiente (1=Prod, 2=Hom)")
    tipo_cte = models.PositiveSmallIntegerField("Tipo CT-e (0=Normal, 1=Compl, 2=Anul, 3=Subst)")
    processo_emissao = models.PositiveSmallIntegerField("Processo Emissão")
    versao_processo = models.CharField("Versão Processo Emissão", max_length=60)
    chave_referenciada = models.CharField("Chave CT-e Referenciada", max_length=44, null=True, blank=True)
    codigo_mun_envio = models.CharField("Código Município Envio", max_length=7)
    nome_mun_envio = models.CharField("Nome Município Envio", max_length=60)
    uf_envio = models.CharField("UF Envio", max_length=2)
    modal = models.CharField("Modal", max_length=2)
    tipo_servico = models.CharField("Tipo Serviço", max_length=1)
    codigo_mun_ini = models.CharField("Código Município Início Prest.", max_length=7)
    nome_mun_ini = models.CharField("Nome Município Início Prest.", max_length=60)
    uf_ini = models.CharField("UF Início Prest.", max_length=2)
    codigo_mun_fim = models.CharField("Código Município Fim Prest.", max_length=7)
    nome_mun_fim = models.CharField("Nome Município Fim Prest.", max_length=60)
    uf_fim = models.CharField("UF Fim Prest.", max_length=2)
    retira = models.BooleanField("Retira Mercadoria", default=False)
    detalhes_retira = models.TextField("Detalhes Retira", null=True, blank=True)
    ind_ie_tomador = models.PositiveSmallIntegerField("Indicador IE Tomador", null=True, blank=True)
    toma = models.PositiveSmallIntegerField("Tomador Serviço (0=Rem, 1=Exp, 2=Rec, 3=Dest, 4=Outros)", null=True, blank=True)

    # Tomador (se for '4=Outros')
    tomador_cnpj = models.CharField("CNPJ Tomador", max_length=14, null=True, blank=True)
    tomador_cpf = models.CharField("CPF Tomador", max_length=11, null=True, blank=True)
    tomador_ie = models.CharField("IE Tomador", max_length=14, null=True, blank=True)
    tomador_razao_social = models.CharField("Razão Social Tomador", max_length=60, null=True, blank=True)
    tomador_nome_fantasia = models.CharField("Nome Fantasia Tomador", max_length=60, null=True, blank=True)
    tomador_telefone = models.CharField("Telefone Tomador", max_length=14, null=True, blank=True)
    tomador_endereco = models.ForeignKey('Endereco', on_delete=models.SET_NULL, related_name='+', null=True, blank=True)

    # Novo campo de quilometragem
    dist_km = models.PositiveIntegerField("Distância KM", null=True, blank=True) # NOVO CAMPO

    class Meta:
        db_table = "cte_identificacao"
        verbose_name = "CT-e – Identificação"
        verbose_name_plural = verbose_name

class CTeComplemento(models.Model):
    """<compl>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="complemento")
    x_carac_ad = models.CharField("Característica Adicional Transporte", max_length=15, null=True, blank=True)
    x_carac_ser = models.CharField("Característica Adicional Serviço", max_length=30, null=True, blank=True)
    x_emi = models.CharField("Nome Emissor Complementar", max_length=60, null=True, blank=True)
    # <fluxo> omitido por complexidade, pode ser JSONField se necessário
    # <Entrega>
    entrega_sem_data = models.BooleanField("Entrega sem Data Definida", default=False)
    entrega_com_data_d_prev = models.DateField("Data Programada", null=True, blank=True)
    entrega_no_periodo_d_ini = models.DateField("Início Período", null=True, blank=True)
    entrega_no_periodo_d_fin = models.DateField("Fim Período", null=True, blank=True)
    entrega_sem_hora = models.BooleanField("Entrega sem Hora Definida", default=False)
    entrega_com_hora_h_prev = models.TimeField("Hora Programada", null=True, blank=True)
    entrega_no_periodo_h_ini = models.TimeField("Início Horário", null=True, blank=True)
    entrega_no_periodo_h_fin = models.TimeField("Fim Horário", null=True, blank=True)
    orig_cod_mun = models.CharField("Código Município Origem", max_length=7, null=True, blank=True)
    orig_nome_mun = models.CharField("Nome Município Origem", max_length=60, null=True, blank=True)
    orig_uf = models.CharField("UF Origem", max_length=2, null=True, blank=True)
    dest_cod_mun = models.CharField("Código Município Destino", max_length=7, null=True, blank=True)
    dest_nome_mun = models.CharField("Nome Município Destino", max_length=60, null=True, blank=True)
    dest_uf = models.CharField("UF Destino", max_length=2, null=True, blank=True)
    x_obs = models.TextField("Observações Gerais", null=True, blank=True)

    class Meta:
        db_table = "cte_complemento"
        verbose_name = "CT-e – Complemento"
        verbose_name_plural = verbose_name

class CTeObservacaoContribuinte(models.Model):
    """<ObsCont>"""
    complemento = models.ForeignKey(CTeComplemento, on_delete=models.CASCADE, related_name="observacoes_contribuinte")
    campo = models.CharField("Identificação Campo", max_length=20)
    texto = models.TextField("Conteúdo")

    class Meta:
        db_table = "cte_obs_contribuinte"
        verbose_name = "CT-e – Observação Contribuinte"
        verbose_name_plural = "CT-e – Observações Contribuinte"

class CTeObservacaoFisco(models.Model):
    """<ObsFisco>"""
    complemento = models.ForeignKey(CTeComplemento, on_delete=models.CASCADE, related_name="observacoes_fisco")
    campo = models.CharField("Identificação Campo", max_length=20)
    texto = models.TextField("Conteúdo")

    class Meta:
        db_table = "cte_obs_fisco"
        verbose_name = "CT-e – Observação Fisco"
        verbose_name_plural = "CT-e – Observações Fisco"

# --- Entidades Fiscais do CT-e ---
class CTeEmitente(EntidadeFiscal):
    """<emit>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="emitente")
    crt = models.CharField("CRT", max_length=1) # 1=SN; 2=SN Excesso; 3=Regime Normal

    class Meta:
        db_table = "cte_emitente"
        verbose_name = "CT-e – Emitente"
        verbose_name_plural = verbose_name

class CTeRemetente(EntidadeFiscal):
    """<rem>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="remetente")

    class Meta:
        db_table = "cte_remetente"
        verbose_name = "CT-e – Remetente"
        verbose_name_plural = verbose_name

class CTeExpedidor(EntidadeFiscal):
    """<exped>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="expedidor")

    class Meta:
        db_table = "cte_expedidor"
        verbose_name = "CT-e – Expedidor"
        verbose_name_plural = verbose_name

class CTeRecebedor(EntidadeFiscal):
    """<receb>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="recebedor")

    class Meta:
        db_table = "cte_recebedor"
        verbose_name = "CT-e – Recebedor"
        verbose_name_plural = verbose_name

class CTEDestinatario(EntidadeFiscal):
    """<dest>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="destinatario")
    isuf = models.CharField("Inscrição SUFRAMA", max_length=9, null=True, blank=True)

    class Meta:
        db_table = "cte_destinatario"
        verbose_name = "CT-e – Destinatário"
        verbose_name_plural = verbose_name

# --- Valores ---
class CTePrestacaoServico(models.Model):
    """<vPrest>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="prestacao")
    valor_total_prestado = models.DecimalField("Valor Total Prestação", max_digits=15, decimal_places=2)
    valor_recebido = models.DecimalField("Valor a Receber", max_digits=15, decimal_places=2)
    # Novos campos CIF/FOB
    valor_cif = models.DecimalField("Valor Frete CIF", max_digits=15, decimal_places=2, null=True, blank=True) # NOVO CAMPO
    valor_fob = models.DecimalField("Valor Frete FOB", max_digits=15, decimal_places=2, null=True, blank=True) # NOVO CAMPO

    class Meta:
        db_table = "cte_prestacao"
        verbose_name = "CT-e – Prestação do Serviço"
        verbose_name_plural = verbose_name

class CTeComponenteValor(models.Model):
    """<Comp>"""
    prestacao = models.ForeignKey(CTePrestacaoServico, on_delete=models.CASCADE, related_name="componentes")
    nome = models.CharField("Nome Componente", max_length=60) # FRETE PESO, FRETE VALOR, SEC/CAT, ADEME, PEDAGIO, OUTROS, etc.
    valor = models.DecimalField("Valor Componente", max_digits=15, decimal_places=2)

    class Meta:
        db_table = "cte_comp_valor"
        verbose_name = "CT-e – Componente de Valor"
        verbose_name_plural = verbose_name

# --- Tributação ---
class CTeTributos(models.Model):
    """<imp>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="tributos")
    icms = JSONField("Detalhes ICMS", null=True, blank=True, help_text="Estrutura JSON com os detalhes do ICMS aplicável (CST, vBC, pICMS, vICMS, etc.)")
    valor_total_tributos = models.DecimalField("Valor Total Tributos", max_digits=15, decimal_places=2, null=True, blank=True) # <vTotTrib>
    info_ad_fisco = models.TextField("Informações Adicionais Fisco", null=True, blank=True) # <infAdFisco>
    # ICMSUFFim omitido por complexidade

    class Meta:
        db_table = "cte_tributos"
        verbose_name = "CT-e – Impostos"
        verbose_name_plural = verbose_name

# --- Carga ---
class CTeCarga(models.Model):
    """<infCarga>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="carga")
    valor_carga = models.DecimalField("Valor Total Mercadorias", max_digits=15, decimal_places=2)
    produto_predominante = models.CharField("Produto Predominante", max_length=60)
    outras_caracteristicas = models.CharField("Outras Características Carga", max_length=30, null=True, blank=True)
    valor_carga_averbada = models.DecimalField("Valor Carga Averbada (Seguro)", max_digits=15, decimal_places=2, null=True, blank=True) # <vCargaAverb>

    class Meta:
        db_table = "cte_carga"
        verbose_name = "CT-e – Carga"
        verbose_name_plural = verbose_name

class CTeQuantidadeCarga(models.Model):
    """<infQ>"""
    carga = models.ForeignKey(CTeCarga, on_delete=models.CASCADE, related_name="quantidades")
    codigo_unidade = models.CharField("Código Unidade Medida", max_length=2) # 00=M3; 01=KG; 02=TON; 03=UNIDADE; 04=LITROS; 05=MMBTU
    tipo_medida = models.CharField("Tipo Medida", max_length=20) # PESO BRUTO, PESO DECLARADO, PESO CUBADO, etc.
    quantidade = models.DecimalField("Quantidade", max_digits=15, decimal_places=4)

    class Meta:
        db_table = "cte_carga_quantidade"
        verbose_name = "CT-e – Quantidade de Carga"
        verbose_name_plural = verbose_name

# --- Documentos Transportados (NF-e, NF, etc.) ---
class CTeDocumentoTransportado(models.Model):
    """<infDoc> / <infNF> / <infNFe> / <infOutros>"""
    cte = models.ForeignKey(CTeDocumento, on_delete=models.CASCADE, related_name="documentos_transportados")
    tipo_documento = models.CharField("Tipo Documento", max_length=10) # Ex: 'NFe', 'NF', 'Outros'
    chave_nfe = models.CharField("Chave NF-e", max_length=44, null=True, blank=True)
    # Campos para NF (papel)
    modelo_nf = models.CharField("Modelo NF", max_length=2, null=True, blank=True)
    serie_nf = models.CharField("Série NF", max_length=3, null=True, blank=True)
    numero_nf = models.CharField("Número NF", max_length=9, null=True, blank=True)
    data_emissao_nf = models.DateField("Data Emissão NF", null=True, blank=True)
    bc_icms_nf = models.DecimalField("Base ICMS NF", max_digits=15, decimal_places=2, null=True, blank=True)
    valor_icms_nf = models.DecimalField("Valor ICMS NF", max_digits=15, decimal_places=2, null=True, blank=True)
    bc_st_nf = models.DecimalField("Base ICMS ST NF", max_digits=15, decimal_places=2, null=True, blank=True)
    valor_st_nf = models.DecimalField("Valor ICMS ST NF", max_digits=15, decimal_places=2, null=True, blank=True)
    valor_produtos_nf = models.DecimalField("Valor Produtos NF", max_digits=15, decimal_places=2, null=True, blank=True)
    valor_total_nf = models.DecimalField("Valor Total NF", max_digits=15, decimal_places=2, null=True, blank=True)
    cfop_pred_nf = models.CharField("CFOP Predominante NF", max_length=4, null=True, blank=True)
    peso_total_kg_nf = models.DecimalField("Peso Total (Kg) NF", max_digits=15, decimal_places=3, null=True, blank=True)
    pin_suframa_nf = models.CharField("PIN SUFRAMA NF", max_length=9, null=True, blank=True)
    # Campos para Outros
    tipo_doc_outros = models.CharField("Tipo Doc Outros", max_length=2, null=True, blank=True)
    desc_outros = models.CharField("Descrição Outros", max_length=100, null=True, blank=True)
    numero_outros = models.CharField("Número Outros", max_length=30, null=True, blank=True)
    data_emissao_outros = models.DateField("Data Emissão Outros", null=True, blank=True)
    valor_doc_outros = models.DecimalField("Valor Doc Outros", max_digits=15, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "cte_doc_transportado"
        verbose_name = "CT-e – Documento Transportado"
        verbose_name_plural = "CT-e – Documentos Transportados"

# --- Seguros ---
class CTeSeguro(models.Model):
    """<seg>"""
    cte = models.ForeignKey(CTeDocumento, on_delete=models.CASCADE, related_name="seguros")
    responsavel = models.CharField("Responsável Seguro", max_length=1) # 0=Remetente; 1=Expedidor; ... 5=Emitente CT-e; 6=Tomador
    nome_seguradora = models.CharField("Nome Seguradora", max_length=30)
    numero_apolice = models.CharField("Número Apólice", max_length=20)
    numero_averbacao = models.CharField("Número Averbação", max_length=20, null=True, blank=True)
    valor_carga_averbada = models.DecimalField("Valor Carga (Averbação)", max_digits=15, decimal_places=2)

    class Meta:
        db_table = "cte_seguro"
        verbose_name = "CT-e – Seguro"
        verbose_name_plural = verbose_name

# --- Informações Modal (Rodoviário) ---
class CTeModalRodoviario(models.Model):
    """<infModal versaoModal="4.00"><rodo>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="modal_rodoviario")
    rntrc = models.CharField("RNTRC", max_length=8)
    # <occ> omitido por complexidade, adicionar se necessário
    data_prevista_entrega = models.DateField("Data Prevista Entrega", null=True, blank=True)
    lotacao = models.BooleanField("Indicador Lotação", default=False) # 0=Não; 1=Sim

    class Meta:
        db_table = "cte_modal_rodo"
        verbose_name = "CT-e – Modal Rodoviário"
        verbose_name_plural = verbose_name

class CTeVeiculoRodoviario(models.Model):
    """<veic>"""
    modal = models.ForeignKey(CTeModalRodoviario, on_delete=models.CASCADE, related_name="veiculos")
    placa = models.CharField("Placa", max_length=7)
    renavam = models.CharField("RENAVAM", max_length=11, null=True, blank=True)
    tara = models.PositiveIntegerField("Tara (Kg)", null=True, blank=True)
    cap_kg = models.PositiveIntegerField("Capacidade (Kg)", null=True, blank=True)
    cap_m3 = models.PositiveIntegerField("Capacidade (m³)", null=True, blank=True)
    tipo_proprietario = models.CharField("Tipo Proprietário", max_length=1, null=True, blank=True) # 0=TAC Agregado; 1=TAC Independente; 2=Outros
    tipo_veiculo = models.CharField("Tipo Veículo", max_length=1, null=True, blank=True) # 0=Tração; 1=Reboque
    tipo_rodado = models.CharField("Tipo Rodado", max_length=2, null=True, blank=True)
    tipo_carroceria = models.CharField("Tipo Carroceria", max_length=2, null=True, blank=True)
    uf_licenciamento = models.CharField("UF Licenciamento", max_length=2, null=True, blank=True)

    # Proprietário
    prop_cnpj = models.CharField("CNPJ Proprietário", max_length=14, null=True, blank=True)
    prop_cpf = models.CharField("CPF Proprietário", max_length=11, null=True, blank=True)
    prop_rntrc = models.CharField("RNTRC Proprietário", max_length=8, null=True, blank=True)
    prop_razao_social = models.CharField("Razão Social Proprietário", max_length=60, null=True, blank=True)
    prop_ie = models.CharField("IE Proprietário", max_length=14, null=True, blank=True)
    prop_uf = models.CharField("UF Proprietário", max_length=2, null=True, blank=True)

    class Meta:
        db_table = "cte_veiculo_rodo"
        verbose_name = "CT-e – Veículo Rodoviário"
        verbose_name_plural = verbose_name

class CTeMotorista(models.Model):
    """<moto>"""
    modal = models.ForeignKey(CTeModalRodoviario, on_delete=models.CASCADE, related_name="motoristas")
    nome = models.CharField("Nome Motorista", max_length=60)
    cpf = models.CharField("CPF Motorista", max_length=11)

    class Meta:
        db_table = "cte_motorista"
        verbose_name = "CT-e – Motorista"
        verbose_name_plural = verbose_name

# --- Autorizados a obter XML ---
class CTeAutXML(models.Model):
    """<autXML>"""
    cte = models.ForeignKey(CTeDocumento, on_delete=models.CASCADE, related_name="autorizados_xml")
    cnpj = models.CharField("CNPJ Autorizado", max_length=14, null=True, blank=True)
    cpf = models.CharField("CPF Autorizado", max_length=11, null=True, blank=True)

    class Meta:
        db_table = "cte_autxml"
        verbose_name = "CT-e – Autorização XML"
        verbose_name_plural = verbose_name
        unique_together = ('cte', 'cnpj', 'cpf')

# --- Responsável Técnico ---
class CTeResponsavelTecnico(models.Model):
    """<infRespTec>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="resp_tecnico")
    cnpj = models.CharField("CNPJ Resp. Técnico", max_length=14)
    contato = models.CharField("Nome Contato", max_length=60)
    email = models.EmailField("Email Contato")
    telefone = models.CharField("Telefone Contato", max_length=14)
    id_csr = models.CharField("ID CSR", max_length=3, null=True, blank=True)
    hash_csr = models.CharField("Hash CSR", max_length=28, null=True, blank=True)

    class Meta:
        db_table = "cte_resp_tec"
        verbose_name = "CT-e – Responsável Técnico"
        verbose_name_plural = verbose_name

# --- Protocolo de Autorização ---
class CTeProtocoloAutorizacao(models.Model):
    """<protCTe>"""
    cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="protocolo")
    ambiente = models.PositiveSmallIntegerField("Ambiente")
    versao_aplic = models.CharField("Versão Aplicação", max_length=30)
    data_recebimento = models.DateTimeField("Data/Hora Recebimento")
    numero_protocolo = models.CharField("Número Protocolo", max_length=15, unique=True)
    digest_value = models.CharField("Digest Value", max_length=60, null=True, blank=True)
    codigo_status = models.PositiveSmallIntegerField("Código Status")
    motivo_status = models.CharField("Motivo Status", max_length=255)

    class Meta:
        db_table = "cte_protocolo"
        verbose_name = "CT-e – Protocolo"

        # --- Complemento Suplementar (QR Code) ---
class CTeSuplementar(models.Model):
   """<infCTeSupl>"""
   cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="suplementar")
   qr_code_url = models.TextField("URL QR Code")

   class Meta:
       db_table = "cte_suplementar"
       verbose_name = "CT-e – Suplementar"
       verbose_name_plural = verbose_name

# --- Cancelamento do CT-e (Evento) ---
class CTeCancelamento(models.Model):
   """Evento de Cancelamento - Combina informações do evento e da resposta"""
   cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name="cancelamento")

   # Campos do evento
   id_evento = models.CharField("ID Evento", max_length=54, unique=True) # Formato: ID + tpEvento + chCTe + nSeqEvento
   c_orgao = models.CharField("Código Órgão IBGE", max_length=2)
   tp_amb = models.PositiveSmallIntegerField("Tipo Ambiente")
   cnpj = models.CharField("CNPJ Solicitante", max_length=14)
   cpf = models.CharField("CPF Solicitante", max_length=11, null=True, blank=True)
   dh_evento = models.DateTimeField("Data/Hora Evento")
   tp_evento = models.CharField("Tipo Evento", max_length=6, default="110111") # 110111 = Cancelamento
   n_seq_evento = models.PositiveSmallIntegerField("Sequência Evento", default=1)
   versao_evento = models.CharField("Versão Evento", max_length=5, default="4.00")
   n_prot_original = models.CharField("Protocolo Autorização Original", max_length=15)
   x_just = models.TextField("Justificativa")

   # Campos da resposta do evento
   id_retorno = models.CharField("ID Retorno", max_length=15, null=True, blank=True) # <infEvento> @Id
   ver_aplic = models.CharField("Versão Aplicação Resposta", max_length=20, null=True, blank=True)
   c_stat = models.PositiveSmallIntegerField("Código Status Resposta", null=True, blank=True)
   x_motivo = models.CharField("Motivo Status Resposta", max_length=255, null=True, blank=True)
   dh_reg_evento = models.DateTimeField("Data/Hora Registro Evento", null=True, blank=True)
   n_prot_retorno = models.CharField("Protocolo Evento", max_length=15, null=True, blank=True, unique=True)
   arquivo_xml_evento = models.FileField(upload_to='xml_eventos_cte/', null=True, blank=True, verbose_name="XML Evento Cancelamento")

   class Meta:
       db_table = "cte_cancelamento"
       verbose_name = "CT-e – Cancelamento"
       verbose_name_plural = "CT-e – Cancelamentos"

   def __str__(self):
       return f"Cancelamento de {self.cte.chave}"


# ---------------------------------------------------------------------------
#  M O D E L O S   M D F - e   (Manifesto Eletrônico de Documentos Fiscais)
# ---------------------------------------------------------------------------

class MDFeDocumento(models.Model):
   """Raiz do MDF-e – mantém a chave e o XML bruto."""
   id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
   chave = models.CharField("Chave MDF-e", max_length=44, unique=True, db_index=True)
   versao = models.CharField("Versão Schema", max_length=5)
   xml_original = models.TextField(null=True, blank=True)
   arquivo_xml = models.FileField(upload_to='xml_mdfes/', null=True, blank=True, verbose_name="Arquivo XML")
   data_upload = models.DateTimeField(auto_now_add=True)
   processado = models.BooleanField(default=False, help_text="Indica se o XML foi processado e os dados extraídos.")
   
   # Campos para tratamento de encerramento - NOVOS CAMPOS
   encerrado = models.BooleanField("Encerrado", default=False, db_index=True)
   data_encerramento = models.DateField("Data Encerramento", null=True, blank=True)
   municipio_encerramento_cod = models.CharField("Código Município Encerramento", max_length=7, null=True, blank=True)
   uf_encerramento = models.CharField("UF Encerramento", max_length=2, null=True, blank=True)
   protocolo_encerramento = models.CharField("Protocolo Encerramento", max_length=15, null=True, blank=True, unique=True)

   class Meta:
       db_table = "mdfe_documento"
       verbose_name = "MDF-e (Documento)"
       verbose_name_plural = "MDF-e (Documentos)"
       ordering = ['-identificacao__dh_emi']

   def __str__(self):
       return self.chave

class MDFeIdentificacao(models.Model):
   """<ide>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="identificacao")
   c_uf = models.PositiveSmallIntegerField("Código UF Emitente")
   tp_amb = models.PositiveSmallIntegerField("Tipo Ambiente")
   tp_emit = models.PositiveSmallIntegerField("Tipo Emitente (1=Prest Serv, 2=Transp Carga Própria)")
   tp_transp = models.PositiveSmallIntegerField("Tipo Transportador (1=ETC, 2=TAC, 3=CTC)", null=True, blank=True)
   mod = models.CharField("Modelo", max_length=2)
   serie = models.PositiveSmallIntegerField("Série")
   n_mdf = models.PositiveIntegerField("Número MDF-e")
   c_mdf = models.CharField("Código Numérico Chave", max_length=8)
   c_dv = models.CharField("Dígito Verificador Chave", max_length=1)
   modal = models.CharField("Modal (1=Rodoviário, 2=Aéreo, 3=Aquaviário, 4=Ferroviário)", max_length=1)
   dh_emi = models.DateTimeField("Data/Hora Emissão")
   tp_emis = models.PositiveSmallIntegerField("Tipo Emissão (1=Normal, 2=Contingência)")
   proc_emi = models.PositiveSmallIntegerField("Processo Emissão")
   ver_proc = models.CharField("Versão Processo Emissão", max_length=20)
   uf_ini = models.CharField("UF Início Viagem", max_length=2)
   uf_fim = models.CharField("UF Fim Viagem", max_length=2)
   dh_ini_viagem = models.DateTimeField("Data/Hora Início Viagem", null=True, blank=True)
   ind_carga_posterior = models.BooleanField("Indicador Carga Posterior", default=False)
   ind_canal_verde = models.BooleanField("Indicador Canal Verde", default=False)

   class Meta:
       db_table = "mdfe_identificacao"
       verbose_name = "MDF-e – Identificação"
       verbose_name_plural = verbose_name

class MDFeMunicipioCarregamento(models.Model):
   """<infMunCarrega>"""
   identificacao = models.ForeignKey(MDFeIdentificacao, on_delete=models.CASCADE, related_name="municipios_carregamento")
   c_mun_carrega = models.CharField("Código Município Carregamento", max_length=7)
   x_mun_carrega = models.CharField("Nome Município Carregamento", max_length=60)

   class Meta:
       db_table = "mdfe_municipio_carrega"
       verbose_name = "MDF-e – Município Carregamento"
       verbose_name_plural = verbose_name
       unique_together = ('identificacao', 'c_mun_carrega')

class MDFePercurso(models.Model):
   """<peri>"""
   identificacao = models.ForeignKey(MDFeIdentificacao, on_delete=models.CASCADE, related_name="percurso")
   uf_per = models.CharField("UF Percurso", max_length=2)

   class Meta:
       db_table = "mdfe_percurso"
       verbose_name = "MDF-e – Percurso"
       verbose_name_plural = "MDF-e – Percursos"
       unique_together = ('identificacao', 'uf_per')

# --- Emitente MDF-e ---
class MDFeEmitente(EntidadeFiscal):
   """<emit>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="emitente")
   # Campos herdados de EntidadeFiscal

   class Meta:
       db_table = "mdfe_emitente"
       verbose_name = "MDF-e – Emitente"
       verbose_name_plural = verbose_name

# --- Modal Rodoviário MDF-e ---
class MDFeModalRodoviario(models.Model):
   """<infModal versaoModal="3.00"><rodo>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="modal_rodoviario")
   rntrc = models.CharField("RNTRC", max_length=8, null=True, blank=True)
   # <veicTracao> é um modelo separado
   # <veicReboque> é um modelo separado
   # <condutor> é um modelo separado
   codigo_agendamento_porto = models.CharField("Código Agendamento Porto", max_length=10, null=True, blank=True) # <codAgPorto>

   class Meta:
       db_table = "mdfe_modal_rodo"
       verbose_name = "MDF-e – Modal Rodoviário"
       verbose_name_plural = verbose_name

class MDFeVeiculoTracao(models.Model):
   """<rodo><veicTracao>"""
   modal = models.OneToOneField(MDFeModalRodoviario, on_delete=models.CASCADE, related_name="veiculo_tracao")
   placa = models.CharField("Placa", max_length=7)
   renavam = models.CharField("RENAVAM", max_length=11, null=True, blank=True)
   tara = models.PositiveIntegerField("Tara (Kg)")
   cap_kg = models.PositiveIntegerField("Capacidade (Kg)", null=True, blank=True)
   cap_m3 = models.PositiveIntegerField("Capacidade (m³)", null=True, blank=True)
   tp_rod = models.CharField("Tipo Rodado", max_length=2, null=True, blank=True)
   tp_car = models.CharField("Tipo Carroceria", max_length=2, null=True, blank=True)
   uf = models.CharField("UF Licenciamento", max_length=2, null=True, blank=True)

   # Proprietário (se não for o emitente)
   prop_cnpj = models.CharField("CNPJ Proprietário", max_length=14, null=True, blank=True)
   prop_cpf = models.CharField("CPF Proprietário", max_length=11, null=True, blank=True)
   prop_rntrc = models.CharField("RNTRC Proprietário", max_length=8, null=True, blank=True)
   prop_razao_social = models.CharField("Razão Social Proprietário", max_length=60, null=True, blank=True)
   prop_ie = models.CharField("IE Proprietário", max_length=14, null=True, blank=True)
   prop_uf = models.CharField("UF Proprietário", max_length=2, null=True, blank=True)
   prop_tp = models.CharField("Tipo Proprietário", max_length=1, null=True, blank=True) # 1=ETC; 2=TAC; 3=CTC

   class Meta:
       db_table = "mdfe_veiculo_tracao"
       verbose_name = "MDF-e – Veículo Tração"
       verbose_name_plural = verbose_name

class MDFeVeiculoReboque(models.Model):
   """<rodo><veicReboque>"""
   modal = models.ForeignKey(MDFeModalRodoviario, on_delete=models.CASCADE, related_name="veiculos_reboque")
   placa = models.CharField("Placa", max_length=7)
   renavam = models.CharField("RENAVAM", max_length=11, null=True, blank=True)
   tara = models.PositiveIntegerField("Tara (Kg)")
   cap_kg = models.PositiveIntegerField("Capacidade (Kg)", null=True, blank=True)
   cap_m3 = models.PositiveIntegerField("Capacidade (m³)", null=True, blank=True)
   tp_car = models.CharField("Tipo Carroceria", max_length=2, null=True, blank=True)
   uf = models.CharField("UF Licenciamento", max_length=2, null=True, blank=True)

   # Proprietário (se não for o emitente)
   prop_cnpj = models.CharField("CNPJ Proprietário", max_length=14, null=True, blank=True)
   prop_cpf = models.CharField("CPF Proprietário", max_length=11, null=True, blank=True)
   prop_rntrc = models.CharField("RNTRC Proprietário", max_length=8, null=True, blank=True)
   prop_razao_social = models.CharField("Razão Social Proprietário", max_length=60, null=True, blank=True)
   prop_ie = models.CharField("IE Proprietário", max_length=14, null=True, blank=True)
   prop_uf = models.CharField("UF Proprietário", max_length=2, null=True, blank=True)
   prop_tp = models.CharField("Tipo Proprietário", max_length=1, null=True, blank=True)

   class Meta:
       db_table = "mdfe_veiculo_reboque"
       verbose_name = "MDF-e – Veículo Reboque"
       verbose_name_plural = verbose_name

class MDFeCondutor(models.Model):
   """<rodo><condutor>"""
   # Mudança: Relacionado diretamente ao MDFeDocumento para permitir múltiplos modais (embora raro)
   mdfe = models.ForeignKey(MDFeDocumento, on_delete=models.CASCADE, related_name="condutores")
   nome = models.CharField("Nome Condutor", max_length=60)
   cpf = models.CharField("CPF Condutor", max_length=11)

   class Meta:
       db_table = "mdfe_condutor"
       verbose_name = "MDF-e – Condutor"
       verbose_name_plural = verbose_name
       unique_together = ('mdfe', 'cpf')

class MDFeCIOT(models.Model):
   """<rodo><infCIOT>"""
   modal = models.ForeignKey(MDFeModalRodoviario, on_delete=models.CASCADE, related_name="ciots")
   ciot = models.CharField("CIOT", max_length=12)
   cnpj_responsavel = models.CharField("CNPJ Responsável", max_length=14, null=True, blank=True)
   cpf_responsavel = models.CharField("CPF Responsável", max_length=11, null=True, blank=True)

   class Meta:
       db_table = "mdfe_ciot"
       verbose_name = "MDF-e – CIOT"
       verbose_name_plural = verbose_name

class MDFeValePedagio(models.Model):
   """<rodo><valePed>"""
   modal = models.ForeignKey(MDFeModalRodoviario, on_delete=models.CASCADE, related_name="vales_pedagio")
   cnpj_fornecedor = models.CharField("CNPJ Fornecedor", max_length=14)
   cnpj_pagador = models.CharField("CNPJ Pagador Frete", max_length=14, null=True, blank=True)
   cpf_pagador = models.CharField("CPF Pagador Frete", max_length=11, null=True, blank=True)
   numero_compra = models.CharField("Número Comprovante Compra", max_length=20)
   valor_vale = models.DecimalField("Valor Vale Pedágio", max_digits=15, decimal_places=2)

   class Meta:
       db_table = "mdfe_vale_pedagio"
       verbose_name = "MDF-e – Vale Pedágio"
       verbose_name_plural = verbose_name

class MDFeContratante(models.Model):
   """<rodo><infContratante>"""
   modal = models.ForeignKey(MDFeModalRodoviario, on_delete=models.CASCADE, related_name="contratantes")
   cnpj = models.CharField("CNPJ Contratante", max_length=14, null=True, blank=True)
   cpf = models.CharField("CPF Contratante", max_length=11, null=True, blank=True)

   class Meta:
       db_table = "mdfe_contratante"
       verbose_name = "MDF-e – Contratante"
       verbose_name_plural = verbose_name

# --- Documentos Vinculados (agrupados por município de descarregamento) ---
class MDFeMunicipioDescarga(models.Model):
   """<infMunDescarga>"""
   mdfe = models.ForeignKey(MDFeDocumento, on_delete=models.CASCADE, related_name="municipios_descarga")
   c_mun_descarga = models.CharField("Código Município Descarga", max_length=7)
   x_mun_descarga = models.CharField("Nome Município Descarga", max_length=60)

   class Meta:
       db_table = "mdfe_municipio_descarga"
       verbose_name = "MDF-e – Município Descarga"
       verbose_name_plural = "MDF-e – Municípios Descarga"
       unique_together = ('mdfe', 'c_mun_descarga')

# Modelo Intermediário para Relacionar MDF-e e CT-e
class MDFeDocumentosVinculados(models.Model):
   """Modelo para vincular MDF-e aos CT-es (ou NF-es) que ele transporta"""
   mdfe = models.ForeignKey(MDFeDocumento, on_delete=models.CASCADE, related_name='docs_vinculados_mdfe')
   municipio_descarga = models.ForeignKey(MDFeMunicipioDescarga, on_delete=models.CASCADE, related_name='docs_vinculados_municipio')

   # Armazena a chave do documento vinculado (CT-e ou NF-e)
   chave_documento = models.CharField("Chave Documento Vinculado", max_length=44, db_index=True)
   seg_cod_barras = models.CharField("Segundo Código Barras (CT-e)", max_length=36, null=True, blank=True) # <segCodBarra>
   ind_reentrega = models.BooleanField("Indicador Reentrega", default=False)

   # Tenta relacionar com o CTeDocumento se a chave existir
   cte_relacionado = models.ForeignKey(CTeDocumento, on_delete=models.SET_NULL, null=True, blank=True, related_name='mdfe_transportador', to_field='chave')
   # Adicionar ForeignKey para NF-e se houver um modelo NF-e

   class Meta:
       db_table = "mdfe_documentos_vinculados"
       verbose_name = "MDF-e – Documento Vinculado"
       verbose_name_plural = "MDF-e – Documentos Vinculados"
       unique_together = ('mdfe', 'chave_documento')

class MDFeProdutoPerigoso(models.Model):
   """<infDoc><peri>"""
   documento_vinculado = models.ForeignKey(MDFeDocumentosVinculados, on_delete=models.CASCADE, related_name="produtos_perigosos")
   n_onu = models.CharField("Número ONU", max_length=4)
   x_nome_ae = models.CharField("Nome Apropriado Embarque", max_length=150, null=True, blank=True)
   x_cla_risco = models.CharField("Classe Risco", max_length=40, null=True, blank=True)
   gr_emb = models.CharField("Grupo Embalagem", max_length=6, null=True, blank=True)
   q_tot_prod = models.CharField("Quantidade Total Produto", max_length=20) # Pode ser número ou texto (ex: "2 Tambores")
   q_vol_tipo = models.CharField("Quantidade e Tipo Volumes", max_length=60, null=True, blank=True)

   class Meta:
       db_table = "mdfe_produto_perigoso"
       verbose_name = "MDF-e – Produto Perigoso"
       verbose_name_plural = "MDF-e – Produtos Perigosos"

# --- Seguros MDF-e ---
class MDFeSeguroCarga(models.Model):
   """<seg>"""
   mdfe = models.ForeignKey(MDFeDocumento, on_delete=models.CASCADE, related_name="seguros_carga")
   responsavel = models.CharField("Responsável Seguro", max_length=1) # 1=Emitente MDF-e; 2=Responsável pela contratação (contratante)
   cnpj_responsavel = models.CharField("CNPJ Responsável", max_length=14, null=True, blank=True)
   cpf_responsavel = models.CharField("CPF Responsável", max_length=11, null=True, blank=True)

   # <infSeg>
   nome_seguradora = models.CharField("Nome Seguradora", max_length=30)
   cnpj_seguradora = models.CharField("CNPJ Seguradora", max_length=14)
   numero_apolice = models.CharField("Número Apólice", max_length=20)
   # <nAver> (ocorrências múltiplas)

   class Meta:
       db_table = "mdfe_seguro_carga"
       verbose_name = "MDF-e – Seguro Carga"
       verbose_name_plural = "MDF-e – Seguros Carga"

class MDFeAverbacaoSeguro(models.Model):
   """<nAver>"""
   seguro = models.ForeignKey(MDFeSeguroCarga, on_delete=models.CASCADE, related_name="averbacoes")
   numero = models.CharField("Número Averbação", max_length=40)

   class Meta:
       db_table = "mdfe_averbacao_seguro"
       verbose_name = "MDF-e – Averbação Seguro"
       verbose_name_plural = "MDF-e – Averbações Seguro"

# --- Produto Predominante ---
class MDFeProdutoPredominante(models.Model):
   """<prodPred>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="prod_pred")
   tp_carga = models.CharField("Tipo Carga", max_length=2) # Ver tabela ANTT
   x_prod = models.CharField("Descrição Produto", max_length=120)
   ncm = models.CharField("NCM", max_length=8, null=True, blank=True)
   # <infLotacao> omitido por simplicidade, pode ser JSONField

   class Meta:
       db_table = "mdfe_prod_pred"
       verbose_name = "MDF-e – Produto Predominante"
       verbose_name_plural = verbose_name

# --- Totalizadores ---
class MDFeTotais(models.Model):
   """<tot>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="totais")
   q_cte = models.PositiveIntegerField("Qtd. CT-e", null=True, blank=True)
   q_nfe = models.PositiveIntegerField("Qtd. NF-e", null=True, blank=True)
   # qCT omitido (obsoleto)
   v_carga = models.DecimalField("Valor Total Carga", max_digits=15, decimal_places=2)
   c_unid = models.CharField("Código Unidade Peso Bruto", max_length=2) # 01=KG; 02=TON
   q_carga = models.DecimalField("Peso Bruto Total Carga", max_digits=15, decimal_places=4)

   class Meta:
       db_table = "mdfe_totais"
       verbose_name = "MDF-e – Totais"
       verbose_name_plural = verbose_name

# --- Lacres ---
class MDFeLacreRodoviario(models.Model):
   """<lacres><lacRodo>"""
   mdfe = models.ForeignKey(MDFeDocumento, on_delete=models.CASCADE, related_name="lacres_rodoviarios")
   numero = models.CharField("Número Lacre", max_length=20)

   class Meta:
       db_table = "mdfe_lacre_rodo"
       verbose_name = "MDF-e – Lacre Rodoviário"
       verbose_name_plural = "MDF-e – Lacres Rodoviários"

# --- Autorizados a obter XML MDF-e ---
class MDFeAutXML(models.Model):
   """<autXML>"""
   mdfe = models.ForeignKey(MDFeDocumento, on_delete=models.CASCADE, related_name="autorizados_xml")
   cnpj = models.CharField("CNPJ Autorizado", max_length=14, null=True, blank=True)
   cpf = models.CharField("CPF Autorizado", max_length=11, null=True, blank=True)

   class Meta:
       db_table = "mdfe_autxml"
       verbose_name = "MDF-e – Autorização XML"
       verbose_name_plural = verbose_name
       unique_together = ('mdfe', 'cnpj', 'cpf')

# --- Informações Adicionais ---
class MDFeInformacoesAdicionais(models.Model):
   """<infAdic>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="adicional")
   inf_ad_fisco = models.TextField("Informações Adicionais Fisco", null=True, blank=True)
   inf_cpl = models.TextField("Informações Complementares", null=True, blank=True)

   class Meta:
       db_table = "mdfe_inf_adic"
       verbose_name = "MDF-e – Informações Adicionais"
       verbose_name_plural = verbose_name

# --- Responsável Técnico MDF-e ---
class MDFeResponsavelTecnico(models.Model):
   """<infRespTec>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="resp_tecnico")
   cnpj = models.CharField("CNPJ Resp. Técnico", max_length=14)
   contato = models.CharField("Nome Contato", max_length=60)
   email = models.EmailField("Email Contato")
   telefone = models.CharField("Telefone Contato", max_length=14)
   id_csr = models.CharField("ID CSR", max_length=3, null=True, blank=True)
   hash_csr = models.CharField("Hash CSR", max_length=28, null=True, blank=True)

   class Meta:
       db_table = "mdfe_resp_tec"
       verbose_name = "MDF-e – Responsável Técnico"
       verbose_name_plural = verbose_name

# --- Protocolo de Autorização MDF-e ---
class MDFeProtocoloAutorizacao(models.Model):
   """<protMDFe>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="protocolo")
   ambiente = models.PositiveSmallIntegerField("Ambiente")
   versao_aplic = models.CharField("Versão Aplicação", max_length=30)
   data_recebimento = models.DateTimeField("Data/Hora Recebimento")
   numero_protocolo = models.CharField("Número Protocolo", max_length=15, unique=True)
   digest_value = models.CharField("Digest Value", max_length=60, null=True, blank=True)
   codigo_status = models.PositiveSmallIntegerField("Código Status")
   motivo_status = models.CharField("Motivo Status", max_length=255)

   class Meta:
       db_table = "mdfe_protocolo"
       verbose_name = "MDF-e – Protocolo"
       verbose_name_plural = verbose_name

# --- Suplementar MDF-e (QR Code) ---
class MDFeSuplementar(models.Model):
   """<infMDFeSupl>"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="suplementar")
   qr_code_url = models.TextField("URL QR Code")

   class Meta:
       db_table = "mdfe_suplementar"
       verbose_name = "MDF-e – Suplementar"
       verbose_name_plural = verbose_name

# --- Cancelamento do MDF-e (Evento) ---
class MDFeCancelamento(models.Model):
   """Evento de Cancelamento MDF-e - Combina informações do evento e da resposta"""
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="cancelamento")

   # Campos do evento
   id_evento = models.CharField("ID Evento", max_length=54, unique=True) # Formato: ID + tpEvento + chMDFe + nSeqEvento
   c_orgao = models.CharField("Código Órgão IBGE", max_length=2)
   tp_amb = models.PositiveSmallIntegerField("Tipo Ambiente")
   cnpj = models.CharField("CNPJ Solicitante", max_length=14)
   cpf = models.CharField("CPF Solicitante", max_length=11, null=True, blank=True)
   dh_evento = models.DateTimeField("Data/Hora Evento")
   tp_evento = models.CharField("Tipo Evento", max_length=6, default="110111") # 110111 = Cancelamento
   n_seq_evento = models.PositiveSmallIntegerField("Sequência Evento", default=1)
   versao_evento = models.CharField("Versão Evento", max_length=5, default="3.00")
   n_prot_original = models.CharField("Protocolo Autorização Original", max_length=15)
   x_just = models.TextField("Justificativa")

   # Campos da resposta do evento
   id_retorno = models.CharField("ID Retorno", max_length=15, null=True, blank=True) # <infEvento> @Id
   ver_aplic = models.CharField("Versão Aplicação Resposta", max_length=20, null=True, blank=True)
   c_stat = models.PositiveSmallIntegerField("Código Status Resposta", null=True, blank=True)
   x_motivo = models.CharField("Motivo Status Resposta", max_length=255, null=True, blank=True)
   dh_reg_evento = models.DateTimeField("Data/Hora Registro Evento", null=True, blank=True)
   n_prot_retorno = models.CharField("Protocolo Evento", max_length=15, null=True, blank=True, unique=True)
   arquivo_xml_evento = models.FileField(upload_to='xml_eventos_mdfe/', null=True, blank=True, verbose_name="XML Evento Cancelamento")

   class Meta:
       db_table = "mdfe_cancelamento"
       verbose_name = "MDF-e – Cancelamento"
       verbose_name_plural = "MDF-e – Cancelamentos"

   def __str__(self):
       return f"Cancelamento de {self.mdfe.chave}"

# --- Cancelamento de Encerramento (para complementar handlers do parser_eventos.py) ---
class MDFeCancelamentoEncerramento(models.Model):
   """
   Evento de Cancelamento de Encerramento do MDF-e (110113)
   Usado quando o encerramento foi registrado por engano
   """
   mdfe = models.OneToOneField(MDFeDocumento, on_delete=models.CASCADE, related_name="cancelamento_encerramento")

   # Campos do evento
   id_evento = models.CharField("ID Evento", max_length=54, unique=True)
   c_orgao = models.CharField("Código Órgão IBGE", max_length=2)
   tp_amb = models.PositiveSmallIntegerField("Tipo Ambiente")
   cnpj = models.CharField("CNPJ Solicitante", max_length=14)
   cpf = models.CharField("CPF Solicitante", max_length=11, null=True, blank=True)
   dh_evento = models.DateTimeField("Data/Hora Evento")
   tp_evento = models.CharField("Tipo Evento", max_length=6, default="110113") # 110113 = Cancelamento Encerramento
   n_seq_evento = models.PositiveSmallIntegerField("Sequência Evento", default=1)
   versao_evento = models.CharField("Versão Evento", max_length=5, default="3.00")
   n_prot_cancelar = models.CharField("Protocolo Encerramento a Cancelar", max_length=15)
   x_just = models.TextField("Justificativa")

   # Campos da resposta do evento
   id_retorno = models.CharField("ID Retorno", max_length=15, null=True, blank=True)
   ver_aplic = models.CharField("Versão Aplicação Resposta", max_length=20, null=True, blank=True)
   c_stat = models.PositiveSmallIntegerField("Código Status Resposta", null=True, blank=True)
   x_motivo = models.CharField("Motivo Status Resposta", max_length=255, null=True, blank=True)
   dh_reg_evento = models.DateTimeField("Data/Hora Registro Evento", null=True, blank=True)
   n_prot_retorno = models.CharField("Protocolo Evento", max_length=15, null=True, blank=True, unique=True)
   arquivo_xml_evento = models.FileField(upload_to='xml_eventos_mdfe/', null=True, blank=True, verbose_name="XML Evento Canc. Encerramento")

   class Meta:
       db_table = "mdfe_cancelamento_encerramento"
       verbose_name = "MDF-e – Cancelamento de Encerramento"
       verbose_name_plural = "MDF-e – Cancelamentos de Encerramento"

   def __str__(self):
       return f"Cancelamento de Encerramento de {self.mdfe.chave}"


# --------------------------------------------------
#  V E Í C U L O   E   M A N U T E N Ç Ã O
# --------------------------------------------------
class Veiculo(models.Model):
   """
   Cadastro básico do veículo – serve de referência para MDF‑e, manutenção
   e futuros indicadores (quilometragem, capacidade da frota etc.).
   """
   placa = models.CharField(max_length=8, unique=True, verbose_name="Placa", db_index=True)
   renavam = models.CharField(max_length=11, null=True, blank=True)
   tara = models.PositiveIntegerField(null=True, blank=True, help_text="Peso em ordem de marcha (kg)")
   capacidade_kg = models.PositiveIntegerField(null=True, blank=True, help_text="Capacidade máxima (kg)")
   capacidade_m3 = models.PositiveIntegerField(null=True, blank=True, help_text="Capacidade cúbica (m³)")
   tipo_proprietario = models.CharField(max_length=2, null=True, blank=True,
                                        help_text="00‑Próprio / 01‑Arrendado / 02‑Agregado …")
   proprietario_cnpj = models.CharField("CNPJ Proprietário", max_length=14, null=True, blank=True)
   proprietario_cpf = models.CharField("CPF Proprietário", max_length=11, null=True, blank=True)
   proprietario_nome = models.CharField("Razão Social/Nome Proprietário", max_length=60, null=True, blank=True)
   rntrc_proprietario = models.CharField("RNTRC Proprietário", max_length=8, null=True, blank=True)
   uf_proprietario = models.CharField("UF Proprietário", max_length=2, null=True, blank=True)
   ativo = models.BooleanField(default=True)

   criado_em = models.DateTimeField(auto_now_add=True)
   atualizado_em = models.DateTimeField(auto_now=True)

   def __str__(self):
       return self.placa

   class Meta:
       verbose_name = "Veículo"
       verbose_name_plural = "Veículos"
       ordering = ["placa"]


class ManutencaoVeiculo(models.Model):
   """
   Registro de cada serviço de manutenção realizado no veículo.
   Os valores de peça + mão‑de‑obra são somados automaticamente em `valor_total`.
   """
   STATUS_OPCOES = (
       ("PAGO", "Pago"),
       ("PENDENTE", "Pendente"),
       ("AGENDADO", "Agendado"),
       ("CANCELADO", "Cancelado"),
   )

   veiculo = models.ForeignKey(
       Veiculo,
       on_delete=models.PROTECT, # Evita excluir veículo com manutenção registrada
       related_name="manutencoes",
       verbose_name="Veículo",
   )
   data_servico = models.DateField(verbose_name="Data do Serviço")
   servico_realizado = models.CharField(max_length=120)
   oficina = models.CharField(max_length=120, null=True, blank=True)
   quilometragem = models.PositiveIntegerField("Quilometragem", null=True, blank=True)
   peca_utilizada = models.CharField(max_length=120, null=True, blank=True)
   valor_peca = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
   valor_mao_obra = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
   valor_total = models.DecimalField(max_digits=12, decimal_places=2, editable=False)
   status = models.CharField(max_length=10, choices=STATUS_OPCOES, default="PENDENTE")
   observacoes = models.TextField(null=True, blank=True)
   nota_fiscal = models.CharField("Nota Fiscal Serviço", max_length=44, null=True, blank=True)

   criado_em = models.DateTimeField(auto_now_add=True)
   atualizado_em = models.DateTimeField(auto_now=True)

   def save(self, *args, **kwargs):
       # soma automática dos custos
       self.valor_total = (self.valor_peca or Decimal("0")) + (self.valor_mao_obra or Decimal("0"))
       super().save(*args, **kwargs)

   def __str__(self):
       return f"{self.veiculo.placa} – {self.servico_realizado} ({self.data_servico:%d/%m/%Y})"

   class Meta:
       verbose_name = "Manutenção de Veículo"
       verbose_name_plural = "Manutenções de Veículos"
       ordering = ["-data_servico", "-criado_em"]


# --------------------------------------------------
#  N O V O S   M O D E L O S   (Pagamento e Parametrização)
# --------------------------------------------------

class FaixaKM(models.Model):
   """Parametrização de valores de pagamento por faixa de KM para condutores próprios."""
   min_km = models.PositiveIntegerField("KM Mínimo", unique=True) # Garante que não haja sobreposição inicial
   max_km = models.PositiveIntegerField("KM Máximo", null=True, blank=True, help_text="Deixe em branco para a última faixa (sem limite superior)")
   valor_pago = models.DecimalField("Valor a Pagar (R$)", max_digits=10, decimal_places=2)
   # Adicionar validação no save para garantir que max_km > min_km e que não haja sobreposições completas

   class Meta:
       verbose_name = "Faixa de KM (Pagamento Próprio)"
       verbose_name_plural = "Faixas de KM (Pagamento Próprio)"
       ordering = ['min_km']

   def __str__(self):
       if self.max_km:
           return f"De {self.min_km}km até {self.max_km}km: R$ {self.valor_pago}"
       else:
           return f"Acima de {self.min_km}km: R$ {self.valor_pago}"


class PagamentoAgregado(models.Model):
   """Registra o pagamento a ser realizado para condutores agregados (baseado em % do frete)."""
   STATUS_PAGAMENTO = [('pendente','Pendente'), ('pago','Pago')]

   cte = models.OneToOneField(CTeDocumento, on_delete=models.CASCADE, related_name='pagamento_agregado')
   placa = models.CharField("Placa Veículo", max_length=8, db_index=True)
   condutor_cpf = models.CharField("CPF Condutor", max_length=11, null=True, blank=True, db_index=True) # Melhor usar CPF para identificar unicamente
   condutor_nome = models.CharField("Nome Condutor", max_length=120) # Mantém nome para referência
   valor_frete_total = models.DecimalField("Valor Frete (Base)", max_digits=12, decimal_places=2)
   percentual_repasse = models.DecimalField("Percentual Repasse (%)", max_digits=5, decimal_places=2, default=Decimal('25.00'))
   valor_repassado = models.DecimalField("Valor Repasse (R$)", max_digits=12, decimal_places=2, editable=False)
   obs = models.TextField("Observações", blank=True, null=True)
   status = models.CharField("Status", max_length=10, choices=STATUS_PAGAMENTO, default='pendente', db_index=True)
   data_prevista = models.DateField("Data Prevista")
   data_pagamento = models.DateField("Data Pagamento", null=True, blank=True)
   criado_em = models.DateTimeField(auto_now_add=True)
   atualizado_em = models.DateTimeField(auto_now=True)

   class Meta:
       verbose_name = "Pagamento Agregado (CT-e)"
       verbose_name_plural = "Pagamentos Agregados (CT-e)"
       ordering = ['-data_prevista', 'status']

   def save(self, *args, **kwargs):
       # Calcula o valor do repasse automaticamente
       if self.valor_frete_total and self.percentual_repasse:
           self.valor_repassado = (self.valor_frete_total * self.percentual_repasse) / Decimal('100.0')
       else:
           self.valor_repassado = Decimal('0.00')
       super().save(*args, **kwargs)

   def __str__(self):
       return f"Pgto Agregado CT-e {self.cte.identificacao.numero if hasattr(self.cte, 'identificacao') else self.cte_id} - {self.condutor_nome or self.condutor_cpf}"


class PagamentoProprio(models.Model):
   """Agrupa o pagamento quinzenal/mensal de condutores próprios baseado nas faixas de KM."""
   STATUS_PAGAMENTO = [('pendente','Pendente'), ('pago','Pago')]

   veiculo = models.ForeignKey(Veiculo, on_delete=models.PROTECT, related_name='pagamentos_proprios')
   # Ex: '2025-04-1Q' (1ª Quinzena), '2025-04-2Q' (2ª Quinzena) ou '2025-04' (Mensal)
   periodo = models.CharField("Período (AAAA-MM ou AAAA-MM-XQ)", max_length=10, db_index=True)
   km_total_periodo = models.PositiveIntegerField("KM Total no Período", default=0)
   valor_base_faixa = models.DecimalField("Valor Base (Faixa KM)", max_digits=12, decimal_places=2, null=True, blank=True)
   ajustes = models.DecimalField("Ajustes/Adicionais (R$)", max_digits=12, decimal_places=2, default=Decimal('0.00'))
   valor_total_pagar = models.DecimalField("Valor Total a Pagar (R$)", max_digits=12, decimal_places=2, editable=False)
   status = models.CharField("Status", max_length=10, choices=STATUS_PAGAMENTO, default='pendente', db_index=True)
   data_pagamento = models.DateField("Data Pagamento", null=True, blank=True)
   obs = models.TextField("Observações", blank=True, null=True)
   criado_em = models.DateTimeField(auto_now_add=True)
   atualizado_em = models.DateTimeField(auto_now=True)

   class Meta:
       verbose_name = "Pagamento Próprio (Período)"
       verbose_name_plural = "Pagamentos Próprios (Período)"
       ordering = ['-periodo', 'veiculo__placa']
       unique_together = ('veiculo', 'periodo') # Garante um registro por veículo/período

   def save(self, *args, **kwargs):
       # Calcula o valor total a pagar
       self.valor_total_pagar = (self.valor_base_faixa or Decimal('0.00')) + (self.ajustes or Decimal('0.00'))
       super().save(*args, **kwargs)

   def __str__(self):
       return f"Pgto Próprio {self.veiculo.placa} - Período {self.periodo}"


# --------------------------------------------------
#  M O D E L O S   D E   S I S T E M A
# --------------------------------------------------

class ParametroSistema(models.Model):
   """Parâmetros gerais do sistema."""
   GRUPOS_PARAMETROS = [
       ('GERAL', 'Configurações Gerais'),
       ('ALERTA', 'Configurações de Alertas'),
       ('PAGTO', 'Configurações de Pagamentos'),
       ('EMAIL', 'Configurações de Email'),
       ('BACKUP', 'Configurações de Backup'),
   ]

   nome = models.CharField("Nome do Parâmetro", max_length=50, unique=True)
   descricao = models.CharField("Descrição", max_length=255)
   valor = models.CharField("Valor", max_length=255)
   grupo = models.CharField("Grupo", max_length=10, choices=GRUPOS_PARAMETROS, default='GERAL')
   tipo_dado = models.CharField("Tipo de Dado", max_length=20, 
                               choices=[('int', 'Inteiro'), ('float', 'Decimal'), 
                                        ('str', 'Texto'), ('bool', 'Booleano'),
                                        ('date', 'Data'), ('json', 'JSON')], 
                               default='str')
   editavel = models.BooleanField("Editável", default=True)
   criado_em = models.DateTimeField(auto_now_add=True)
   atualizado_em = models.DateTimeField(auto_now=True)

   class Meta:
       verbose_name = "Parâmetro do Sistema"
       verbose_name_plural = "Parâmetros do Sistema"
       ordering = ['grupo', 'nome']

   def __str__(self):
       return f"{self.nome} [{self.grupo}]"
   
   def get_valor_tipado(self):
       """Retorna o valor convertido para o tipo correto."""
       import json
       from datetime import datetime
       
       if not self.valor:
           return None
           
       if self.tipo_dado == 'int':
           return int(self.valor)
       elif self.tipo_dado == 'float':
           return float(self.valor)
       elif self.tipo_dado == 'bool':
           return self.valor.lower() in ('true', 't', '1', 'sim', 's')
       elif self.tipo_dado == 'date':
           try:
               return datetime.strptime(self.valor, '%Y-%m-%d').date()
           except:
               return None
       elif self.tipo_dado == 'json':
           try:
               return json.loads(self.valor)
           except:
               return {}
       else:  # Assume string
           return self.valor


class ConfiguracaoEmpresa(models.Model):
   """Configurações da empresa usuária do sistema."""
   razao_social = models.CharField("Razão Social", max_length=120)
   nome_fantasia = models.CharField("Nome Fantasia", max_length=120, null=True, blank=True)
   cnpj = models.CharField("CNPJ", max_length=14, unique=True)
   ie = models.CharField("Inscrição Estadual", max_length=20, null=True, blank=True)
   rntrc = models.CharField("RNTRC", max_length=8, null=True, blank=True)
   email = models.EmailField("Email", null=True, blank=True)
   telefone = models.CharField("Telefone", max_length=15, null=True, blank=True)
   
   # Endereço
   cep = models.CharField("CEP", max_length=8, null=True, blank=True)
   logradouro = models.CharField("Logradouro", max_length=100, null=True, blank=True)
   numero = models.CharField("Número", max_length=10, null=True, blank=True)
   complemento = models.CharField("Complemento", max_length=60, null=True, blank=True)
   bairro = models.CharField("Bairro", max_length=60, null=True, blank=True)
   municipio = models.CharField("Município", max_length=60, null=True, blank=True)
   uf = models.CharField("UF", max_length=2, null=True, blank=True)
   
   # Logotipo
   logo = models.ImageField("Logotipo", upload_to='logos/', null=True, blank=True)
   
   # Dados adicionais
   certificado_digital = models.CharField("Certificado A1 (Nome)", max_length=255, null=True, blank=True)
   responsavel_tecnico_cnpj = models.CharField("CNPJ Responsável Técnico", max_length=14, null=True, blank=True)
   responsavel_tecnico_contato = models.CharField("Nome Responsável Técnico", max_length=60, null=True, blank=True)
   responsavel_tecnico_email = models.EmailField("Email Responsável Técnico", null=True, blank=True)
   responsavel_tecnico_fone = models.CharField("Telefone Responsável Técnico", max_length=15, null=True, blank=True)
   
   criado_em = models.DateTimeField(auto_now_add=True)
   atualizado_em = models.DateTimeField(auto_now=True)

   class Meta:
       verbose_name = "Configuração da Empresa"
       verbose_name_plural = "Configuração da Empresa"

   def __str__(self):
       return self.razao_social


class RegistroBackup(models.Model):
   """Registra os backups realizados pelo sistema."""
   data_hora = models.DateTimeField("Data/Hora", auto_now_add=True)
   nome_arquivo = models.CharField("Nome do Arquivo", max_length=100)
   tamanho_bytes = models.PositiveBigIntegerField("Tamanho (bytes)")
   md5_hash = models.CharField("Hash MD5", max_length=32)
   localizacao = models.CharField("Localização", max_length=255)
   usuario = models.CharField("Usuário", max_length=150)
   status = models.CharField("Status", max_length=20, 
                            choices=[('completo', 'Completo'), 
                                     ('parcial', 'Parcial'),
                                     ('erro', 'Erro')], 
                            default='completo')
   detalhes = models.TextField("Detalhes", null=True, blank=True)

   class Meta:
       verbose_name = "Registro de Backup"
       verbose_name_plural = "Registros de Backup"
       ordering = ['-data_hora']

   def __str__(self):
       return f"Backup {self.nome_arquivo} ({self.data_hora:%d/%m/%Y %H:%M})"


# --------------------------------------------------
#  R E L A C I O N A M E N T O S   F I N A I S
# --------------------------------------------------

# Adicionar relacionamento ManyToMany entre CTe e MDFE usando o modelo intermediário
# (Mantido do código original, mas precisa ser adicionado após ambas as classes serem definidas)
CTeDocumento.add_to_class(
   'mdfe_vinculado',
   models.ManyToManyField(MDFeDocumento, through=MDFeDocumentosVinculados, related_name='ctes_transportados')
)