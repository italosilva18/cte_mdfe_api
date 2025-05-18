from .common import *

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
        from ..services.parser_cte import parse_cte_completo
        
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
