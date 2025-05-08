# transport/serializers/config_serializers.py

from rest_framework import serializers

# Importar modelos relevantes
from ..models import ParametroSistema, ConfiguracaoEmpresa, RegistroBackup

# =====================================================
# === Serializadores para Configurações do Sistema ===
# =====================================================

class ParametroSistemaSerializer(serializers.ModelSerializer):
    """Serializer para o modelo de parâmetros do sistema."""
    # Campo calculado que retorna o valor convertido para o tipo correto
    valor_tipado = serializers.SerializerMethodField()

    class Meta:
        model = ParametroSistema
        # Inclui todos os campos do modelo, incluindo o campo calculado
        fields = [
            'id', 'nome', 'descricao', 'valor', 'valor_tipado', 'grupo',
            'tipo_dado', 'editavel', 'criado_em', 'atualizado_em'
        ]
        # Define quais campos são apenas para leitura na API
        read_only_fields = ['id', 'valor_tipado', 'criado_em', 'atualizado_em']

    def get_valor_tipado(self, obj):
        """Método para calcular o valor do campo 'valor_tipado'."""
        return obj.get_valor_tipado()


class ConfiguracaoEmpresaSerializer(serializers.ModelSerializer):
    """Serializer para o modelo de configuração da empresa."""
    # Poderia adicionar validações específicas aqui se necessário
    # Ex: validar formato do CNPJ, IE, etc.

    class Meta:
        model = ConfiguracaoEmpresa
        # Inclui todos os campos do modelo
        fields = [
            'id', 'razao_social', 'nome_fantasia', 'cnpj', 'ie', 'rntrc',
            'email', 'telefone', 'cep', 'logradouro', 'numero', 'complemento',
            'bairro', 'municipio', 'uf', 'logo', 'certificado_digital',
            'responsavel_tecnico_cnpj', 'responsavel_tecnico_contato',
            'responsavel_tecnico_email', 'responsavel_tecnico_fone',
            'criado_em', 'atualizado_em'
        ]
        # Define quais campos são apenas para leitura
        read_only_fields = ['id', 'criado_em', 'atualizado_em']
        # Poderia usar extra_kwargs para marcar campos como required=True se desejado
        # extra_kwargs = {
        #     'razao_social': {'required': True},
        #     'cnpj': {'required': True},
        # }


class RegistroBackupSerializer(serializers.ModelSerializer):
    """Serializer para o modelo de registro de backups."""
    # Campo calculado para formatar o tamanho do arquivo
    tamanho_formatado = serializers.SerializerMethodField()

    class Meta:
        model = RegistroBackup
        # Inclui todos os campos do modelo, incluindo o campo calculado
        fields = [
            'id', 'data_hora', 'nome_arquivo', 'tamanho_bytes', 'tamanho_formatado',
            'md5_hash', 'localizacao', 'usuario', 'status', 'detalhes'
        ]
        # Todos os campos são apenas leitura, pois são gerenciados internamente
        read_only_fields = fields

    def get_tamanho_formatado(self, obj):
        """Método para calcular o valor do campo 'tamanho_formatado'."""
        bytes_size = obj.tamanho_bytes
        if bytes_size is None:
            return "N/A"

        kb = 1024
        mb = kb * 1024
        gb = mb * 1024

        if bytes_size < kb:
            return f"{bytes_size} bytes"
        elif bytes_size < mb:
            return f"{bytes_size / kb:.2f} KB"
        elif bytes_size < gb:
            return f"{bytes_size / mb:.2f} MB"
        else:
            return f"{bytes_size / gb:.2f} GB"

# Adicione aqui serializers para Relatórios se/quando forem implementados