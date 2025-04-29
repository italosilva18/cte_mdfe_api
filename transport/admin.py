# transport/admin.py

from decimal import Decimal
from django.contrib import admin
from django.utils.html import format_html, mark_safe
from django.urls import reverse
from django.db.models import Sum, Count
from django.contrib.admin import SimpleListFilter
from django.utils.translation import gettext_lazy as _

# Import all models
from .models import (
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
    MDFeCancelamento,
    # Veículos e Manutenção
    Veiculo, ManutencaoVeiculo,
    # Pagamentos e Parametrização
    FaixaKM, PagamentoAgregado, PagamentoProprio
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

# ===================================
# === ModelAdmin para Veículos ===
# ===================================

@admin.register(Veiculo)
class VeiculoAdmin(admin.ModelAdmin):
    """ Configuração do Admin para Veículos. """
    list_display = ('placa', 'proprietario_nome', 'tipo_proprietario_display', 'rntrc_proprietario', 'total_manutencoes', 'total_gastos', 'ativo', 'atualizado_em')
    list_filter = ('ativo', 'uf_proprietario', 'tipo_proprietario', ManutencoesVeiculoFilter)
    search_fields = ('placa', 'renavam', 'proprietario_nome', 'proprietario_cnpj', 'proprietario_cpf')
    readonly_fields = ('criado_em', 'atualizado_em', 'total_manutencoes', 'total_gastos', 'cadastros_vinculados')
    fieldsets = (
        ('Identificação', {'fields': ('placa', 'renavam', 'ativo')}),
        ('Capacidades', {'fields': ('tara', 'capacidade_kg', 'capacidade_m3')}),
        ('Proprietário', {'fields': ('tipo_proprietario', 'proprietario_nome', 'proprietario_cnpj', 'proprietario_cpf', 'rntrc_proprietario', 'uf_proprietario')}),
        ('Estatísticas', {'fields': ('total_manutencoes', 'total_gastos', 'cadastros_vinculados')}),
        ('Datas', {'fields': ('criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )
    inlines = [ManutencaoVeiculoInline]
    actions = ['marcar_como_ativo', 'marcar_como_inativo']

    @admin.display(description='Tipo Proprietário')
    def tipo_proprietario_display(self, obj):
        tipos = {'00': 'Próprio', '01': 'Arrendado', '02': 'Agregado'}
        return tipos.get(obj.tipo_proprietario, obj.tipo_proprietario)

    @admin.display(description='Total Manutenções')
    def total_manutencoes(self, obj):
        count = obj.manutencoes.count()
        if count > 0:
            url = reverse('admin:transport_manutencaoveiculo_changelist') + f'?veiculo__id__exact={obj.id}'
            return format_html('<a href="{}">{} manutenções</a>', url, count)
        return "Nenhuma manutenção"

    @admin.display(description='Total Gastos (R$)')
    def total_gastos(self, obj):
        total = obj.manutencoes.aggregate(t=Sum('valor_total'))['t'] or Decimal('0.00')
        return f"R$ {total:.2f}"

    @admin.display(description='Cadastros Vinculados')
    def cadastros_vinculados(self, obj):
        # Contar vinculos com CT-e e MDF-e
        ctes_count = CTeVeiculoRodoviario.objects.filter(placa=obj.placa).count()
        mdfes_count = MDFeVeiculoTracao.objects.filter(placa=obj.placa).count() + MDFeVeiculoReboque.objects.filter(placa=obj.placa).count()
        
        links = []
        if ctes_count > 0:
            url = reverse('admin:transport_ctedocumento_changelist') + f'?modal_rodoviario__veiculos__placa__exact={obj.placa}'
            links.append(format_html('<a href="{}">{} CT-e(s)</a>', url, ctes_count))
        
        if mdfes_count > 0:
            url = reverse('admin:transport_mdfedocumento_changelist') + f'?modal_rodoviario__veiculo_tracao__placa__exact={obj.placa}'
            links.append(format_html('<a href="{}">{} MDF-e(s)</a>', url, mdfes_count))
        
        if not links:
            return "Nenhum documento vinculado"
        
        return format_html(' | '.join(links))

    @admin.action(description="Marcar selecionados como ativos")
    def marcar_como_ativo(self, request, queryset):
        updated = queryset.update(ativo=True)
        self.message_user(request, f"{updated} veículos foram marcados como ativos.")

    @admin.action(description="Marcar selecionados como inativos")
    def marcar_como_inativo(self, request, queryset):
        updated = queryset.update(ativo=False)
        self.message_user(request, f"{updated} veículos foram marcados como inativos.")


@admin.register(ManutencaoVeiculo)
class ManutencaoVeiculoAdmin(admin.ModelAdmin):
    """ Configuração do Admin para Manutenções de Veículos. """
    list_display = ('veiculo_link', 'data_servico', 'servico_realizado', 'quilometragem', 'valor_total', 'status', 'oficina')
    list_filter = ('status', 'data_servico', 'veiculo')
    search_fields = ('servico_realizado', 'oficina', 'observacoes', 'nota_fiscal', 'veiculo__placa')
    readonly_fields = ('valor_total', 'criado_em', 'atualizado_em')
    autocomplete_fields = ['veiculo']
    date_hierarchy = 'data_servico'
    list_select_related = ('veiculo',)
    actions = ['marcar_como_pago', 'marcar_como_pendente', 'marcar_como_agendado']

    @admin.display(description='Veículo', ordering='veiculo__placa')
    def veiculo_link(self, obj):
        link = reverse("admin:transport_veiculo_change", args=[obj.veiculo.pk])
        return format_html('<a href="{}">{}</a>', link, obj.veiculo.placa)

    fieldsets = (
        (None, {'fields': ('veiculo', 'data_servico', 'status')}),
        ('Serviço', {'fields': ('servico_realizado', 'quilometragem', 'oficina', 'observacoes', 'nota_fiscal')}),
        ('Custos', {'fields': ('valor_peca', 'valor_mao_obra', 'valor_total')}),
        ('Datas', {'fields': ('criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )

    @admin.action(description="Marcar selecionados como pagos")
    def marcar_como_pago(self, request, queryset):
        updated = queryset.update(status='PAGO')
        self.message_user(request, f"{updated} manutenções foram marcadas como pagas.")

    @admin.action(description="Marcar selecionados como pendentes")
    def marcar_como_pendente(self, request, queryset):
        updated = queryset.update(status='PENDENTE')
        self.message_user(request, f"{updated} manutenções foram marcadas como pendentes.")

    @admin.action(description="Marcar selecionados como agendados")
    def marcar_como_agendado(self, request, queryset):
        updated = queryset.update(status='AGENDADO')
        self.message_user(request, f"{updated} manutenções foram marcadas como agendadas.")

# =============================
# === ModelAdmin para CT-e ===
# =============================

@admin.register(CTeDocumento)
class CTeDocumentoAdmin(admin.ModelAdmin):
    list_display = ('chave', 'numero_cte', 'serie_cte', 'modalidade', 'data_emissao_cte', 'remetente_nome', 'destinatario_nome', 'valor_prestacao', 'processado', 'status_geral')
    list_filter = ('processado', 'modalidade', CTeModalidadeFilter, 'identificacao__ambiente', 'identificacao__tipo_cte', ('identificacao__data_emissao', admin.DateFieldListFilter))
    search_fields = ('chave', 'identificacao__numero', 'remetente__razao_social', 'destinatario__razao_social', 'emitente__razao_social', 'modal_rodoviario__veiculos__placa')
    readonly_fields = (
        'id', 'chave', 'versao', 'data_upload', 'processado', 'modalidade', 'xml_original_preview',
        'status_protocolo_display', 'status_cancelamento_display', 'link_identificacao', 'link_emitente',
        'link_remetente', 'link_destinatario', 'link_prestacao', 'link_protocolo', 'link_cancelamento',
        'distancia_km', 'documentos_count'
    )
    date_hierarchy = 'identificacao__data_emissao'
    inlines = [CTeDocumentoTransportadoInline]
    list_select_related = ('identificacao', 'remetente', 'destinatario', 'prestacao', 'protocolo', 'cancelamento')
    actions = ['reprocessar_ctes_selecionados', 'exportar_para_csv']

    fieldsets = (
        ('Documento', {'fields': ('id', 'chave', 'versao', 'modalidade', 'processado', 'data_upload', 'arquivo_xml', 'xml_original_preview')}),
        ('Status', {'fields': ('status_protocolo_display', 'status_cancelamento_display')}),
        ('Resumo', {'fields': ('distancia_km', 'documentos_count')}),
        ('Links Rápidos (Somente Leitura)', {
            'fields': ('link_identificacao', 'link_emitente', 'link_remetente', 'link_destinatario', 'link_prestacao', 'link_protocolo', 'link_cancelamento'),
            'classes': ('collapse',)
        }),
    )

    # Funções de display (métodos)
    @admin.display(description='XML (Preview)', ordering='xml_original')
    def xml_original_preview(self, obj):
        if obj.xml_original:
            from django.utils.html import escape
            preview = escape(obj.xml_original[:1500]).replace('\n', '<br>')
            return mark_safe(f"<pre style='max-height: 250px; overflow: auto; border: 1px solid #ccc; padding: 5px; font-size: 0.9em; line-height: 1.2;'>{preview}...</pre>")
        return "Não disponível"

    @admin.display(description='Número', ordering='identificacao__numero')
    def numero_cte(self, obj): return obj.identificacao.numero if hasattr(obj, 'identificacao') else '-'

    @admin.display(description='Série', ordering='identificacao__serie')
    def serie_cte(self, obj): return obj.identificacao.serie if hasattr(obj, 'identificacao') else '-'

    @admin.display(description='Emissão', ordering='identificacao__data_emissao')
    def data_emissao_cte(self, obj):
        if hasattr(obj, 'identificacao') and obj.identificacao.data_emissao:
            return obj.identificacao.data_emissao.strftime('%d/%m/%Y %H:%M')
        return '-'

    @admin.display(description='Remetente', ordering='remetente__razao_social')
    def remetente_nome(self, obj): return obj.remetente.razao_social if hasattr(obj, 'remetente') else '-'

    @admin.display(description='Destinatário', ordering='destinatario__razao_social')
    def destinatario_nome(self, obj): return obj.destinatario.razao_social if hasattr(obj, 'destinatario') else '-'

    @admin.display(description='Valor Prest.', ordering='prestacao__valor_total_prestado')
    def valor_prestacao(self, obj): return obj.prestacao.valor_total_prestado if hasattr(obj, 'prestacao') else '-'

    @admin.display(description='Distância', ordering='identificacao__dist_km')
    def distancia_km(self, obj): 
        if hasattr(obj, 'identificacao') and obj.identificacao.dist_km:
            return f"{obj.identificacao.dist_km} km"
        return '-'

    @admin.display(description='Documentos', ordering='documentos_transportados__count')
    def documentos_count(self, obj):
        count = obj.documentos_transportados.count()
        if count > 0:
            return f"{count} documento(s)"
        return "Nenhum documento"

    @admin.display(description='Status Protocolo', ordering='protocolo__codigo_status')
    def status_protocolo_display(self, obj):
         if hasattr(obj, 'protocolo') and obj.protocolo:
             return f"{obj.protocolo.codigo_status or '?'} - {obj.protocolo.motivo_status or '?'}"
         return "Pendente"

    @admin.display(description='Cancelado', boolean=True)
    def status_cancelamento_display(self, obj):
        return hasattr(obj, 'cancelamento') and obj.cancelamento is not None and obj.cancelamento.c_stat == 135

    @admin.display(description='Status Geral')
    def status_geral(self, obj):
        if hasattr(obj, 'cancelamento') and obj.cancelamento:
            if obj.cancelamento.c_stat == 135:
                 return format_html('<span style="color: white; background-color: red; padding: 2px 5px; border-radius: 3px; font-weight: bold;">CANCELADO</span>')
            else:
                 return format_html('<span style="color: black; background-color: orange; padding: 2px 5px; border-radius: 3px;">Canc. Pendente ({})</span>', obj.cancelamento.c_stat or '?')
        if hasattr(obj, 'protocolo') and obj.protocolo:
             if obj.protocolo.codigo_status == 100:
                 return format_html('<span style="color: white; background-color: green; padding: 2px 5px; border-radius: 3px;">AUTORIZADO</span>')
             else:
                 return format_html('<span style="color: white; background-color: #cc8400; padding: 2px 5px; border-radius: 3px;">REJEITADO ({})</span>', obj.protocolo.codigo_status)
        if obj.processado:
             return format_html('<span style="color: black; background-color: lightblue; padding: 2px 5px; border-radius: 3px;">Processado</span>')
        return "Pendente"

    # Funções para criar links para modelos relacionados
    def _create_related_link(self, obj, related_attr, model_name_lower, text=None):
        try:
            related_obj = getattr(obj, related_attr, None)
            if related_obj:
                link = reverse(f"admin:transport_{model_name_lower}_change", args=[related_obj.pk])
                display_text = text if text else str(related_obj)
                return format_html('<a href="{}" target="_blank">{}</a>', link, display_text)
        except Exception as e: pass
        return "-"

    @admin.display(description='Identificação')
    def link_identificacao(self, obj): return self._create_related_link(obj, 'identificacao', 'cteidentificacao', 'Ver Detalhes')
    @admin.display(description='Emitente')
    def link_emitente(self, obj): return self._create_related_link(obj, 'emitente', 'cteemitente', 'Ver Emitente')
    @admin.display(description='Remetente')
    def link_remetente(self, obj): return self._create_related_link(obj, 'remetente', 'cteremetente', 'Ver Remetente')
    @admin.display(description='Destinatário')
    def link_destinatario(self, obj): return self._create_related_link(obj, 'destinatario', 'ctedestinatario', 'Ver Destinatário')
    @admin.display(description='Prestação')
    def link_prestacao(self, obj): return self._create_related_link(obj, 'prestacao', 'cteprestacaoservico', 'Ver Valores')
    @admin.display(description='Protocolo')
    def link_protocolo(self, obj): return self._create_related_link(obj, 'protocolo', 'cteprotocoloautorizacao', 'Ver Protocolo')
    @admin.display(description='Cancelamento')
    def link_cancelamento(self, obj): return self._create_related_link(obj, 'cancelamento', 'ctecancelamento', 'Ver Cancelamento')

    @admin.action(description="Reprocessar CT-es selecionados")
    def reprocessar_ctes_selecionados(self, request, queryset):
        from .services.parser_cte import parse_cte_completo
        
        success = 0
        failed = 0
        for cte in queryset:
            cte.processado = False
            cte.save(update_fields=['processado'])
            if parse_cte_completo(cte):
                success += 1
            else:
                failed += 1
        
        if failed:
            self.message_user(request, f"{success} CT-e(s) reprocessados com sucesso. {failed} CT-e(s) com falha no reprocessamento.", level="WARNING")
        else:
            self.message_user(request, f"{success} CT-e(s) reprocessados com sucesso.")

    @admin.action(description="Exportar para CSV")
    def exportar_para_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        from datetime import datetime
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="ctes_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        
        writer = csv.writer(response)
        # Cabeçalho
        writer.writerow([
            'Chave', 'Número', 'Série', 'Data Emissão', 'Modalidade',
            'Remetente', 'Destinatário', 'Valor Total', 'Distância (km)',
            'Status', 'Protocolo'
        ])
        
        # Dados
        for cte in queryset:
            status = "Cancelado" if hasattr(cte, 'cancelamento') and cte.cancelamento and cte.cancelamento.c_stat == 135 else (
                "Autorizado" if hasattr(cte, 'protocolo') and cte.protocolo and cte.protocolo.codigo_status == 100 else "Pendente"
            )
            
            writer.writerow([
                cte.chave,
                getattr(cte.identificacao, 'numero', '-') if hasattr(cte, 'identificacao') else '-',
                getattr(cte.identificacao, 'serie', '-') if hasattr(cte, 'identificacao') else '-',
                cte.identificacao.data_emissao.strftime('%d/%m/%Y %H:%M') if hasattr(cte, 'identificacao') and cte.identificacao.data_emissao else '-',
                cte.modalidade or '-',
                cte.remetente.razao_social if hasattr(cte, 'remetente') else '-',
                cte.destinatario.razao_social if hasattr(cte, 'destinatario') else '-',
                cte.prestacao.valor_total_prestado if hasattr(cte, 'prestacao') else '-',
                cte.identificacao.dist_km if hasattr(cte, 'identificacao') else '-',
                status,
                cte.protocolo.numero_protocolo if hasattr(cte, 'protocolo') and cte.protocolo else '-'
            ])
        
        return response


# === Modelos Relacionados ao CT-e ===

@admin.register(CTeIdentificacao)
class CTeIdentificacaoAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'numero', 'serie', 'data_emissao', 'uf_ini', 'uf_fim', 'dist_km')
    search_fields = ('numero', 'cte__chave', 'nome_mun_ini', 'nome_mun_fim')
    readonly_fields = ('cte_link',) + tuple(f.name for f in CTeIdentificacao._meta.get_fields() if f.name != 'id' and f.name != 'cte')
    list_select_related = ('cte',)
    
    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte.chave)
        return "-"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CTeComplemento)
class CTeComplementoAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'orig_uf', 'dest_uf', 'tem_obs_contrib', 'tem_obs_fisco')
    search_fields = ('cte__chave', 'x_obs')
    readonly_fields = ('cte_link',) + tuple(f.name for f in CTeComplemento._meta.get_fields() if f.name != 'id' and f.name != 'cte')
    list_select_related = ('cte',)
    inlines = [CTeObservacaoContribuinteInline, CTeObservacaoFiscoInline]
    
    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte.chave)
        return "-"
    
    @admin.display(description='Obs. Contribuinte', boolean=True)
    def tem_obs_contrib(self, obj):
        return obj.observacoes_contribuinte.exists()
    
    @admin.display(description='Obs. Fisco', boolean=True)
    def tem_obs_fisco(self, obj):
        return obj.observacoes_fisco.exists()

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CTePrestacaoServico)
class CTePrestacaoServicoAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'valor_total_prestado', 'valor_recebido', 'num_componentes')
    search_fields = ('cte__chave', 'valor_total_prestado')
    readonly_fields = ('cte_link',) + tuple(f.name for f in CTePrestacaoServico._meta.get_fields() if f.name != 'id' and f.name != 'cte')
    list_select_related = ('cte',)
    inlines = [CTeComponenteValorInline]
    
    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte.chave)
        return "-"
    
    @admin.display(description='Componentes', ordering='componentes__count')
    def num_componentes(self, obj):
        count = obj.componentes.count()
        return f"{count} componente(s)" if count else "Nenhum"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CTeModalRodoviario)
class CTeModalRodoviarioAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'rntrc', 'data_prevista_entrega', 'lotacao', 'num_veiculos', 'num_motoristas')
    search_fields = ('cte__chave', 'rntrc', 'veiculos__placa', 'motoristas__nome', 'motoristas__cpf')
    readonly_fields = ('cte_link',) + tuple(f.name for f in CTeModalRodoviario._meta.get_fields() if f.name != 'id' and f.name != 'cte')
    list_select_related = ('cte',)
    inlines = [CTeVeiculoRodoviarioInline, CTeMotoristaInline]
    
    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte.chave)
        return "-"
    
    @admin.display(description='Veículos', ordering='veiculos__count')
    def num_veiculos(self, obj):
        count = obj.veiculos.count()
        return f"{count} veículo(s)" if count else "Nenhum"
    
    @admin.display(description='Motoristas', ordering='motoristas__count')
    def num_motoristas(self, obj):
        count = obj.motoristas.count()
        return f"{count} motorista(s)" if count else "Nenhum"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CTeCarga)
class CTeCargaAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'produto_predominante', 'valor_carga', 'valor_carga_averbada')
    search_fields = ('cte__chave', 'produto_predominante')
    readonly_fields = ('cte_link',) + tuple(f.name for f in CTeCarga._meta.get_fields() if f.name != 'id' and f.name != 'cte')
    list_select_related = ('cte',)
    inlines = [CTeQuantidadeCargaInline]
    
    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte.chave)
        return "-"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CTeCancelamento)
class CTeCancelamentoAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'dh_evento', 'n_prot_original', 'n_prot_retorno', 'status_cancelamento')
    search_fields = ('cte__chave', 'n_prot_original', 'n_prot_retorno', 'x_just')
    readonly_fields = tuple(f.name for f in CTeCancelamento._meta.get_fields() if f.name != 'id')
    list_select_related = ('cte',)
    
    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte.chave)
        return "-"
    
    @admin.display(description='Status', ordering='c_stat')
    def status_cancelamento(self, obj):
        if obj.c_stat == 135:
            return format_html('<span style="color: white; background-color: red; padding: 2px 5px; border-radius: 3px; font-weight: bold;">CANCELADO</span>')
        else:
            return format_html('<span style="color: black; background-color: orange; padding: 2px 5px; border-radius: 3px;">Pendente ({})</span>', obj.c_stat or '?')

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


# ==============================
# === ModelAdmin para MDF-e ===
# ==============================

@admin.register(MDFeDocumento)
class MDFeDocumentoAdmin(admin.ModelAdmin):
    list_display = ('chave', 'numero_mdfe', 'serie_mdfe', 'data_emissao_mdfe', 'uf_inicio', 'uf_fim', 'placa_tracao', 'total_documentos', 'processado', 'status_geral')
    list_filter = ('processado', 'identificacao__tp_amb', 'identificacao__modal', ('identificacao__dh_emi', admin.DateFieldListFilter))
    search_fields = ('chave', 'identificacao__n_mdf', 'emitente__razao_social', 'modal_rodoviario__veiculo_tracao__placa')
    readonly_fields = (
        'id', 'chave', 'versao', 'data_upload', 'processado', 'xml_original_preview',
        'status_protocolo_display', 'status_cancelamento_display', 'status_encerramento_display',
        'link_identificacao', 'link_emitente', 'link_modal', 'link_totais', 'link_protocolo', 'link_cancelamento',
        'ctes_count', 'total_documentos'
    )
    date_hierarchy = 'identificacao__dh_emi'
    inlines = [MDFeDocumentosVinculadosInline, MDFeCondutorInline]
    list_select_related = ('identificacao', 'emitente', 'modal_rodoviario__veiculo_tracao', 'protocolo', 'cancelamento')
    actions = ['reprocessar_mdfes_selecionados', 'exportar_para_csv']

    fieldsets = (
        ('Documento', {'fields': ('id', 'chave', 'versao', 'processado', 'data_upload', 'arquivo_xml', 'xml_original_preview')}),
        ('Status', {'fields': ('status_protocolo_display', 'status_cancelamento_display', 'status_encerramento_display')}),
        ('Resumo', {'fields': ('ctes_count', 'total_documentos')}),
        ('Links Rápidos', {'fields': ('link_identificacao', 'link_emitente', 'link_modal', 'link_totais', 'link_protocolo', 'link_cancelamento'), 'classes': ('collapse',)}),
        # Adicionar fieldset para dados de encerramento se existirem no modelo
        # ('Encerramento', {'fields': ('encerrado', 'data_encerramento', 'municipio_encerramento_cod', 'uf_encerramento', 'protocolo_encerramento'), 'classes': ('collapse',)})
    )

    # Funções de display (métodos)
    @admin.display(description='XML (Preview)', ordering='xml_original')
    def xml_original_preview(self, obj):
        if obj.xml_original:
            from django.utils.html import escape
            preview = escape(obj.xml_original[:1500]).replace('\n', '<br>')
            return mark_safe(f"<pre style='max-height: 250px; overflow: auto; border: 1px solid #ccc; padding: 5px; font-size: 0.9em; line-height: 1.2;'>{preview}...</pre>")
        return "Não disponível"

    @admin.display(description='Número', ordering='identificacao__n_mdf')
    def numero_mdfe(self, obj): return obj.identificacao.n_mdf if hasattr(obj, 'identificacao') else '-'

    @admin.display(description='Série', ordering='identificacao__serie')
    def serie_mdfe(self, obj): return obj.identificacao.serie if hasattr(obj, 'identificacao') else '-'

    @admin.display(description='Emissão', ordering='identificacao__dh_emi')
    def data_emissao_mdfe(self, obj):
        if hasattr(obj, 'identificacao') and obj.identificacao.dh_emi:
            return obj.identificacao.dh_emi.strftime('%d/%m/%Y %H:%M')
        return '-'

    @admin.display(description='UF Ini', ordering='identificacao__uf_ini')
    def uf_inicio(self, obj): return obj.identificacao.uf_ini if hasattr(obj, 'identificacao') else '-'

    @admin.display(description='UF Fim', ordering='identificacao__uf_fim')
    def uf_fim(self, obj): return obj.identificacao.uf_fim if hasattr(obj, 'identificacao') else '-'

    @admin.display(description='Placa Tração', ordering='modal_rodoviario__veiculo_tracao__placa')
    def placa_tracao(self, obj):
        try: return obj.modal_rodoviario.veiculo_tracao.placa
        except: return '-'

    @admin.display(description='CT-es', ordering='ctes_transportados__count')
    def ctes_count(self, obj):
        count = obj.ctes_transportados.count()
        if count > 0:
            url = reverse('admin:transport_ctedocumento_changelist') + f'?mdfe_vinculado__id__exact={obj.id}'
            return format_html('<a href="{}">{} CT-e(s)</a>', url, count)
        return "Nenhum CT-e vinculado"

    @admin.display(description='Total Docs')
    def total_documentos(self, obj):
        count = MDFeDocumentosVinculados.objects.filter(mdfe=obj).count()
        return f"{count} documento(s)" if count else "Nenhum documento"

    @admin.display(description='Status Protocolo', ordering='protocolo__codigo_status')
    def status_protocolo_display(self, obj):
         if hasattr(obj, 'protocolo') and obj.protocolo:
             return f"{obj.protocolo.codigo_status or '?'} - {obj.protocolo.motivo_status or '?'}"
         return "Pendente"

    @admin.display(description='Cancelado', boolean=True)
    def status_cancelamento_display(self, obj):
        return hasattr(obj, 'cancelamento') and obj.cancelamento is not None and obj.cancelamento.c_stat == 135

    @admin.display(description='Encerrado', boolean=True)
    def status_encerramento_display(self, obj):
        # Verifica se o campo 'encerrado' existe e é True
        return getattr(obj, 'encerrado', False)

    @admin.display(description='Status Geral')
    def status_geral(self, obj):
        if hasattr(obj, 'cancelamento') and obj.cancelamento and obj.cancelamento.c_stat == 135:
            return format_html('<span style="color: white; background-color: red; padding: 2px 5px; border-radius: 3px; font-weight: bold;">CANCELADO</span>')
        # Adiciona verificação de encerramento ANTES de autorizado
        if getattr(obj, 'encerrado', False):
             return format_html('<span style="color: black; background-color: gray; padding: 2px 5px; border-radius: 3px;">ENCERRADO</span>')
        if hasattr(obj, 'protocolo') and obj.protocolo:
             if obj.protocolo.codigo_status == 100:
                 return format_html('<span style="color: white; background-color: green; padding: 2px 5px; border-radius: 3px;">AUTORIZADO</span>')
             else:
                 return format_html('<span style="color: white; background-color: #cc8400; padding: 2px 5px; border-radius: 3px;">REJEITADO ({})</span>', obj.protocolo.codigo_status)
        if obj.processado:
             return format_html('<span style="color: black; background-color: lightblue; padding: 2px 5px; border-radius: 3px;">Processado</span>')
        return "Pendente"

    # Links para modelos relacionados
    def _create_related_link_mdfe(self, obj, related_attr, model_name_lower, text=None):
        try:
            related_obj = getattr(obj, related_attr, None)
            if related_obj:
                link = reverse(f"admin:transport_{model_name_lower}_change", args=[related_obj.pk])
                display_text = text if text else str(related_obj)
                return format_html('<a href="{}" target="_blank">{}</a>', link, display_text)
        except Exception as e: pass
        return "-"

    @admin.display(description='Identificação')
    def link_identificacao(self, obj): return self._create_related_link_mdfe(obj, 'identificacao', 'mdfeidentificacao', 'Ver Detalhes')
    @admin.display(description='Emitente')
    def link_emitente(self, obj): return self._create_related_link_mdfe(obj, 'emitente', 'mdfeemitente', 'Ver Emitente')
    @admin.display(description='Modal')
    def link_modal(self, obj): return self._create_related_link_mdfe(obj, 'modal_rodoviario', 'mdfemodalrodoviario', 'Ver Modal')
    @admin.display(description='Totais')
    def link_totais(self, obj): return self._create_related_link_mdfe(obj, 'totais', 'mdfetotais', 'Ver Totais')
    @admin.display(description='Protocolo')
    def link_protocolo(self, obj): return self._create_related_link_mdfe(obj, 'protocolo', 'mdfeprotocoloautorizacao', 'Ver Protocolo')
    @admin.display(description='Cancelamento')
    def link_cancelamento(self, obj): return self._create_related_link_mdfe(obj, 'cancelamento', 'mdfecancelamento', 'Ver Cancelamento')

    @admin.action(description="Reprocessar MDF-es selecionados")
    def reprocessar_mdfes_selecionados(self, request, queryset):
        from .services.parser_mdfe import parse_mdfe_completo
        
        success = 0
        failed = 0
        for mdfe in queryset:
            mdfe.processado = False
            mdfe.save(update_fields=['processado'])
            if parse_mdfe_completo(mdfe):
                success += 1
            else:
                failed += 1
        
        if failed:
            self.message_user(request, f"{success} MDF-e(s) reprocessados com sucesso. {failed} MDF-e(s) com falha no reprocessamento.", level="WARNING")
        else:
            self.message_user(request, f"{success} MDF-e(s) reprocessados com sucesso.")

    @admin.action(description="Exportar para CSV")
    def exportar_para_csv(self, request, queryset):
        import csv
        from django.http import HttpResponse
        from datetime import datetime
        
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="mdfes_export_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        
        writer = csv.writer(response)
        # Cabeçalho
        writer.writerow([
            'Chave', 'Número', 'Série', 'Data Emissão', 'UF Início', 'UF Fim',
            'Placa Tração', 'Total Documentos', 'Status', 'Protocolo'
        ])
        
        # Dados
        for mdfe in queryset:
            status = "Cancelado" if hasattr(mdfe, 'cancelamento') and mdfe.cancelamento and mdfe.cancelamento.c_stat == 135 else (
                "Encerrado" if getattr(mdfe, 'encerrado', False) else (
                    "Autorizado" if hasattr(mdfe, 'protocolo') and mdfe.protocolo and mdfe.protocolo.codigo_status == 100 else "Pendente"
                )
            )
            
            docs_count = MDFeDocumentosVinculados.objects.filter(mdfe=mdfe).count()
            
            writer.writerow([
                mdfe.chave,
                getattr(mdfe.identificacao, 'n_mdf', '-') if hasattr(mdfe, 'identificacao') else '-',
                getattr(mdfe.identificacao, 'serie', '-') if hasattr(mdfe, 'identificacao') else '-',
                mdfe.identificacao.dh_emi.strftime('%d/%m/%Y %H:%M') if hasattr(mdfe, 'identificacao') and mdfe.identificacao.dh_emi else '-',
                getattr(mdfe.identificacao, 'uf_ini', '-') if hasattr(mdfe, 'identificacao') else '-',
                getattr(mdfe.identificacao, 'uf_fim', '-') if hasattr(mdfe, 'identificacao') else '-',
                mdfe.modal_rodoviario.veiculo_tracao.placa if hasattr(mdfe, 'modal_rodoviario') and hasattr(mdfe.modal_rodoviario, 'veiculo_tracao') else '-',
                docs_count,
                status,
                mdfe.protocolo.numero_protocolo if hasattr(mdfe, 'protocolo') and mdfe.protocolo else '-'
            ])
        
        return response


# =====================================================
# === ModelAdmin para Pagamentos e Parametros   ===
# =====================================================

@admin.register(FaixaKM)
class FaixaKMAdmin(admin.ModelAdmin):
    list_display = ('min_km', 'max_km', 'valor_pago')
    ordering = ('min_km',)
    list_editable = ('valor_pago',)
    
    def save_model(self, request, obj, form, change):
        # Validação para garantir que não há sobreposições
        if obj.max_km:
            # Se há um máximo, verificar se tem alguma faixa que começa nesse valor ou abaixo
            overlap = FaixaKM.objects.filter(min_km__lte=obj.max_km, min_km__gt=obj.min_km)
            if change:  # Se estiver editando, exclui a própria do check
                overlap = overlap.exclude(pk=obj.pk)
            if overlap.exists():
                # Em um caso real, aqui deveria levantar uma ValidationError
                self.message_user(request, f"Atenção: há sobreposição com outras faixas!", level="WARNING")
        
        # Validação para garantir que max_km > min_km
        if obj.max_km and obj.max_km <= obj.min_km:
            self.message_user(request, f"Erro: o KM máximo deve ser maior que o KM mínimo!", level="ERROR")
            return
            
        super().save_model(request, obj, form, change)


@admin.register(PagamentoAgregado)
class PagamentoAgregadoAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'condutor_nome', 'placa', 'valor_frete_total', 'percentual_repasse', 'valor_repassado', 'status', 'data_prevista', 'data_pagamento', 'obs')
    list_filter = ('status', 'data_prevista', 'data_pagamento', 'placa')
    search_fields = ('condutor_nome', 'condutor_cpf', 'placa', 'cte__chave', 'cte__identificacao__numero')
    readonly_fields = ('valor_repassado', 'criado_em', 'atualizado_em', 'cte_link')
    autocomplete_fields = ['cte']
    list_editable = ('status', 'data_pagamento', 'obs')
    date_hierarchy = 'data_prevista'
    list_select_related = ('cte', 'cte__identificacao')
    actions = ['marcar_como_pago', 'marcar_como_pendente']

    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            num = obj.cte.identificacao.numero if hasattr(obj.cte, 'identificacao') else '?'
            return format_html('<a href="{}">{} (Nº {})</a>', link, obj.cte.chave, num)
        return "-"

    fieldsets = (
        ('Referência', {'fields': ('cte', 'cte_link',)}),
        ('Condutor/Veículo', {'fields': ('placa', 'condutor_nome', 'condutor_cpf')}),
        ('Valores', {'fields': ('valor_frete_total', 'percentual_repasse', 'valor_repassado')}),
        ('Pagamento', {'fields': ('status', 'data_prevista', 'data_pagamento')}),
        ('Outros', {'fields': ('obs', 'criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )
    
    @admin.action(description="Marcar selecionados como pagos")
    def marcar_como_pago(self, request, queryset):
        from datetime import date
        updated = queryset.update(status='pago', data_pagamento=date.today())
        self.message_user(request, f"{updated} pagamentos foram marcados como pagos.")

    @admin.action(description="Marcar selecionados como pendentes")
    def marcar_como_pendente(self, request, queryset):
        updated = queryset.update(status='pendente', data_pagamento=None)
        self.message_user(request, f"{updated} pagamentos foram marcados como pendentes.")


@admin.register(PagamentoProprio)
class PagamentoProprioAdmin(admin.ModelAdmin):
    list_display = ('veiculo_link', 'periodo', 'km_total_periodo', 'valor_base_faixa', 'ajustes', 'valor_total_pagar', 'status', 'data_pagamento', 'obs')
    list_filter = ('status', 'periodo', 'data_pagamento', 'veiculo')
    search_fields = ('veiculo__placa', 'periodo')
    readonly_fields = ('valor_total_pagar', 'criado_em', 'atualizado_em', 'veiculo_link')
    autocomplete_fields = ['veiculo']
    list_editable = ('status', 'data_pagamento', 'ajustes', 'obs')
    ordering = ('-periodo', 'veiculo__placa')
    list_select_related = ('veiculo',)
    actions = ['marcar_como_pago', 'marcar_como_pendente']

    @admin.display(description='Veículo', ordering='veiculo__placa')
    def veiculo_link(self, obj):
        link = reverse("admin:transport_veiculo_change", args=[obj.veiculo.pk])
        return format_html('<a href="{}">{}</a>', link, obj.veiculo.placa)

    fieldsets = (
        (None, {'fields': ('veiculo', 'veiculo_link', 'periodo')}),
        ('Cálculo Base', {'fields': ('km_total_periodo', 'valor_base_faixa')}),
        ('Ajuste e Total', {'fields': ('ajustes', 'valor_total_pagar')}),
        ('Pagamento', {'fields': ('status', 'data_pagamento')}),
        ('Outros', {'fields': ('obs', 'criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )
    
    @admin.action(description="Marcar selecionados como pagos")
    def marcar_como_pago(self, request, queryset):
        from datetime import date
        updated = queryset.update(status='pago', data_pagamento=date.today())
        self.message_user(request, f"{updated} pagamentos foram marcados como pagos.")

    @admin.action(description="Marcar selecionados como pendentes")
    def marcar_como_pendente(self, request, queryset):
        updated = queryset.update(status='pendente', data_pagamento=None)
        self.message_user(request, f"{updated} pagamentos foram marcados como pendentes.")


# ==========================================================
# === Modelos Relacionados ao MDF-e ===
# ==========================================================

@admin.register(MDFeIdentificacao)
class MDFeIdentificacaoAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'n_mdf', 'serie', 'dh_emi', 'uf_ini', 'uf_fim', 'modal')
    search_fields = ('n_mdf', 'mdfe__chave', 'uf_ini', 'uf_fim')
    readonly_fields = ('mdfe_link',) + tuple(f.name for f in MDFeIdentificacao._meta.get_fields() if f.name != 'id' and f.name != 'mdfe')
    list_select_related = ('mdfe',)
    inlines = [MDFeMunicipioCarregamentoInline, MDFePercursoInline]
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MDFeModalRodoviario)
class MDFeModalRodoviarioAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'rntrc', 'placa_tracao', 'proprietario_tracao', 'qtd_reboques')
    search_fields = ('mdfe__chave', 'rntrc', 'veiculo_tracao__placa')
    readonly_fields = ('mdfe_link',) + tuple(f.name for f in MDFeModalRodoviario._meta.get_fields() if f.name != 'id' and f.name != 'mdfe')
    list_select_related = ('mdfe', 'veiculo_tracao')
    inlines = [MDFeVeiculoReboqueInline]
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"
    
    @admin.display(description='Placa Tração', ordering='veiculo_tracao__placa')
    def placa_tracao(self, obj):
        if hasattr(obj, 'veiculo_tracao') and obj.veiculo_tracao:
            return obj.veiculo_tracao.placa
        return "-"
    
    @admin.display(description='Proprietário Tração')
    def proprietario_tracao(self, obj):
        if hasattr(obj, 'veiculo_tracao') and obj.veiculo_tracao:
            if obj.veiculo_tracao.prop_razao_social:
                return obj.veiculo_tracao.prop_razao_social
            return "Emitente" # Assume-se que é o emitente se não preenchido
        return "-"
    
    @admin.display(description='Reboques')
    def qtd_reboques(self, obj):
        count = obj.veiculos_reboque.count()
        return f"{count} reboque(s)" if count else "Nenhum"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MDFeCondutor)
class MDFeCondutorAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'nome', 'cpf')
    search_fields = ('mdfe__chave', 'nome', 'cpf')
    readonly_fields = ('mdfe_link',) + tuple(f.name for f in MDFeCondutor._meta.get_fields() if f.name != 'id' and f.name != 'mdfe')
    list_select_related = ('mdfe',)
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MDFeMunicipioDescarga)
class MDFeMunicipioDescargaAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'c_mun_descarga', 'x_mun_descarga', 'qtd_documentos')
    search_fields = ('mdfe__chave', 'c_mun_descarga', 'x_mun_descarga')
    readonly_fields = ('mdfe_link',) + tuple(f.name for f in MDFeMunicipioDescarga._meta.get_fields() if f.name != 'id' and f.name != 'mdfe')
    list_select_related = ('mdfe',)
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"
    
    @admin.display(description='Documentos')
    def qtd_documentos(self, obj):
        count = obj.docs_vinculados_municipio.count()
        return f"{count} documento(s)" if count else "Nenhum"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MDFeTotais)
class MDFeTotaisAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'q_cte', 'q_nfe', 'v_carga', 'unidade_carga', 'q_carga')
    search_fields = ('mdfe__chave',)
    readonly_fields = ('mdfe_link',) + tuple(f.name for f in MDFeTotais._meta.get_fields() if f.name != 'id' and f.name != 'mdfe')
    list_select_related = ('mdfe',)
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"
    
    @admin.display(description='Unidade Carga')
    def unidade_carga(self, obj):
        unidades = {'01': 'KG', '02': 'TON'}
        return unidades.get(obj.c_unid, obj.c_unid)

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MDFeDocumentosVinculados)
class MDFeDocumentosVinculadosAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'municipio_descarga_display', 'tipo_documento', 'chave_documento', 'cte_relacionado_link')
    search_fields = ('mdfe__chave', 'chave_documento', 'municipio_descarga__x_mun_descarga', 'cte_relacionado__chave')
    readonly_fields = tuple(f.name for f in MDFeDocumentosVinculados._meta.get_fields() if f.name != 'id')
    list_select_related = ('mdfe', 'municipio_descarga', 'cte_relacionado')
    inlines = [MDFeProdutoPerigosoInline]
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"
    
    @admin.display(description='Município Descarga')
    def municipio_descarga_display(self, obj):
        if obj.municipio_descarga:
            return f"{obj.municipio_descarga.x_mun_descarga} ({obj.municipio_descarga.c_mun_descarga})"
        return "-"
    
    @admin.display(description='Tipo')
    def tipo_documento(self, obj):
        try:
            modelo = obj.chave_documento[20:22]
            if modelo == '57': return 'CT-e'
            if modelo == '55': return 'NF-e'
            if modelo == '67': return 'CT-e OS'
        except: pass
        return 'Outro'
    
    @admin.display(description='CT-e Relacionado')
    def cte_relacionado_link(self, obj):
        if obj.cte_relacionado:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte_relacionado.pk])
            return format_html('<a href="{}">{}</a>', link, obj.cte_relacionado.chave)
        return "-"

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(MDFeCancelamento)
class MDFeCancelamentoAdmin(admin.ModelAdmin):
    list_display = ('mdfe_link', 'dh_evento', 'n_prot_original', 'n_prot_retorno', 'status_cancelamento')
    search_fields = ('mdfe__chave', 'n_prot_original', 'n_prot_retorno', 'x_just')
    readonly_fields = tuple(f.name for f in MDFeCancelamento._meta.get_fields() if f.name != 'id')
    list_select_related = ('mdfe',)
    
    @admin.display(description='MDF-e', ordering='mdfe__chave')
    def mdfe_link(self, obj):
        if obj.mdfe:
            link = reverse("admin:transport_mdfedocumento_change", args=[obj.mdfe.pk])
            return format_html('<a href="{}">{}</a>', link, obj.mdfe.chave)
        return "-"
    
    @admin.display(description='Status', ordering='c_stat')
    def status_cancelamento(self, obj):
        if obj.c_stat == 135:
            return format_html('<span style="color: white; background-color: red; padding: 2px 5px; border-radius: 3px; font-weight: bold;">CANCELADO</span>')
        else:
            return format_html('<span style="color: black; background-color: orange; padding: 2px 5px; border-radius: 3px;">Pendente ({})</span>', obj.c_stat or '?')

    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False


# ==========================================================
# === Dashboard Admin ===
# ==========================================================

class TransporteDashboardAdmin(admin.AdminSite):
    """Site de admin personalizado para o dashboard de Transporte."""
    site_header = 'Sistema de Gestão de Transporte'
    site_title = 'TMS Dashboard'
    index_title = 'Painel de Controle'
    
    def get_app_list(self, request):
        """Personaliza a lista de apps no painel lateral."""
        # Get the original app_list
        app_list = super().get_app_list(request)
        
        # Adiciona estatísticas no topo da lista de apps
        from django.db.models import Count, Sum
        
        # Obtém contagens
        ctes_count = CTeDocumento.objects.filter(processado=True).count()
        mdfes_count = MDFeDocumento.objects.filter(processado=True).count()
        veiculos_count = Veiculo.objects.filter(ativo=True).count()
        manutencoes_pendentes = ManutencaoVeiculo.objects.filter(status='PENDENTE').count()
        pagamentos_pendentes = PagamentoAgregado.objects.filter(status='pendente').count() + PagamentoProprio.objects.filter(status='pendente').count()
        
        # Adiciona uma nova seção no topo
        app_list.insert(0, {
            'name': 'Dashboard',
            'app_label': 'dashboard',
            'app_url': '/admin/',
            'has_module_perms': True,
            'models': [
                {
                    'name': f'CT-es: {ctes_count}',
                    'object_name': 'CTeCount',
                    'admin_url': reverse('admin:transport_ctedocumento_changelist'),
                    'perms': {'view': True}
                },
                {
                    'name': f'MDF-es: {mdfes_count}',
                    'object_name': 'MDFeCount',
                    'admin_url': reverse('admin:transport_mdfedocumento_changelist'),
                    'perms': {'view': True}
                },
                {
                    'name': f'Veículos Ativos: {veiculos_count}',
                    'object_name': 'VeiculoCount',
                    'admin_url': reverse('admin:transport_veiculo_changelist'),
                    'perms': {'view': True}
                },
                {
                    'name': f'Manutenções Pendentes: {manutencoes_pendentes}',
                    'object_name': 'ManutencaoPendente',
                    'admin_url': reverse('admin:transport_manutencaoveiculo_changelist') + '?status__exact=PENDENTE',
                    'perms': {'view': True}
                },
                {
                    'name': f'Pagamentos Pendentes: {pagamentos_pendentes}',
                    'object_name': 'PagamentoPendente',
                    'admin_url': reverse('admin:transport_pagamentoagregado_changelist') + '?status__exact=pendente',
                    'perms': {'view': True}
                },
            ]
        })
        
        return app_list


# ==========================================================
# === Registro de Outros Modelos Relacionados ===
# ==========================================================

# Registra modelos relacionados adicionais que não precisam de customização completa
admin.site.register(CTeEmitente)
admin.site.register(CTeRemetente)
admin.site.register(CTeExpedidor)
admin.site.register(CTeRecebedor)
admin.site.register(CTeVeiculoRodoviario)
admin.site.register(CTeMotorista)
admin.site.register(CTeSeguro)
admin.site.register(CTeProtocoloAutorizacao)
admin.site.register(CTeSuplementar)
admin.site.register(MDFeEmitente)
admin.site.register(MDFeVeiculoTracao)
admin.site.register(MDFeVeiculoReboque)
admin.site.register(MDFeProdutoPerigoso)
admin.site.register(MDFeSeguroCarga)
admin.site.register(MDFeProdutoPredominante)
admin.site.register(MDFeInformacoesAdicionais)
admin.site.register(MDFeProtocoloAutorizacao)
admin.site.register(MDFeSuplementar)

# Opcional: Criar e registrar o Admin site personalizado
# transport_admin = TransporteDashboardAdmin(name='transport_admin')
# transport_admin.register(CTeDocumento, CTeDocumentoAdmin)
# transport_admin.register(MDFeDocumento, MDFeDocumentoAdmin)
# transport_admin.register(Veiculo, VeiculoAdmin)
# ...E assim por diante