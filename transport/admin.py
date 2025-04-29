# transport/admin.py

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Sum # Para possíveis cálculos em display

# Importar todos os modelos relevantes
from .models import (
    # Base
    Endereco, # Não registrado diretamente, mas usado por outros
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
# === Inlines reutilizáveis ===
# ===========================

class ManutencaoVeiculoInline(admin.TabularInline):
    """ Permite ver/adicionar manutenções na página do Veículo. """
    model = ManutencaoVeiculo
    extra = 0
    fields = ('data_servico', 'servico_realizado', 'quilometragem', 'valor_total', 'status', 'oficina')
    readonly_fields = ('valor_total',)
    ordering = ('-data_servico',)
    # autocomplete_fields = ['veiculo'] # Não necessário aqui, já está dentro do veículo

class CTeDocumentoTransportadoInline(admin.TabularInline):
    """ Mostra documentos transportados na página do CT-e (apenas leitura). """
    model = CTeDocumentoTransportado
    extra = 0
    fields = ('tipo_documento', 'chave_nfe', 'numero_nf', 'valor_total_nf', 'peso_total_kg_nf')
    readonly_fields = fields # Todos somente leitura
    can_delete = False
    verbose_name = "Documento Transportado"
    verbose_name_plural = "Documentos Transportados"

    def has_add_permission(self, request, obj=None):
        return False

class MDFeDocumentosVinculadosInline(admin.TabularInline):
    """ Mostra documentos vinculados na página do MDF-e (apenas leitura). """
    model = MDFeDocumentosVinculados
    extra = 0
    fields = ('municipio_descarga_link', 'chave_documento', 'cte_relacionado_link', 'tipo_doc')
    readonly_fields = ('municipio_descarga_link', 'chave_documento', 'cte_relacionado_link', 'tipo_doc')
    can_delete = False
    verbose_name = "Documento Vinculado"
    verbose_name_plural = "Documentos Vinculados por Município"
    # autocomplete_fields = ['municipio_descarga'] # Requer search_fields em MDFeMunicipioDescargaAdmin

    @admin.display(description='Município Descarga')
    def municipio_descarga_link(self, obj):
        if obj.municipio_descarga:
            # Corrigido: usar nome correto do app e modelo
            link = reverse("admin:transport_mdfemunicipiodescarga_change", args=[obj.municipio_descarga.pk])
            return format_html('<a href="{}" target="_blank">{} ({})</a>', link, obj.municipio_descarga.x_mun_descarga, obj.municipio_descarga.c_mun_descarga)
        return "-"
    municipio_descarga_link.admin_order_field = 'municipio_descarga__x_mun_descarga'

    @admin.display(description='CT-e Relacionado')
    def cte_relacionado_link(self, obj):
        if obj.cte_relacionado:
            # Corrigido: usar nome correto do app e modelo
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte_relacionado.pk])
            return format_html('<a href="{}" target="_blank">{}</a>', link, obj.cte_relacionado.chave)
        return "-"
    cte_relacionado_link.admin_order_field = 'cte_relacionado__chave'

    @admin.display(description='Tipo Doc.')
    def tipo_doc(self, obj):
        # Copia a lógica do serializer para identificar tipo pela chave
        try:
            modelo = obj.chave_documento[20:22]
            if modelo == '57': return 'CT-e'
            if modelo == '55': return 'NF-e'
            if modelo == '67': return 'CT-e OS'
        except: pass
        return 'Outro'

    def has_add_permission(self, request, obj=None):
        return False


# ===================================
# === ModelAdmin para Veículos ===
# ===================================

@admin.register(Veiculo)
class VeiculoAdmin(admin.ModelAdmin):
    """ Configuração do Admin para Veículos. """
    list_display = ('placa', 'proprietario_nome', 'tipo_proprietario_display', 'rntrc_proprietario', 'ativo', 'atualizado_em')
    list_filter = ('ativo', 'uf_proprietario', 'tipo_proprietario')
    search_fields = ('placa', 'renavam', 'proprietario_nome', 'proprietario_cnpj', 'proprietario_cpf')
    readonly_fields = ('criado_em', 'atualizado_em')
    fieldsets = (
        ('Identificação', {'fields': ('placa', 'renavam', 'ativo')}),
        ('Capacidades', {'fields': ('tara', 'capacidade_kg', 'capacidade_m3')}),
        ('Proprietário', {'fields': ('tipo_proprietario', 'proprietario_nome', 'proprietario_cnpj', 'proprietario_cpf', 'rntrc_proprietario', 'uf_proprietario')}),
        ('Datas', {'fields': ('criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )
    inlines = [ManutencaoVeiculoInline]

    @admin.display(description='Tipo Proprietário')
    def tipo_proprietario_display(self, obj):
        # Mapeia código para descrição (adapte os códigos se necessário)
        tipos = {'00': 'Próprio', '01': 'Arrendado', '02': 'Agregado'}
        return tipos.get(obj.tipo_proprietario, obj.tipo_proprietario)


@admin.register(ManutencaoVeiculo)
class ManutencaoVeiculoAdmin(admin.ModelAdmin):
    """ Configuração do Admin para Manutenções de Veículos. """
    list_display = ('veiculo_link', 'data_servico', 'servico_realizado', 'quilometragem', 'valor_total', 'status', 'oficina')
    list_filter = ('status', 'data_servico', 'veiculo')
    search_fields = ('servico_realizado', 'oficina', 'observacoes', 'nota_fiscal', 'veiculo__placa')
    readonly_fields = ('valor_total', 'criado_em', 'atualizado_em')
    autocomplete_fields = ['veiculo']
    date_hierarchy = 'data_servico'
    list_select_related = ('veiculo',) # Otimiza a busca do veículo para list_display

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

# =============================
# === ModelAdmin para CT-e ===
# =============================

@admin.register(CTeDocumento)
class CTeDocumentoAdmin(admin.ModelAdmin):
    list_display = ('chave', 'numero_cte', 'serie_cte', 'modalidade', 'data_emissao_cte', 'remetente_nome', 'destinatario_nome', 'valor_prestacao', 'processado', 'status_geral')
    list_filter = ('processado', 'modalidade', 'identificacao__ambiente', 'identificacao__tipo_cte', ('identificacao__data_emissao', admin.DateFieldListFilter))
    search_fields = ('chave', 'identificacao__numero', 'remetente__razao_social', 'destinatario__razao_social', 'emitente__razao_social')
    readonly_fields = (
        'id', 'chave', 'versao', 'data_upload', 'processado', 'modalidade', 'xml_original_preview',
        'status_protocolo_display', 'status_cancelamento_display', 'link_identificacao', 'link_emitente',
        'link_remetente', 'link_destinatario', 'link_prestacao', 'link_protocolo', 'link_cancelamento'
    )
    date_hierarchy = 'identificacao__data_emissao'
    inlines = [CTeDocumentoTransportadoInline]
    list_select_related = ('identificacao', 'remetente', 'destinatario', 'prestacao', 'protocolo', 'cancelamento') # Otimiza queries da list_display

    fieldsets = (
        ('Documento', {'fields': ('id', 'chave', 'versao', 'modalidade', 'processado', 'data_upload', 'arquivo_xml', 'xml_original_preview')}),
        ('Status', {'fields': ('status_protocolo_display', 'status_cancelamento_display')}),
        ('Links Rápidos (Somente Leitura)', {
            'fields': ('link_identificacao', 'link_emitente', 'link_remetente', 'link_destinatario', 'link_prestacao', 'link_protocolo', 'link_cancelamento'),
            'classes': ('collapse',)
        }),
    )

    # Funções de display (métodos)
    @admin.display(description='XML (Preview)', ordering='xml_original')
    def xml_original_preview(self, obj):
        if obj.xml_original:
            # Adiciona quebra de linha e escapa HTML para segurança
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

    @admin.display(description='Status Protocolo', ordering='protocolo__codigo_status')
    def status_protocolo_display(self, obj):
         if hasattr(obj, 'protocolo') and obj.protocolo:
             return f"{obj.protocolo.codigo_status or '?'} - {obj.protocolo.motivo_status or '?'}"
         return "Pendente"

    @admin.display(description='Cancelado', boolean=True)
    def status_cancelamento_display(self, obj):
        # Retorna True se o cancelamento existe e foi homologado (status 135)
        return hasattr(obj, 'cancelamento') and obj.cancelamento is not None and obj.cancelamento.c_stat == 135

    @admin.display(description='Status Geral')
    def status_geral(self, obj):
        if hasattr(obj, 'cancelamento') and obj.cancelamento:
            if obj.cancelamento.c_stat == 135:
                 return format_html('<span style="color: white; background-color: red; padding: 2px 5px; border-radius: 3px; font-weight: bold;">CANCELADO</span>')
            else:
                 # Pode indicar outras situações de cancelamento pendente ou com erro
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


# ==============================
# === ModelAdmin para MDF-e ===
# ==============================

@admin.register(MDFeDocumento)
class MDFeDocumentoAdmin(admin.ModelAdmin):
    list_display = ('chave', 'numero_mdfe', 'serie_mdfe', 'data_emissao_mdfe', 'uf_inicio', 'uf_fim', 'placa_tracao', 'processado', 'status_geral')
    list_filter = ('processado', 'identificacao__tp_amb', 'identificacao__modal', ('identificacao__dh_emi', admin.DateFieldListFilter))
    search_fields = ('chave', 'identificacao__n_mdf', 'emitente__razao_social', 'modal_rodoviario__veiculo_tracao__placa')
    readonly_fields = (
        'id', 'chave', 'versao', 'data_upload', 'processado', 'xml_original_preview',
        'status_protocolo_display', 'status_cancelamento_display', 'status_encerramento_display',
        'link_identificacao', 'link_emitente', 'link_modal', 'link_totais', 'link_protocolo', 'link_cancelamento'
    )
    date_hierarchy = 'identificacao__dh_emi'
    inlines = [MDFeDocumentosVinculadosInline]
    list_select_related = ('identificacao', 'emitente', 'modal_rodoviario__veiculo_tracao', 'protocolo', 'cancelamento')

    fieldsets = (
        ('Documento', {'fields': ('id', 'chave', 'versao', 'processado', 'data_upload', 'arquivo_xml', 'xml_original_preview')}),
        ('Status', {'fields': ('status_protocolo_display', 'status_cancelamento_display', 'status_encerramento_display')}),
        ('Links Rápidos', {'fields': ('link_identificacao', 'link_emitente', 'link_modal', 'link_totais', 'link_protocolo', 'link_cancelamento'), 'classes': ('collapse',)}),
        # Adicionar fieldset para dados de encerramento se existirem no modelo
        # ('Encerramento', {'fields': ('encerrado', 'data_encerramento', 'municipio_encerramento_cod', 'uf_encerramento', 'protocolo_encerramento'), 'classes': ('collapse',)})
    )

    # Funções de display (métodos)
    @admin.display(description='XML (Preview)', ordering='xml_original')
    def xml_original_preview(self, obj):
        # (Mesma implementação do CTeDocumentoAdmin)
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
        # Similar ao CTe, mas com nomes de modelo MDF-e
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
    def link_modal(self, obj): return self._create_related_link_mdfe(obj, 'modal_rodoviario', 'mdfemodalrodoviario', 'Ver Modal') # Ajuste se outros modais
    @admin.display(description='Totais')
    def link_totais(self, obj): return self._create_related_link_mdfe(obj, 'totais', 'mdfetotais', 'Ver Totais')
    @admin.display(description='Protocolo')
    def link_protocolo(self, obj): return self._create_related_link_mdfe(obj, 'protocolo', 'mdfeprotocoloautorizacao', 'Ver Protocolo')
    @admin.display(description='Cancelamento')
    def link_cancelamento(self, obj): return self._create_related_link_mdfe(obj, 'cancelamento', 'mdfecancelamento', 'Ver Cancelamento')

# =====================================================
# === ModelAdmin para Pagamentos e Parametrização ===
# =====================================================

@admin.register(FaixaKM)
class FaixaKMAdmin(admin.ModelAdmin):
    list_display = ('min_km', 'max_km', 'valor_pago')
    ordering = ('min_km',)

@admin.register(PagamentoAgregado)
class PagamentoAgregadoAdmin(admin.ModelAdmin):
    list_display = ('cte_link', 'condutor_nome', 'placa', 'valor_frete_total', 'percentual_repasse', 'valor_repassado', 'status', 'data_prevista', 'data_pagamento', 'obs')
    list_filter = ('status', 'data_prevista', 'data_pagamento', 'placa')
    search_fields = ('condutor_nome', 'condutor_cpf', 'placa', 'cte__chave', 'cte__identificacao__numero')
    readonly_fields = ('valor_repassado', 'criado_em', 'atualizado_em', 'cte_link')
    autocomplete_fields = ['cte']
    list_editable = ('status', 'data_pagamento', 'obs') # Permite editar direto na lista
    date_hierarchy = 'data_prevista'
    list_select_related = ('cte', 'cte__identificacao')

    @admin.display(description='CT-e', ordering='cte__chave')
    def cte_link(self, obj):
        if obj.cte:
            link = reverse("admin:transport_ctedocumento_change", args=[obj.cte.pk])
            num = obj.cte.identificacao.numero if hasattr(obj.cte, 'identificacao') else '?'
            return format_html('<a href="{}">{} (Nº {})</a>', link, obj.cte.chave, num)
        return "-"

    fieldsets = (
        ('Referência', {'fields': ('cte_link',)}),
        ('Condutor/Veículo', {'fields': ('placa', 'condutor_nome', 'condutor_cpf')}),
        ('Valores', {'fields': ('valor_frete_total', 'percentual_repasse', 'valor_repassado')}),
        ('Pagamento', {'fields': ('status', 'data_prevista', 'data_pagamento')}),
        ('Outros', {'fields': ('obs', 'criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )


@admin.register(PagamentoProprio)
class PagamentoProprioAdmin(admin.ModelAdmin):
    list_display = ('veiculo_link', 'periodo', 'km_total_periodo', 'valor_base_faixa', 'ajustes', 'valor_total_pagar', 'status', 'data_pagamento', 'obs')
    list_filter = ('status', 'periodo', 'data_pagamento', 'veiculo')
    search_fields = ('veiculo__placa', 'periodo')
    readonly_fields = ('valor_total_pagar', 'criado_em', 'atualizado_em', 'veiculo_link')
    autocomplete_fields = ['veiculo']
    list_editable = ('status', 'data_pagamento', 'ajustes', 'obs') # Ajustes podem ser editáveis
    ordering = ('-periodo', 'veiculo__placa')
    list_select_related = ('veiculo',)

    @admin.display(description='Veículo', ordering='veiculo__placa')
    def veiculo_link(self, obj):
        link = reverse("admin:transport_veiculo_change", args=[obj.veiculo.pk])
        return format_html('<a href="{}">{}</a>', link, obj.veiculo.placa)

    fieldsets = (
        (None, {'fields': ('veiculo_link', 'periodo')}),
        ('Cálculo Base', {'fields': ('km_total_periodo', 'valor_base_faixa')}),
        ('Ajuste e Total', {'fields': ('ajustes', 'valor_total_pagar')}),
        ('Pagamento', {'fields': ('status', 'data_pagamento')}),
        ('Outros', {'fields': ('obs', 'criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )

# ==========================================================
# === Registro de Outros Modelos (para links funcionarem) ===
# ==========================================================

# Registra modelos relacionados que podem ser acessados via links diretos,
# mesmo que não tenham um ModelAdmin customizado extenso.

# CT-e relacionados (já existentes no seu admin original)
admin.site.register(CTeIdentificacao)
admin.site.register(CTeEmitente)
admin.site.register(CTeRemetente)
admin.site.register(CTEDestinatario)
admin.site.register(CTePrestacaoServico)
admin.site.register(CTeProtocoloAutorizacao)
admin.site.register(CTeCancelamento)
admin.site.register(CTeComplemento)
admin.site.register(CTeTributos)
admin.site.register(CTeCarga)
# ... adicione outros se links foram criados para eles

# MDF-e relacionados (já existentes no seu admin original)
admin.site.register(MDFeIdentificacao)
admin.site.register(MDFeEmitente)
admin.site.register(MDFeMunicipioDescarga) # Necessário para autocomplete e link no inline
admin.site.register(MDFeProtocoloAutorizacao)
admin.site.register(MDFeCancelamento)
admin.site.register(MDFeTotais)
admin.site.register(MDFeModalRodoviario)
# ... adicione outros se links foram criados para eles