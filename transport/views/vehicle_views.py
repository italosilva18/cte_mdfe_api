# transport/views/vehicle_views.py

# Imports padrão
from datetime import datetime, timedelta
from decimal import Decimal

# Imports Django
from django.http import HttpResponse
from django.db.models import Q, Sum, Count
from django.db.models.functions import Coalesce, TruncMonth, TruncDate # TruncDate usado implicitamente por TruncMonth
from django.utils import timezone
from django.shortcuts import get_object_or_404 # Usado internamente

# Imports Django REST Framework
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

# Imports Locais
from ..serializers.vehicle_serializers import ( # Use .. para voltar um nível
    VeiculoSerializer,
    ManutencaoVeiculoSerializer
)
from ..models import ( # Modelos usados pelos ViewSets
    Veiculo,
    ManutencaoVeiculo,
    CTeDocumento, # Usado em VeiculoViewSet.estatisticas
    MDFeDocumento # Usado em VeiculoViewSet.estatisticas
)
# Importar FaixaKM se a lógica de pagamento for integrada aqui no futuro
# from ..models import FaixaKM
from ..utils import csv_response


# ===============================================================
# ==> APIS PARA VEÍCULOS E MANUTENÇÕES
# ===============================================================

class VeiculoViewSet(viewsets.ModelViewSet):
    """API para CRUD de Veículos."""
    queryset = Veiculo.objects.all().order_by('placa')
    serializer_class = VeiculoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Permite filtrar veículos por diversos parâmetros."""
        queryset = super().get_queryset()
        params = self.request.query_params

        # Filtro por ativo/inativo
        ativo = params.get('ativo')
        if ativo is not None:
            queryset = queryset.filter(ativo=ativo.lower() == 'true')

        # Filtro por tipo de proprietário
        tipo_proprietario = params.get('tipo_proprietario')
        if tipo_proprietario:
            queryset = queryset.filter(tipo_proprietario=tipo_proprietario)

        # Filtro por UF do proprietário
        uf = params.get('uf')
        if uf:
            queryset = queryset.filter(uf_proprietario=uf)

        # Filtro por texto (placa, renavam, nome/CNPJ/CPF/RNTRC proprietário)
        texto = params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(placa__icontains=texto) |
                Q(renavam__icontains=texto) |
                Q(proprietario_nome__icontains=texto) |
                Q(proprietario_cnpj__icontains=texto) |
                Q(proprietario_cpf__icontains=texto) |
                Q(rntrc_proprietario__icontains=texto)
            )

        return queryset.distinct() # Adiciona distinct para evitar duplicatas com filtros Q

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os veículos filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"veiculos_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return csv_response(queryset, self.get_serializer_class(), filename)

    @action(detail=True, methods=['get'])
    def estatisticas(self, request, pk=None):
        """Endpoint para obter estatísticas do veículo."""
        veiculo = self.get_object()

        # Calcular estatísticas de manutenção
        manutencoes = veiculo.manutencoes.all() # Acessa via related_name
        total_manutencoes = manutencoes.count()

        # Soma de gastos
        total_pecas = manutencoes.aggregate(t=Sum('valor_peca'))['t'] or Decimal('0.00')
        total_mao_obra = manutencoes.aggregate(t=Sum('valor_mao_obra'))['t'] or Decimal('0.00')
        total_gastos = manutencoes.aggregate(t=Sum('valor_total'))['t'] or Decimal('0.00')

        # Estatísticas por status
        stats_por_status = list(manutencoes.values('status').annotate(
            total=Count('id'),
            valor=Sum('valor_total')
        ).order_by('status')) # Ordena para consistência

        # Vincular com documentos (CT-e e MDF-e válidos)
        total_ctes = CTeDocumento.objects.filter(
            modal_rodoviario__veiculos__placa=veiculo.placa, # Filtra pelo relacionamento
            protocolo__codigo_status=100 # Apenas autorizados
        ).exclude(cancelamento__c_stat=135).count() # Exclui cancelados

        total_mdfes = MDFeDocumento.objects.filter(
            Q(modal_rodoviario__veiculo_tracao__placa=veiculo.placa) |
            Q(modal_rodoviario__veiculos_reboque__placa=veiculo.placa), # Checa tração e reboque
            protocolo__codigo_status=100 # Apenas autorizados
        ).exclude(cancelamento__c_stat=135).distinct().count() # Exclui cancelados e garante contagem única

        return Response({
            'veiculo': {
                'placa': veiculo.placa,
                'proprietario': veiculo.proprietario_nome,
                'tipo': veiculo.get_tipo_proprietario_display(), # Usa display name se definido no modelo
                'ativo': veiculo.ativo
            },
            'manutencoes': {
                'total': total_manutencoes,
                'valor_pecas': float(total_pecas),
                'valor_mao_obra': float(total_mao_obra),
                'valor_total': float(total_gastos),
                'por_status': stats_por_status
            },
            'documentos': {
                'total_ctes_validos': total_ctes,
                'total_mdfes_validos': total_mdfes,
            }
        })


class ManutencaoVeiculoViewSet(viewsets.ModelViewSet):
    """API para CRUD de Manutenções de Veículos."""
    queryset = ManutencaoVeiculo.objects.all().order_by('-data_servico')
    serializer_class = ManutencaoVeiculoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Permite filtrar manutenções por diversos parâmetros."""
        queryset = super().get_queryset()
        params = self.request.query_params

        # Se for uma nested route (ex: /veiculos/{veiculo_pk}/manutencoes/),
        # filtra automaticamente pelo 'veiculo_pk' da URL.
        veiculo_pk = self.kwargs.get('veiculo_pk')
        if veiculo_pk:
            queryset = queryset.filter(veiculo_id=veiculo_pk)

        # Filtro explícito por ID do veículo (parâmetro ?veiculo=...)
        veiculo_id = params.get('veiculo')
        if veiculo_id:
            queryset = queryset.filter(veiculo_id=veiculo_id)

        # Filtro por placa do veículo (parâmetro ?placa=...)
        placa = params.get('placa')
        if placa:
            queryset = queryset.filter(veiculo__placa=placa)

        # Filtro por status
        status_filter = params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filtro por período
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(data_servico__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_servico__lte=data_fim)

        # Filtro por texto (serviço, oficina, etc.)
        texto = params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(servico_realizado__icontains=texto) |
                Q(oficina__icontains=texto) |
                Q(observacoes__icontains=texto) |
                Q(nota_fiscal__icontains=texto)
            )

        return queryset

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta as manutenções filtradas para CSV."""
        queryset = self.get_queryset()
        filename = f"manutencoes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return csv_response(queryset, self.get_serializer_class(), filename)


class ManutencaoPainelViewSet(viewsets.ViewSet):
    """ViewSet para o painel de indicadores de manutenção."""
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def indicadores(self, request):
        """Retorna indicadores gerais de manutenção."""
        params = request.query_params
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')

        # Query base
        queryset = ManutencaoVeiculo.objects.all()

        # Aplicar filtros de data
        if data_inicio:
            queryset = queryset.filter(data_servico__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_servico__lte=data_fim)

        # Calcular indicadores
        total_manutencoes = queryset.count()
        # Usar Coalesce para garantir Decimal('0.00') se não houver registros
        total_pecas = queryset.aggregate(t=Coalesce(Sum('valor_peca'), Decimal('0.00')))['t']
        total_mao_obra = queryset.aggregate(t=Coalesce(Sum('valor_mao_obra'), Decimal('0.00')))['t']
        total_geral = queryset.aggregate(t=Coalesce(Sum('valor_total'), Decimal('0.00')))['t']

        return Response({
            'total_manutencoes': total_manutencoes,
            'total_pecas': float(total_pecas),
            'total_mao_obra': float(total_mao_obra),
            'valor_total': float(total_geral),
            'filtros': {
                'data_inicio': data_inicio,
                'data_fim': data_fim
            }
        })

    @action(detail=False, methods=['get'])
    def graficos(self, request):
        """Retorna dados para gráficos de manutenção."""
        params = request.query_params
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')

        # Query base
        queryset = ManutencaoVeiculo.objects.all()

        # Aplicar filtros de data
        if data_inicio:
            queryset = queryset.filter(data_servico__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_servico__lte=data_fim)

        # Dados por status
        por_status = list(queryset.values('status').annotate(
            total=Count('id'),
            valor=Sum('valor_total')
        ).order_by('status'))

        # Dados por veículo (top 10 por valor)
        por_veiculo = list(queryset.values('veiculo__placa').annotate(
            total=Count('id'),
            valor=Coalesce(Sum('valor_total'), Decimal('0.00')) # Garante que valor não seja None
        ).order_by('-valor')[:10])

        # Dados por período (mês)
        por_periodo = list(queryset.annotate(
            mes=TruncMonth('data_servico') # Agrupa por mês
        ).values('mes').annotate(
            total=Count('id'),
            valor=Coalesce(Sum('valor_total'), Decimal('0.00'))
        ).order_by('mes'))

        # Formatar dados para o frontend
        for item in por_veiculo:
             item['valor'] = float(item['valor']) # Converte Decimal para float
        for item in por_periodo:
             item['valor'] = float(item['valor'])
             if item['mes']:
                 item['mes_formatado'] = item['mes'].strftime('%m/%Y')
                 item['mes'] = item['mes'].strftime('%Y-%m-01') # Formato ISO para JS
             else:
                  item['mes_formatado'] = 'Data Inválida'
                  item['mes'] = None


        return Response({
            'por_status': por_status,
            'por_veiculo': por_veiculo,
            'por_periodo': por_periodo,
            'filtros': {
                'data_inicio': data_inicio,
                'data_fim': data_fim
            }
        })

    @action(detail=False, methods=['get'])
    def ultimos(self, request):
        """Retorna as últimas manutenções registradas."""
        limit = int(request.query_params.get('limit', 10)) # Pega limite do query param ou usa 10

        # Últimas manutenções (considera um limite razoável)
        limit = max(1, min(limit, 50)) # Limita entre 1 e 50
        ultimos = ManutencaoVeiculo.objects.all().order_by('-data_servico')[:limit]
        serializer = ManutencaoVeiculoSerializer(ultimos, many=True)

        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def tendencias(self, request):
        """Retorna tendências de manutenção (comparação simples e frequência)."""
        meses = int(request.query_params.get('meses', 12)) # Período de análise (padrão 12 meses)
        meses = max(2, meses) # Garante pelo menos 2 meses para comparação
        hoje = timezone.now().date() # Usar timezone aware
        data_limite = hoje - timedelta(days=30 * meses)
        data_meio_periodo = hoje - timedelta(days=30 * meses / 2)

        # Cálculo de tendência simples (comparação período atual vs anterior)
        periodo_atual_qs = ManutencaoVeiculo.objects.filter(data_servico__gte=data_meio_periodo)
        periodo_anterior_qs = ManutencaoVeiculo.objects.filter(data_servico__gte=data_limite, data_servico__lt=data_meio_periodo)

        valor_atual = periodo_atual_qs.aggregate(t=Coalesce(Sum('valor_total'), Decimal('0.00')))['t']
        valor_anterior = periodo_anterior_qs.aggregate(t=Coalesce(Sum('valor_total'), Decimal('0.00')))['t']

        # Prevenção de divisão por zero
        variacao_percentual = 0.0
        if valor_anterior > 0:
            variacao_percentual = float((valor_atual / valor_anterior - 1) * 100)
        elif valor_atual > 0:
             variacao_percentual = 100.0 # Crescimento "infinito" se anterior era 0

        # Frequência de manutenção por veículo ativo no período
        frequencia_por_veiculo = []
        veiculos_ativos = Veiculo.objects.filter(ativo=True)

        for veiculo in veiculos_ativos:
            manutencoes_periodo = ManutencaoVeiculo.objects.filter(
                veiculo=veiculo,
                data_servico__gte=data_limite
            ).order_by('data_servico')

            qtd_manutencoes = manutencoes_periodo.count()
            intervalo_medio_dias = 0
            ultima_manutencao = None

            if qtd_manutencoes > 1:
                # Calcular média de dias entre manutenções
                datas = list(manutencoes_periodo.values_list('data_servico', flat=True))
                intervalos = []
                for i in range(1, len(datas)):
                    delta = (datas[i] - datas[i-1]).days
                    if delta > 0: # Evitar manutenções no mesmo dia
                        intervalos.append(delta)

                if intervalos:
                    intervalo_medio_dias = sum(intervalos) / len(intervalos)

                ultima_manutencao = datas[-1].strftime('%d/%m/%Y')

            elif qtd_manutencoes == 1:
                 ultima_manutencao = manutencoes_periodo.first().data_servico.strftime('%d/%m/%Y')


            if qtd_manutencoes > 0: # Só adiciona se houve manutenção no período
                 frequencia_por_veiculo.append({
                     'placa': veiculo.placa,
                     'qtd_manutencoes': qtd_manutencoes,
                     'intervalo_medio_dias': round(intervalo_medio_dias, 1),
                     'ultima_manutencao': ultima_manutencao,
                 })

        # Ordena por quem teve mais manutenções
        frequencia_por_veiculo.sort(key=lambda x: x['qtd_manutencoes'], reverse=True)

        return Response({
            'tendencia_valor': {
                'valor_atual': float(valor_atual),
                'valor_anterior': float(valor_anterior),
                'variacao_percentual': round(variacao_percentual, 2),
                 'periodo_meses': meses
            },
            'frequencia_por_veiculo': frequencia_por_veiculo[:20] # Limita aos top 20
        })