# transport/serializers/base_serializers.py

from rest_framework import serializers

# Importar modelos base necessários
from ..models import Endereco

# ========================
# === Serializers Base ===
# ========================

class EnderecoSerializer(serializers.ModelSerializer):
    """
    Serializer base para o modelo Endereco.
    Usado por herança em outros serializers de entidades (Emitente, Remetente, etc.).
    Exclui o campo 'id' do modelo base Endereco, pois as classes filhas
    terão seus próprios IDs ou chaves primárias.
    """
    class Meta:
        model = Endereco
        # Exclui apenas o ID do modelo Endereco base. Os campos herdados serão incluídos.
        exclude = ['id']
        # Ou, alternativamente, liste todos os campos que você quer incluir:
        # fields = [
        #     'logradouro', 'numero', 'complemento', 'bairro',
        #     'codigo_municipio', 'nome_municipio', 'cep', 'uf',
        #     'codigo_pais', 'nome_pais'
        # ]

# Adicione outros serializers base aqui, se necessário no futuro.
# Por exemplo, se você tivesse um serializer comum para dados de protocolo.