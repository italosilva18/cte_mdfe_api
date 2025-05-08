# transport/serializers/vehicle_serializers.py

from rest_framework import serializers

# Importar modelos relevantes
from ..models import Veiculo, ManutencaoVeiculo

# ==============================================
# === Serializers Veículos e Manutenções ===
# ==============================================

class ManutencaoVeiculoSerializer(serializers.ModelSerializer):
    """ Serializer para o modelo ManutencaoVeiculo. """
    # Campo calculado para o valor total
    valor_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    # Campo para exibir a placa do veículo relacionado (apenas leitura)
    veiculo_placa = serializers.CharField(source='veiculo.placa', read_only=True)

    class Meta:
        model = ManutencaoVeiculo
        # Lista os campos a serem incluídos
        fields = [
            'id', 'veiculo', 'veiculo_placa', 'data_servico', 'servico_realizado',
            'oficina', 'quilometragem', 'peca_utilizada', 'valor_peca',
            'valor_mao_obra', 'valor_total', 'status', 'observacoes',
            'nota_fiscal', 'criado_em', 'atualizado_em'
        ]
        # Campos que não podem ser definidos diretamente na criação/atualização via API
        read_only_fields = ('valor_total', 'criado_em', 'atualizado_em', 'veiculo_placa')
        # Configura o campo 'veiculo' para ser write_only (usado apenas na escrita)
        # e não obrigatório na atualização (PATCH)
        extra_kwargs = {'veiculo': {'write_only': True, 'required': False}}


class VeiculoSerializer(serializers.ModelSerializer):
    """ Serializer para o modelo Veiculo. """
    # Poderíamos adicionar campos calculados ou relacionados aqui se necessário
    # Ex: total_gasto_manutencao = serializers.DecimalField(...)

    class Meta:
        model = Veiculo
        # Lista os campos a serem incluídos
        fields = [
            'id', 'placa', 'renavam', 'tara', 'capacidade_kg', 'capacidade_m3',
            'tipo_proprietario', 'proprietario_cnpj', 'proprietario_cpf',
            'proprietario_nome', 'rntrc_proprietario', 'uf_proprietario',
            'ativo', 'criado_em', 'atualizado_em'
            # 'manutencoes' # Poderia incluir inline se desejado, mas pode ser pesado
        ]
        # Campos de data/hora são apenas leitura
        read_only_fields = ('criado_em', 'atualizado_em')

# --- Serializers para Painel de Manutenção ---
# Estes não são ModelSerializers, pois formatam dados agregados da view

class ManutencaoIndicadoresSerializer(serializers.Serializer):
    """ Serializer para os indicadores gerais do painel de manutenção. """
    total_manutencoes = serializers.IntegerField(required=False)
    total_pecas = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    total_mao_obra = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    valor_total = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    filtros = serializers.DictField(required=False) # Para mostrar os filtros aplicados

class ManutencaoGraficosSerializer(serializers.Serializer):
    """ Serializer para os dados dos gráficos do painel de manutenção. """
    por_status = serializers.ListField(child=serializers.DictField(), required=False)
    por_veiculo = serializers.ListField(child=serializers.DictField(), required=False)
    por_periodo = serializers.ListField(child=serializers.DictField(), required=False)
    filtros = serializers.DictField(required=False) # Para mostrar os filtros aplicados