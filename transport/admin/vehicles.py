from .common import *

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
