from .common import *

# === ModelAdmin para Configurações do Sistema ===
# =====================================================

@admin.register(ParametroSistema)
class ParametroSistemaAdmin(admin.ModelAdmin):
    """Admin para parâmetros do sistema."""
    list_display = ('nome', 'valor', 'grupo', 'tipo_dado', 'editavel', 'atualizado_em')
    list_filter = ('grupo', 'tipo_dado', 'editavel')
    search_fields = ('nome', 'descricao', 'valor')
    readonly_fields = ('criado_em', 'atualizado_em')
    fieldsets = (
        (None, {'fields': ('nome', 'descricao')}),
        ('Configuração', {'fields': ('valor', 'grupo', 'tipo_dado', 'editavel')}),
        ('Datas', {'fields': ('criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )
    ordering = ('grupo', 'nome')
    list_editable = ('valor', 'editavel')
    
    def has_delete_permission(self, request, obj=None):
        # Parâmetros críticos não devem ser excluídos
        if obj and obj.grupo in ('GERAL', 'EMAIL', 'BACKUP'):
            return False
        return super().has_delete_permission(request, obj)
    
    def get_readonly_fields(self, request, obj=None):
        # Parâmetros do sistema criados não devem ter o nome alterado
        readonly_fields = list(self.readonly_fields)
        if obj:  # Se estiver editando (não criando)
            readonly_fields.append('nome')
            readonly_fields.append('tipo_dado')  # Tipo de dado não deve mudar
        return readonly_fields


@admin.register(ConfiguracaoEmpresa)
class ConfiguracaoEmpresaAdmin(admin.ModelAdmin):
    """Admin para configuração da empresa."""
    list_display = ('razao_social', 'cnpj', 'email', 'telefone', 'atualizado_em')
    search_fields = ('razao_social', 'nome_fantasia', 'cnpj', 'email')
    readonly_fields = ('criado_em', 'atualizado_em')
    fieldsets = (
        ('Dados Principais', {'fields': ('razao_social', 'nome_fantasia', 'cnpj', 'ie', 'rntrc')}),
        ('Contato', {'fields': ('email', 'telefone')}),
        ('Endereço', {'fields': ('cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf')}),
        ('Visual', {'fields': ('logo',)}),
        ('Responsável Técnico', {'fields': ('responsavel_tecnico_cnpj', 'responsavel_tecnico_contato', 
                                          'responsavel_tecnico_email', 'responsavel_tecnico_fone')}),
        ('Certificado Digital', {'fields': ('certificado_digital',)}),
        ('Datas', {'fields': ('criado_em', 'atualizado_em'), 'classes': ('collapse',)}),
    )
    
    def has_add_permission(self, request):
        # Verificar se já existe uma configuração
        if ConfiguracaoEmpresa.objects.exists():
            return False
        return super().has_add_permission(request)
    
    def has_delete_permission(self, request, obj=None):
        # Não permitir excluir a configuração da empresa
        return False


@admin.register(RegistroBackup)
class RegistroBackupAdmin(admin.ModelAdmin):
    """Admin para registros de backup."""
    list_display = ('nome_arquivo', 'data_hora', 'tamanho_formatado', 'status', 'usuario')
    list_filter = ('status', 'data_hora')
    search_fields = ('nome_arquivo', 'usuario', 'detalhes')
    readonly_fields = ('nome_arquivo', 'data_hora', 'tamanho_bytes', 'md5_hash', 
                      'localizacao', 'usuario', 'status', 'detalhes', 'tamanho_formatado')
    ordering = ('-data_hora',)
    
    def has_add_permission(self, request):
        # Não permitir criar backups manualmente pelo admin (use a API)
        return False
    
    def has_change_permission(self, request, obj=None):
        # Não permitir editar registros de backup
        return False
    
    def tamanho_formatado(self, obj):
        """Formata o tamanho do arquivo em KB, MB ou GB."""
        kb = 1024
        mb = kb * 1024
        gb = mb * 1024
        
        if obj.tamanho_bytes < kb:
            return f"{obj.tamanho_bytes} bytes"
        elif obj.tamanho_bytes < mb:
            return f"{obj.tamanho_bytes / kb:.2f} KB"
        elif obj.tamanho_bytes < gb:
            return f"{obj.tamanho_bytes / mb:.2f} MB"
        else:
            return f"{obj.tamanho_bytes / gb:.2f} GB"
    tamanho_formatado.short_description = "Tamanho"


