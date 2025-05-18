from .common import *

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


# =====================================================
