# transport/serializers/dashboard_serializers.py

from rest_framework import serializers

# Importar serializers de outros módulos se forem aninhados aqui
from .payment_serializers import PagamentoAgregadoSerializer, PagamentoProprioSerializer
from ..models import AlertaSistema

# =====================================================
# === Serializadores para Dashboards/Painéis ===
# =====================================================

class DashboardGeralDataSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela DashboardGeralAPIView.
    Valida a estrutura do dicionário de resposta.
    """
    # Dicionários simples para filtros e cards
    filtros = serializers.DictField(required=False, help_text="Filtros aplicados à consulta.")
    cards = serializers.DictField(required=False, help_text="Valores principais exibidos em cards.")
    # Listas de dicionários para dados de gráficos
    grafico_cif_fob = serializers.ListField(child=serializers.DictField(), required=False, help_text="Dados para gráfico de evolução CIF/FOB.")
    grafico_metas = serializers.ListField(child=serializers.DictField(), required=False, help_text="Dados para gráfico de metas.")
    # Dicionário contendo listas para últimos lançamentos
    ultimos_lancamentos = serializers.DictField(required=False, help_text="Listas dos últimos CT-es e MDF-es.")

class FinanceiroPainelSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela FinanceiroPainelAPIView.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cif_fob = serializers.ListField(child=serializers.DictField(), required=False)

class FinanceiroMensalSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela FinanceiroMensalAPIView.
    Define os campos esperados para cada mês.
    """
    mes = serializers.CharField(required=True, help_text="Mês/Ano no formato AAAA-MM")
    faturamento = serializers.FloatField(required=False, default=0.0)
    cif = serializers.FloatField(required=False, default=0.0)
    fob = serializers.FloatField(required=False, default=0.0)
    entregas = serializers.IntegerField(required=False, default=0)

class FinanceiroDetalheSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela FinanceiroDetalheAPIView.
    Define os campos esperados para cada item agrupado (cliente, veículo, etc.).
    """
    id = serializers.CharField(required=False, allow_null=True, help_text="ID do item agrupado (CNPJ, Placa, Código Município)")
    label = serializers.CharField(required=True, help_text="Nome/Descrição do item agrupado")
    faturamento_total = serializers.FloatField(required=False, default=0.0)
    qtd_ctes = serializers.IntegerField(required=False, default=0)
    valor_medio = serializers.FloatField(required=False, default=0.0)

class CtePainelSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela CtePainelAPIView.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cliente = serializers.ListField(child=serializers.DictField(), required=False)
    grafico_distribuidor = serializers.ListField(child=serializers.DictField(), required=False)
    tabela_cliente = serializers.ListField(child=serializers.DictField(), required=False)

class MdfePainelSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela MdfePainelAPIView.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cte_mdfe = serializers.ListField(child=serializers.DictField(), required=False)
    top_veiculos = serializers.ListField(child=serializers.DictField(), required=False)
    tabela_mdfe_veiculo = serializers.ListField(child=serializers.DictField(), required=False)
    eficiencia = serializers.FloatField(required=False)

class GeograficoPainelSerializer(serializers.Serializer):
    """
    Serializer para a estrutura de dados retornada pela GeograficoPainelAPIView.
    """
    filtros = serializers.DictField(required=False)
    # Renomeado para corresponder à view
    rotas = serializers.ListField(child=serializers.DictField(), required=False, help_text="Dados para o mapa de rotas (fluxo entre UFs).")
    top_origens = serializers.ListField(child=serializers.DictField(), required=False, help_text="Top municípios de origem.")
    top_destinos = serializers.ListField(child=serializers.DictField(), required=False, help_text="Top municípios de destino.")
    rotas_frequentes = serializers.ListField(child=serializers.DictField(), required=False, help_text="Lista detalhada das rotas mais frequentes.")


# =====================================================
# === Serializadores para Alertas ===
# =====================================================

class AlertaPagamentoSerializer(serializers.Serializer):
    """
    Serializer para retornar alertas de pagamentos pendentes.
    Usado pela AlertasPagamentoAPIView. Aninha os serializers de pagamento.
    """
    # Usa os serializers de pagamento importados para representar as listas
    agregados_pendentes = PagamentoAgregadoSerializer(many=True, required=False, read_only=True)
    proprios_pendentes = PagamentoProprioSerializer(many=True, required=False, read_only=True)
    # Campo informativo sobre o filtro de dias aplicado
    dias_alerta = serializers.IntegerField(required=False, read_only=True)


class AlertaSistemaSerializer(serializers.ModelSerializer):
    """Serializer para o modelo AlertaSistema."""

    class Meta:
        model = AlertaSistema
        fields = [
            'id', 'prioridade', 'data_hora', 'tipo', 'mensagem',
            'dados_adicionais', 'modulo', 'usuario', 'referencia'
        ]
