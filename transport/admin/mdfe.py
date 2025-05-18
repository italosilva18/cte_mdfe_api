from .common import *

# === ModelAdmin para MDF-e ===
# ==============================

@admin.register(MDFeDocumento)
class MDFeDocumentoAdmin(admin.ModelAdmin):
    list_display = ('chave', 'numero_mdfe', 'serie_mdfe', 'data_emissao_mdfe', 'uf_inicio', 'uf_fim', 'placa_tracao', 'total_documentos', 'processado', 'status_geral')
    list_filter = ('processado', 'encerrado', 'identificacao__tp_amb', 'identificacao__modal', ('identificacao__dh_emi', admin.DateFieldListFilter), StatusEncerramentoMDFeFilter)
    search_fields = ('chave', 'identificacao__n_mdf', 'emitente__razao_social', 'modal_rodoviario__veiculo_tracao__placa')
    readonly_fields = (
        'id', 'chave', 'versao', 'data_upload', 'processado', 'xml_original_preview',
        'status_protocolo_display', 'status_cancelamento_display', 'status_encerramento_display',
        'link_identificacao', 'link_emitente', 'link_modal', 'link_totais', 'link_protocolo', 'link_cancelamento', 'link_cancelamento_encerramento',
        'ctes_count', 'total_documentos'
    )
    date_hierarchy = 'identificacao__dh_emi'
    inlines = [MDFeDocumentosVinculadosInline, MDFeCondutorInline]
    list_select_related = ('identificacao', 'emitente', 'modal_rodoviario__veiculo_tracao', 'protocolo', 'cancelamento')
    actions = ['reprocessar_mdfes_selecionados', 'exportar_para_csv']

    fieldsets = (
        ('Documento', {'fields': ('id', 'chave', 'versao', 'processado', 'data_upload', 'arquivo_xml', 'xml_original_preview')}),
        ('Status', {'fields': ('status_protocolo_display', 'status_cancelamento_display', 'status_encerramento_display')}),
        ('Encerramento', {'fields': ('encerrado', 'data_encerramento', 'municipio_encerramento_cod', 'uf_encerramento', 'protocolo_encerramento')}),
        ('Resumo', {'fields': ('ctes_count', 'total_documentos')}),
        ('Links Rápidos', {'fields': ('link_identificacao', 'link_emitente', 'link_modal', 'link_totais', 'link_protocolo', 'link_cancelamento', 'link_cancelamento_encerramento'), 'classes': ('collapse',)}),
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
        return obj.encerrado

    @admin.display(description='Status Geral')
    def status_geral(self, obj):
        if hasattr(obj, 'cancelamento') and obj.cancelamento and obj.cancelamento.c_stat == 135:
            return format_html('<span style="color: white; background-color: red; padding: 2px 5px; border-radius: 3px; font-weight: bold;">CANCELADO</span>')
        # Adiciona verificação de encerramento ANTES de autorizado
        if obj.encerrado:
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
    @admin.display(description='Canc. Encerramento')
    def link_cancelamento_encerramento(self, obj): return self._create_related_link_mdfe(obj, 'cancelamento_encerramento', 'mdfecancelamentoencerramento', 'Ver Canc. Encerramento')

    @admin.action(description="Reprocessar MDF-es selecionados")
    def reprocessar_mdfes_selecionados(self, request, queryset):
        from ..services.parser_mdfe import parse_mdfe_completo
        
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
                "Encerrado" if mdfe.encerrado else (
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


# NOVO ADMIN: MDFeCancelamentoEncerramento - para gerenciar eventos de cancelamento de encerramento
@admin.register(MDFeCancelamentoEncerramento)
class MDFeCancelamentoEncerramentoAdmin(admin.ModelAdmin):
    """ModelAdmin para o cancelamento de encerramento de MDF-e"""
    list_display = ('mdfe_link', 'dh_evento', 'n_prot_cancelar', 'n_prot_retorno', 'status_cancelamento')
    search_fields = ('mdfe__chave', 'n_prot_cancelar', 'n_prot_retorno', 'x_just')
    readonly_fields = tuple(f.name for f in MDFeCancelamentoEncerramento._meta.get_fields() if f.name != 'id')
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
