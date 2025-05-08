# transport/serializers/payment_serializers.py

from rest_framework import serializers

# Importar modelos relevantes
from ..models import FaixaKM, PagamentoAgregado, PagamentoProprio, CTeDocumento # CTeDocumento para o link

# ===================================================
# === Serializers Pagamentos e Parametrização ===
# ===================================================

class FaixaKMSerializer(serializers.ModelSerializer):
    """ Serializer para o modelo FaixaKM. """
    class Meta:
        model = FaixaKM
        fields = '__all__' # Inclui todos os campos: id, min_km, max_km, valor_pago

    # Validações podem ser adicionadas aqui também, além da view
    def validate(self, data):
        min_km = data.get('min_km')
        max_km = data.get('max_km')

        if max_km is not None and min_km is not None and max_km <= min_km:
            raise serializers.ValidationError("O KM máximo deve ser maior que o KM mínimo.")

        # Validação de sobreposição (pode ser complexa aqui, melhor na view com acesso ao DB)
        # ...

        return data


class PagamentoAgregadoSerializer(serializers.ModelSerializer):
    """ Serializer para o modelo PagamentoAgregado. """
    # Campos somente leitura para exibir informações do CT-e relacionado
    cte_chave = serializers.CharField(source='cte.chave', read_only=True)
    cte_numero = serializers.IntegerField(source='cte.identificacao.numero', read_only=True, allow_null=True)
    cte_data_emissao = serializers.DateTimeField(source='cte.identificacao.data_emissao', read_only=True, allow_null=True, format='%d/%m/%Y')

    class Meta:
        model = PagamentoAgregado
        # Lista os campos a serem incluídos
        fields = [
            'id', 'cte', 'cte_chave', 'cte_numero', 'cte_data_emissao', # Campos do CT-e
            'placa', 'condutor_cpf', 'condutor_nome',
            'valor_frete_total', 'percentual_repasse', 'valor_repassado', # Valor repassado é calculado
            'obs', 'status', 'data_prevista', 'data_pagamento',
            'criado_em', 'atualizado_em'
        ]
        # Campos que não podem ser definidos diretamente na criação/atualização
        # O valor_repassado é calculado automaticamente no método save do modelo.
        read_only_fields = ('valor_repassado', 'criado_em', 'atualizado_em', 'cte_chave', 'cte_numero', 'cte_data_emissao')
        # Configura o campo 'cte' para ser write_only (usado apenas na escrita, se aplicável)
        # e não obrigatório (geralmente é criado pela action 'gerar')
        extra_kwargs = {'cte': {'write_only': True, 'required': False}}

class PagamentoProprioSerializer(serializers.ModelSerializer):
    """ Serializer para o modelo PagamentoProprio. """
    # Campos somente leitura
    veiculo_placa = serializers.CharField(source='veiculo.placa', read_only=True)
    valor_total_pagar = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PagamentoProprio
        fields = [
            'id', 'veiculo', 'veiculo_placa', 'periodo', 'km_total_periodo',
            'valor_base_faixa', 'ajustes', 'valor_total_pagar', # Valor total é calculado
            'status', 'data_pagamento', 'obs',
            'criado_em', 'atualizado_em'
        ]
        # Campos calculados ou definidos internamente/pela view
        read_only_fields = (
            'valor_total_pagar', 'criado_em', 'atualizado_em', 'veiculo_placa',
            'km_total_periodo', 'valor_base_faixa' # Geralmente calculados na action 'gerar' ou 'calcular_km'
        )
        # Não exigir veiculo/periodo na criação/atualização via API direta, pois
        # a action 'gerar' é o método principal para criação em lote.
        extra_kwargs = {
            'veiculo': {'write_only': True, 'required': False},
            'periodo': {'required': False}
        }