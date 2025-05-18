# transport/admin.py

from decimal import Decimal
from django.contrib import admin
from django.utils.html import format_html, mark_safe
from django.urls import reverse
from django.db.models import Sum, Count
from django.contrib.admin import SimpleListFilter
from django.utils.translation import gettext_lazy as _

# Import all models
from ..models import (
    # Base
    Endereco, 
    # CT-e
    CTeDocumento, CTeIdentificacao, CTeComplemento, CTeObservacaoContribuinte,
    CTeObservacaoFisco, CTeEmitente, CTeRemetente, CTEDestinatario, CTeExpedidor, CTeRecebedor,
    CTePrestacaoServico, CTeComponenteValor, CTeTributos, CTeCarga, CTeQuantidadeCarga,
    CTeDocumentoTransportado, CTeSeguro, CTeModalRodoviario, CTeVeiculoRodoviario,
    CTeMotorista, CTeAutXML, CTeResponsavelTecnico, CTeProtocoloAutorizacao,
    CTeSuplementar, CTeCancelamento,
    # MDF-e
    MDFeDocumento, MDFeIdentificacao, MDFeMunicipioCarregamento, MDFePercurso,
    MDFeEmitente, MDFeModalRodoviario, MDFeVeiculoTracao, MDFeVeiculoReboque,
    MDFeCondutor, MDFeCIOT, MDFeValePedagio, MDFeContratante,
    MDFeMunicipioDescarga, MDFeDocumentosVinculados, MDFeProdutoPerigoso,
    MDFeSeguroCarga, MDFeAverbacaoSeguro, MDFeProdutoPredominante, MDFeTotais,
    MDFeLacreRodoviario, MDFeAutXML, MDFeInformacoesAdicionais,
    MDFeResponsavelTecnico, MDFeProtocoloAutorizacao, MDFeSuplementar,
    MDFeCancelamento, MDFeCancelamentoEncerramento,
    # Veículos e Manutenção
    Veiculo, ManutencaoVeiculo,
    # Pagamentos e Parametrização
    FaixaKM, PagamentoAgregado, PagamentoProprio,
    # Configurações do Sistema
    ParametroSistema, ConfiguracaoEmpresa, RegistroBackup
)

# ===========================
# === Custom Filters ===
# ===========================

class CTeModalidadeFilter(SimpleListFilter):
    title = _('Modalidade de Frete')
    parameter_name = 'modalidade'

    def lookups(self, request, model_admin):
        return (
            ('CIF', _('CIF')),
            ('FOB', _('FOB')),
            ('NOINF', _('Não Informado')),
        )

    def queryset(self, request, queryset):
        if self.value() == 'CIF':
            return queryset.filter(modalidade='CIF')
        elif self.value() == 'FOB':
            return queryset.filter(modalidade='FOB')
        elif self.value() == 'NOINF':
            return queryset.filter(modalidade__isnull=True)
        return queryset

class ManutencoesVeiculoFilter(SimpleListFilter):
    title = _('Status de Manutenção')
    parameter_name = 'status_manutencao'

    def lookups(self, request, model_admin):
        return (
            ('com_manutencao', _('Com Manutenções')),
            ('sem_manutencao', _('Sem Manutenções')),
            ('manutencao_pendente', _('Com Manutenções Pendentes')),
        )

    def queryset(self, request, queryset):
        if self.value() == 'com_manutencao':
            return queryset.filter(manutencoes__isnull=False).distinct()
        elif self.value() == 'sem_manutencao':
            return queryset.filter(manutencoes__isnull=True)
        elif self.value() == 'manutencao_pendente':
            return queryset.filter(manutencoes__status='PENDENTE').distinct()
        return queryset

class StatusEncerramentoMDFeFilter(SimpleListFilter):
    title = _('Status de Encerramento')
    parameter_name = 'status_encerramento'

    def lookups(self, request, model_admin):
        return (
            ('encerrado', _('Encerrado')),
            ('nao_encerrado', _('Não Encerrado')),
            ('cancelado_enc', _('Encerramento Cancelado')),
        )

    def queryset(self, request, queryset):
        if self.value() == 'encerrado':
            return queryset.filter(encerrado=True)
        elif self.value() == 'nao_encerrado':
            return queryset.filter(encerrado=False)
        elif self.value() == 'cancelado_enc':
            return queryset.filter(cancelamento_encerramento__isnull=False)
        return queryset

# ===========================
# === Inlines reutilizáveis ===
# ===========================

class ManutencaoVeiculoInline(admin.TabularInline):
    """ Permite ver/adicionar manutenções na página do Veículo. """
    model = ManutencaoVeiculo
    extra = 0
    fields = ('data_servico', 'servico_realizado', 'quilometragem', 'valor_total', 'status', 'oficina')
    readonly_fields = ('valor_total',)
    ordering = ('-data_servico',)
    show_change_link = True

class CTeDocumentoTransportadoInline(admin.TabularInline):
    """ Mostra documentos transportados na página do CT-e (apenas leitura). """
    model = CTeDocumentoTransportado
    extra = 0
    fields = ('tipo_documento', 'chave_nfe', 'numero_nf', 'valor_total_nf', 'peso_total_kg_nf')
    readonly_fields = fields # Todos somente leitura
    can_delete = False
    verbose_name = "Documento Transportado"
    verbose_name_plural = "Documentos Transportados"
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False

class CTeComponenteValorInline(admin.TabularInline):
    """ Mostra componentes de valor na página da prestação de serviço. """
    model = CTeComponenteValor
    extra = 0
    fields = ('nome', 'valor')
    readonly_fields = fields
    can_delete = False
    verbose_name = "Componente de Valor"
    verbose_name_plural = "Componentes de Valor"

    def has_add_permission(self, request, obj=None):
        return False

class CTeObservacaoContribuinteInline(admin.TabularInline):
    """ Mostra observações do contribuinte. """
    model = CTeObservacaoContribuinte
    extra = 0
    fields = ('campo', 'texto')
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

class CTeObservacaoFiscoInline(admin.TabularInline):
    """ Mostra observações do fisco. """
    model = CTeObservacaoFisco
    extra = 0
    fields = ('campo', 'texto')
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

class CTeVeiculoRodoviarioInline(admin.TabularInline):
    """ Mostra veículos do modal rodoviário. """
    model = CTeVeiculoRodoviario
    extra = 0
    fields = ('placa', 'renavam', 'tara', 'cap_kg', 'tipo_proprietario', 'prop_razao_social')
    readonly_fields = fields
    can_delete = False
    verbose_name = "Veículo"
    verbose_name_plural = "Veículos"
    show_change_link = True

class CTeMotoristaInline(admin.TabularInline):
    """ Mostra motoristas do modal rodoviário. """
    model = CTeMotorista
    extra = 0
    fields = ('nome', 'cpf')
    readonly_fields = fields
    can_delete = False
    show_change_link = True

class CTeSeguroInline(admin.TabularInline):
    """ Mostra seguros do CT-e. """
    model = CTeSeguro
    extra = 0
    fields = ('responsavel', 'nome_seguradora', 'numero_apolice', 'valor_carga_averbada')
    readonly_fields = fields
    can_delete = False
    show_change_link = True

class CTeQuantidadeCargaInline(admin.TabularInline):
    """ Mostra quantidades de carga. """
    model = CTeQuantidadeCarga
    extra = 0
    fields = ('codigo_unidade', 'tipo_medida', 'quantidade')
    readonly_fields = fields
    can_delete = False

class MDFeDocumentosVinculadosInline(admin.TabularInline):
    """ Mostra documentos vinculados na página do MDF-e (apenas leitura). """
    model = MDFeDocumentosVinculados
    extra = 0
    fields = ('municipio_descarga_link', 'chave_documento', 'cte_relacionado_link', 'tipo_doc')
    readonly_fields = ('municipio_descarga_link', 'chave_documento', 'cte_relacionado_link', 'tipo_doc')
    can_delete = False
    verbose_name = "Documento Vinculado"
    verbose_name_plural = "Documentos Vinculados por Município"
    show_change_link = True

    @admin.display(description='Município Descarga')
    def municipio_descarga_link(self, obj):
        if obj.municipio_descarga:
            link = reverse("admin:transport_mdfemunicipiodescarga_change", args=[obj.municipio_descarga.pk])
            return format_html('<a href="{}" target="_blank">{} ({})</a>', link, obj.municipio_descarga.x_mun_descarga, obj.municipio_descarga.c_mun_descarga)
        return "-"
    municipio_descarga_link.admin_order_field = 'municipio_descarga__x_mun_descarga'

    @admin.display(description='CT-e Relacionado')
    def cte_relacionado_link(self, obj):
        if obj.cte_relacionado:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte_relacionado.pk])
            return format_html('<a href="{}" target="_blank">{}</a>', link, obj.cte_relacionado.chave)
        return "-"
    cte_relacionado_link.admin_order_field = 'cte_relacionado__chave'

    @admin.display(description='Tipo Doc.')
    def tipo_doc(self, obj):
        try:
            modelo = obj.chave_documento[20:22]
            if modelo == '57': return 'CT-e'
            if modelo == '55': return 'NF-e'
            if modelo == '67': return 'CT-e OS'
        except: pass
        return 'Outro'

    def has_add_permission(self, request, obj=None):
        return False

class MDFeCondutorInline(admin.TabularInline):
    """ Mostra condutores do MDF-e. """
    model = MDFeCondutor
    extra = 0
    fields = ('nome', 'cpf')
    readonly_fields = fields
    can_delete = False
    show_change_link = True

class MDFeVeiculoReboqueInline(admin.TabularInline):
    """ Mostra veículos reboque do modal rodoviário MDF-e. """
    model = MDFeVeiculoReboque
    extra = 0
    fields = ('placa', 'renavam', 'tara', 'cap_kg', 'uf')
    readonly_fields = fields
    can_delete = False
    show_change_link = True

class MDFeMunicipioCarregamentoInline(admin.TabularInline):
    """ Mostra municípios de carregamento do MDF-e. """
    model = MDFeMunicipioCarregamento
    extra = 0
    fields = ('c_mun_carrega', 'x_mun_carrega')
    readonly_fields = fields
    can_delete = False

class MDFePercursoInline(admin.TabularInline):
    """ Mostra percursos do MDF-e. """
    model = MDFePercurso
    extra = 0
    fields = ('uf_per',)
    readonly_fields = fields
    can_delete = False

class MDFeProdutoPerigosoInline(admin.TabularInline):
    """ Mostra produtos perigosos dos documentos vinculados. """
    model = MDFeProdutoPerigoso
    extra = 0
    fields = ('n_onu', 'x_nome_ae', 'x_cla_risco', 'q_tot_prod')
    readonly_fields = fields
    can_delete = False

class MDFeAverbacaoSeguroInline(admin.TabularInline):
    """ Mostra averbações de seguro. """
    model = MDFeAverbacaoSeguro
    extra = 0
    fields = ('numero',)
    readonly_fields = fields
    can_delete = False

class MDFeLacreRodoviarioInline(admin.TabularInline):
    """ Mostra lacres rodoviários. """
    model = MDFeLacreRodoviario
    extra = 0
    fields = ('numero',)
    readonly_fields = fields
    can_delete = False

