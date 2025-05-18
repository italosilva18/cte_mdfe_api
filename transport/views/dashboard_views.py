# transport/views/dashboard_views.py

# Imports padrão
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

# Imports Django
from django.db.models import Q, Sum, Count, Case, When, Value, CharField, DecimalField
from django.db.models.functions import Coalesce, TruncDate, TruncMonth
from django.shortcuts import get_object_or_404 # Pode ser necessário em futuras expansões

# Imports Django REST Framework
from rest_framework import viewsets, status  # Usado para retornos de erro, se necessário
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

# Imports Locais
from ..serializers.dashboard_serializers import (  # Use .. para voltar um nível
    DashboardGeralDataSerializer, FinanceiroPainelSerializer, FinanceiroMensalSerializer,
    FinanceiroDetalheSerializer, CtePainelSerializer, MdfePainelSerializer,
    GeograficoPainelSerializer, AlertaPagamentoSerializer, AlertaSistemaSerializer
)
from ..models import (  # Modelos usados para consultas nos painéis
    CTeDocumento, MDFeDocumento,
    CTeIdentificacao, CTePrestacaoServico, CTeRemetente, CTEDestinatario,
    CTeProtocoloAutorizacao, CTeCancelamento, CTeModalRodoviario, CTeVeiculoRodoviario,
    MDFeIdentificacao, MDFeProtocoloAutorizacao, MDFeCancelamento, MDFeModalRodoviario,
    MDFeVeiculoTracao, MDFeVeiculoReboque, MDFeDocumentosVinculados,
    PagamentoAgregado, PagamentoProprio, AlertaSistema,
    # Adicione outros modelos se forem usados nas queries dos painéis
)

# ===============================================================
# ==> APIS PARA DASHBOARDS e PAINÉIS
# ===============================================================

class DashboardGeralAPIView(APIView):
    """
    API para obter dados consolidados para o dashboard geral.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        """Retorna dados consolidados para o dashboard geral."""
        params = request.query_params
        periodo = params.get('periodo', 'mes')  # mes, trimestre, ano
        data_inicio_str = params.get('data_inicio')
        data_fim_str = params.get('data_fim')

        # Definir período padrão se não informado
        if not data_inicio_str or not data_fim_str:
            hoje = date.today()
            if periodo == 'mes':
                data_inicio = date(hoje.year, hoje.month, 1)
                data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1) if hoje.month != 12 else date(hoje.year, 12, 31)
            elif periodo == 'trimestre':
                trimestre = (hoje.month - 1) // 3
                data_inicio = date(hoje.year, trimestre * 3 + 1, 1)
                prox_trimestre_inicio = date(hoje.year, (trimestre + 1) * 3 + 1, 1) if trimestre < 3 else date(hoje.year + 1, 1, 1)
                data_fim = prox_trimestre_inicio - timedelta(days=1)
            else:  # ano
                data_inicio = date(hoje.year, 1, 1)
                data_fim = date(hoje.year, 12, 31)
        else:
            try:
                data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        # Ajusta data_fim para incluir o dia inteiro
        data_fim_query = data_fim + timedelta(days=1)

        # Construir filtros para consultas
        filtro_periodo_cte = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query)
        filtro_periodo_mdfe = Q(identificacao__dh_emi__date__gte=data_inicio, identificacao__dh_emi__date__lt=data_fim_query)
        filtro_cte_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)
        filtro_mdfe_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)

        # === Obter dados para cards ===
        ctes_validos_qs = CTeDocumento.objects.filter(filtro_periodo_cte & filtro_cte_valido)
        total_ctes = ctes_validos_qs.count()
        total_mdfes = MDFeDocumento.objects.filter(filtro_periodo_mdfe & filtro_mdfe_valido).count()

        agregados_frete = ctes_validos_qs.aggregate(
            total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')),
            cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal('0')),
            fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal('0'))
        )
        valor_total_fretes = agregados_frete['total']
        valor_cif = agregados_frete['cif']
        valor_fob = agregados_frete['fob']

        # === Dados para gráficos ===
        evolucao_mensal = []
        if periodo == 'mes': # Diário
             ctes_agrupados = ctes_validos_qs.annotate(
                 data=TruncDate('identificacao__data_emissao')
             ).values('data').annotate(
                 valor_cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal('0')),
                 valor_fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal('0'))
             ).order_by('data')
             for item in ctes_agrupados:
                 evolucao_mensal.append({
                     'data': item['data'].strftime('%d/%m/%Y'),
                     'cif': float(item['valor_cif']),
                     'fob': float(item['valor_fob']),
                     'total': float(item['valor_cif'] + item['valor_fob'])
                 })
        else: # Mensal (Trimestre ou Ano)
            ctes_agrupados = ctes_validos_qs.annotate(
                mes=TruncMonth('identificacao__data_emissao')
            ).values('mes').annotate(
                valor_cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal('0')),
                valor_fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal('0'))
            ).order_by('mes')
            for item in ctes_agrupados:
                if item['mes']: # Evitar erro se mes for None
                    evolucao_mensal.append({
                        'data': item['mes'].strftime('%m/%Y'),
                        'cif': float(item['valor_cif']),
                        'fob': float(item['valor_fob']),
                        'total': float(item['valor_cif'] + item['valor_fob'])
                    })

        # === Últimos Lançamentos ===
        ultimos_ctes = CTeDocumento.objects.filter(processado=True)\
            .select_related('identificacao', 'remetente', 'destinatario', 'prestacao')\
            .order_by('-identificacao__data_emissao')[:5]
        ultimos_mdfes = MDFeDocumento.objects.filter(processado=True)\
            .select_related('identificacao', 'modal_rodoviario__veiculo_tracao')\
            .order_by('-identificacao__dh_emi')[:5]

        # === Dados para metas (comparação com período anterior) ===
        try:
            delta = data_fim - data_inicio
            data_inicio_anterior = data_inicio - (delta + timedelta(days=1))
            data_fim_anterior = data_fim - (delta + timedelta(days=1))
        except TypeError: # Caso data_inicio ou data_fim sejam None inicialmente
            data_inicio_anterior = data_inicio - timedelta(days=30) # Exemplo fallback
            data_fim_anterior = data_fim - timedelta(days=30)

        data_fim_anterior_query = data_fim_anterior + timedelta(days=1)
        filtro_anterior_cte = Q(identificacao__data_emissao__date__gte=data_inicio_anterior, identificacao__data_emissao__date__lt=data_fim_anterior_query)

        valor_total_fretes_anterior = CTeDocumento.objects.filter(
            filtro_anterior_cte & filtro_cte_valido
        ).aggregate(total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')))['total']

        crescimento_percentual = 0.0
        if valor_total_fretes_anterior > 0:
            crescimento_percentual = float(((valor_total_fretes / valor_total_fretes_anterior) - 1) * 100)
        elif valor_total_fretes > 0:
            crescimento_percentual = 100.0

        # Compilar resposta final
        response_data = {
            'filtros': {
                'periodo': periodo,
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'cards': {
                'total_ctes': total_ctes,
                'total_mdfes': total_mdfes,
                'valor_total_fretes': float(valor_total_fretes),
                'valor_cif': float(valor_cif),
                'valor_fob': float(valor_fob)
            },
            'grafico_cif_fob': evolucao_mensal,
            'grafico_metas': [
                {
                    'label': f"Período {data_inicio.strftime('%d/%m/%Y')} a {data_fim.strftime('%d/%m/%Y')}",
                    'valor': float(valor_total_fretes),
                    'meta': float(valor_total_fretes * Decimal('1.1')), # Meta: 10% maior (exemplo)
                    'crescimento': round(crescimento_percentual, 2)
                }
            ],
            'ultimos_lancamentos': {
                'ctes': [{
                    'id': str(cte.id),
                    'chave': cte.chave,
                    'numero': getattr(cte.identificacao, 'numero', None),
                    'data_emissao': getattr(cte.identificacao, 'data_emissao', None).strftime('%d/%m/%Y %H:%M') if getattr(cte.identificacao, 'data_emissao', None) else None,
                    'remetente': getattr(cte.remetente, 'razao_social', None),
                    'destinatario': getattr(cte.destinatario, 'razao_social', None),
                    'valor': float(getattr(cte.prestacao, 'valor_total_prestado', 0)),
                    'modalidade': cte.modalidade
                } for cte in ultimos_ctes],
                'mdfes': [{
                    'id': str(mdfe.id),
                    'chave': mdfe.chave,
                    'numero': getattr(mdfe.identificacao, 'n_mdf', None),
                    'data_emissao': getattr(mdfe.identificacao, 'dh_emi', None).strftime('%d/%m/%Y %H:%M') if getattr(mdfe.identificacao, 'dh_emi', None) else None,
                    'uf_ini': getattr(mdfe.identificacao, 'uf_ini', None),
                    'uf_fim': getattr(mdfe.identificacao, 'uf_fim', None),
                    'placa': getattr(getattr(mdfe.modal_rodoviario, 'veiculo_tracao', None), 'placa', None)
                } for mdfe in ultimos_mdfes]
            }
        }

        serializer = DashboardGeralDataSerializer(response_data)
        return Response(serializer.data)


class FinanceiroPainelAPIView(APIView):
    """
    API para o painel financeiro. Mostra dados sobre faturamento, valores CIF/FOB, etc.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        periodo = params.get('periodo', 'ano')
        data_inicio_str = params.get('data_inicio')
        data_fim_str = params.get('data_fim')

        # Define período padrão (igual ao DashboardGeral)
        if not data_inicio_str or not data_fim_str:
            hoje = date.today()
            if periodo == 'mes':
                data_inicio = date(hoje.year, hoje.month, 1)
                data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1) if hoje.month != 12 else date(hoje.year, 12, 31)
            elif periodo == 'trimestre':
                trimestre = (hoje.month - 1) // 3
                data_inicio = date(hoje.year, trimestre * 3 + 1, 1)
                prox_trimestre_inicio = date(hoje.year, (trimestre + 1) * 3 + 1, 1) if trimestre < 3 else date(hoje.year + 1, 1, 1)
                data_fim = prox_trimestre_inicio - timedelta(days=1)
            else:  # ano
                data_inicio = date(hoje.year, 1, 1)
                data_fim = date(hoje.year, 12, 31)
        else:
            try:
                data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        # Ajusta data_fim para incluir o dia inteiro
        data_fim_query = data_fim + timedelta(days=1)

        # Filtros para consultas
        filtro_periodo_cte = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query)
        filtro_cte_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)

        # === Cards com indicadores ===
        ctes_validos_qs = CTeDocumento.objects.filter(filtro_periodo_cte & filtro_cte_valido)
        agregados = ctes_validos_qs.aggregate(
            total_faturamento=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')),
            total_ctes=Count('id'),
            valor_cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal('0')),
            valor_fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal('0'))
        )

        faturamento_total = agregados['total_faturamento']
        total_ctes = agregados['total_ctes']
        valor_cif = agregados['valor_cif']
        valor_fob = agregados['valor_fob']

        ticket_medio = faturamento_total / total_ctes if total_ctes > 0 else Decimal('0.00')
        percentual_cif = (valor_cif / faturamento_total * 100) if faturamento_total > 0 else 0
        percentual_fob = (valor_fob / faturamento_total * 100) if faturamento_total > 0 else 0

        # Faturamento mensal (considerando um período maior para gráfico de tendência, ex: último ano)
        ano_atras = data_inicio - timedelta(days=365) # Ajuste conforme necessário
        filtro_grafico_cte = Q(identificacao__data_emissao__date__gte=ano_atras, identificacao__data_emissao__date__lt=data_fim_query)

        faturamento_por_mes = CTeDocumento.objects.filter(
            filtro_grafico_cte & filtro_cte_valido
        ).annotate(
            mes=TruncMonth('identificacao__data_emissao')
        ).values('mes').annotate(
            faturamento=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')),
            cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal('0')),
            fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal('0')),
            entregas=Count('id')
        ).order_by('mes')

        # Formatar dados para o gráfico
        grafico_cif_fob = []
        for item in faturamento_por_mes:
             if item['mes']: # Evitar erro se mes for None
                grafico_cif_fob.append({
                    'mes': item['mes'].strftime('%m/%Y'),
                    'faturamento': float(item['faturamento']),
                    'cif': float(item['cif']),
                    'fob': float(item['fob']),
                    'entregas': item['entregas']
                })

        # Compilar resposta
        response_data = {
            'filtros': {
                'periodo': periodo,
                'data_inicio': data_inicio.isoformat(),
                'data_fim': data_fim.isoformat()
            },
            'cards': {
                'faturamento_total': float(faturamento_total),
                'total_ctes': total_ctes,
                'ticket_medio': float(ticket_medio),
                'valor_cif': float(valor_cif),
                'valor_fob': float(valor_fob),
                'percentual_cif': float(percentual_cif),
                'percentual_fob': float(percentual_fob)
            },
            'grafico_cif_fob': grafico_cif_fob
        }

        serializer = FinanceiroPainelSerializer(response_data)
        return Response(serializer.data)


class FinanceiroMensalAPIView(APIView):
    """
    API para obter dados financeiros mensais específicos (usado pelo gráfico financeiro).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Obter mês/ano específico ou período
        mes_param = request.query_params.get('mes') # Formato AAAA-MM
        data_inicio_str = request.query_params.get('data_inicio')
        data_fim_str = request.query_params.get('data_fim')

        if mes_param:
            try:
                data = datetime.strptime(mes_param, '%Y-%m')
                data_inicio = date(data.year, data.month, 1)
                data_fim = date(data.year, data.month + 1, 1) - timedelta(days=1) if data.month != 12 else date(data.year, 12, 31)
            except ValueError:
                return Response({"error": "Formato inválido para 'mes'. Use AAAA-MM"}, status=status.HTTP_400_BAD_REQUEST)
        elif data_inicio_str and data_fim_str:
             try:
                data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
             except ValueError:
                 return Response({"error": "Formato de data inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        else:
             # Default: último mês completo
             hoje = date.today()
             data_fim = date(hoje.year, hoje.month, 1) - timedelta(days=1)
             data_inicio = date(data_fim.year, data_fim.month, 1)


        # Filtro para CT-es no período, válidos
        data_fim_query = data_fim + timedelta(days=1)
        filtro_periodo_cte = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query)
        filtro_cte_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)

        ctes = CTeDocumento.objects.filter(filtro_periodo_cte & filtro_cte_valido)

        # Agrupa por mês
        faturamento_por_mes = ctes.annotate(
            mes_agg=TruncMonth('identificacao__data_emissao')
        ).values('mes_agg').annotate(
            faturamento=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')),
            cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal('0')),
            fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal('0')),
            entregas=Count('id')
        ).order_by('mes_agg')

        # Formatar dados
        resultados = []
        for item in faturamento_por_mes:
             if item['mes_agg']:
                resultados.append({
                    'mes': item['mes_agg'].strftime('%Y-%m'),
                    'faturamento': float(item['faturamento']),
                    'cif': float(item['cif']),
                    'fob': float(item['fob']),
                    'entregas': item['entregas']
                })

        return Response(resultados)


class FinanceiroDetalheAPIView(APIView):
    """
    API para obter detalhes financeiros por clientes, veículos, etc.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        tipo = params.get('group', 'cliente') # cliente, veiculo, origem, destino
        data_inicio_str = params.get('data_inicio')
        data_fim_str = params.get('data_fim')

        if not data_inicio_str or not data_fim_str:
            return Response({"error": "Parâmetros data_inicio e data_fim são obrigatórios"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
            data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({"error": "Formato de data inválido. Use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)

        data_fim_query = data_fim + timedelta(days=1)

        # Filtro base
        filtro_base = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query) & \
                      Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)

        ctes = CTeDocumento.objects.filter(filtro_base)
        resultados = []

        # Agrupamento dinâmico
        if tipo == 'cliente':
            # Agrupa por destinatário
            dados_agrupados = ctes.values(
                'destinatario__cnpj', 'destinatario__razao_social'
            ).annotate(
                faturamento_total=Sum('prestacao__valor_total_prestado'),
                qtd_ctes=Count('id')
            ).order_by('-faturamento_total')[:20] # Top 20

            for item in dados_agrupados:
                valor_medio = item['faturamento_total'] / item['qtd_ctes'] if item['qtd_ctes'] > 0 else 0
                resultados.append({
                    'id': item['destinatario__cnpj'] or '',
                    'label': item['destinatario__razao_social'] or 'Cliente não identificado',
                    'faturamento_total': float(item['faturamento_total'] or 0),
                    'qtd_ctes': item['qtd_ctes'] or 0,
                    'valor_medio': float(valor_medio)
                })

        elif tipo == 'veiculo':
             # Agrupa por placa do veículo (requer join)
             dados_agrupados = ctes.filter(
                 modal_rodoviario__veiculos__isnull=False # Garante que existe veículo
             ).values(
                 'modal_rodoviario__veiculos__placa'
             ).annotate(
                 faturamento_total=Sum('prestacao__valor_total_prestado'),
                 qtd_ctes=Count('id', distinct=True) # Conta CTes distintos para o veículo
             ).order_by('-faturamento_total')[:20]

             for item in dados_agrupados:
                 placa = item['modal_rodoviario__veiculos__placa']
                 if not placa: continue # Pula se placa for nula
                 valor_medio = item['faturamento_total'] / item['qtd_ctes'] if item['qtd_ctes'] > 0 else 0
                 resultados.append({
                     'id': placa,
                     'label': f"Veículo {placa}",
                     'faturamento_total': float(item['faturamento_total'] or 0),
                     'qtd_ctes': item['qtd_ctes'] or 0,
                     'valor_medio': float(valor_medio)
                 })

        elif tipo == 'origem':
            # Agrupa por município de origem
            dados_agrupados = ctes.values(
                'identificacao__codigo_mun_ini', 'identificacao__nome_mun_ini', 'identificacao__uf_ini'
            ).annotate(
                faturamento_total=Sum('prestacao__valor_total_prestado'),
                qtd_ctes=Count('id')
            ).order_by('-faturamento_total')[:20]

            for item in dados_agrupados:
                 valor_medio = item['faturamento_total'] / item['qtd_ctes'] if item['qtd_ctes'] > 0 else 0
                 resultados.append({
                     'id': item['identificacao__codigo_mun_ini'] or '',
                     'label': f"{item['identificacao__nome_mun_ini'] or 'Desconhecido'}/{item['identificacao__uf_ini'] or ''}",
                     'faturamento_total': float(item['faturamento_total'] or 0),
                     'qtd_ctes': item['qtd_ctes'] or 0,
                     'valor_medio': float(valor_medio)
                 })

        elif tipo == 'destino':
             # Agrupa por município de destino
             dados_agrupados = ctes.values(
                 'identificacao__codigo_mun_fim', 'identificacao__nome_mun_fim', 'identificacao__uf_fim'
             ).annotate(
                 faturamento_total=Sum('prestacao__valor_total_prestado'),
                 qtd_ctes=Count('id')
             ).order_by('-faturamento_total')[:20]

             for item in dados_agrupados:
                  valor_medio = item['faturamento_total'] / item['qtd_ctes'] if item['qtd_ctes'] > 0 else 0
                  resultados.append({
                      'id': item['identificacao__codigo_mun_fim'] or '',
                      'label': f"{item['identificacao__nome_mun_fim'] or 'Desconhecido'}/{item['identificacao__uf_fim'] or ''}",
                      'faturamento_total': float(item['faturamento_total'] or 0),
                      'qtd_ctes': item['qtd_ctes'] or 0,
                      'valor_medio': float(valor_medio)
                  })

        # Serializer não é estritamente necessário aqui, pois estamos construindo o dict manualmente
        # serializer = FinanceiroDetalheSerializer(resultados, many=True)
        return Response(resultados)


class CtePainelAPIView(APIView):
    """
    API para o painel de CT-e. Mostra dados sobre CT-es emitidos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        data_inicio_str = params.get('data_inicio')
        data_fim_str = params.get('data_fim')

        # Padrão: último mês
        if not data_inicio_str or not data_fim_str:
            hoje = date.today()
            data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1) if hoje.month != 12 else date(hoje.year, 12, 31)
            data_inicio = date(data_fim.year, data_fim.month, 1)
        else:
            try:
                data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Formato de data inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        data_fim_query = data_fim + timedelta(days=1)

        # Filtros para consultas
        filtro_periodo = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query)
        filtro_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)
        ctes_no_periodo = CTeDocumento.objects.filter(filtro_periodo)

        # === Card com totais ===
        ctes_validos_qs = ctes_no_periodo.filter(filtro_valido)
        total_ctes_validos = ctes_validos_qs.count()
        valor_total = ctes_validos_qs.aggregate(t=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0')))['t']

        total_autorizados = ctes_no_periodo.filter(protocolo__codigo_status=100, cancelamento__isnull=True).count()
        total_cancelados = ctes_no_periodo.filter(cancelamento__c_stat=135).count()
        total_rejeitados = ctes_no_periodo.filter(protocolo__isnull=False).exclude(protocolo__codigo_status=100).exclude(cancelamento__c_stat=135).count()

        # === Distribuição por cliente (destinatário) ===
        clientes = ctes_validos_qs.values(
            'destinatario__cnpj', 'destinatario__razao_social'
        ).annotate(
            qtd=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('-valor')[:10] # Top 10

        grafico_cliente = []
        for c in clientes:
            nome = c['destinatario__razao_social'] or 'Sem Razão Social'
            grafico_cliente.append({
                'label': f"{nome[:25]}{'...' if len(nome)>25 else ''}", # Truncar nome
                'valor': float(c['valor'] or 0),
                'qtd': c['qtd'] or 0
            })

        # === Distribuição por modalidade (CIF/FOB) ===
        distribuidor = ctes_validos_qs.values('modalidade').annotate(
            qtd=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('modalidade')

        grafico_distribuidor = []
        for d in distribuidor:
            modalidade = d['modalidade'] or 'Não Informado'
            grafico_distribuidor.append({
                'label': modalidade,
                'valor': float(d['valor'] or 0),
                'qtd': d['qtd'] or 0
            })

        # === Tabela com principais clientes (mais detalhada) ===
        tabela_cliente = []
        for c in clientes:
             ticket_medio = (c['valor'] / c['qtd']) if c['qtd'] else Decimal('0.00')
             cnpj = c['destinatario__cnpj'] or ''
             if len(cnpj) == 14: cnpj = f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"

             tabela_cliente.append({
                 'nome': c['destinatario__razao_social'] or 'Sem Razão Social',
                 'cnpj': cnpj,
                 'qtd': c['qtd'] or 0,
                 'valor': float(c['valor'] or 0),
                 'ticket_medio': float(ticket_medio)
             })

        # Compilar resposta
        response_data = {
            'filtros': {'data_inicio': data_inicio.isoformat(), 'data_fim': data_fim.isoformat()},
            'cards': {
                'total_ctes': total_ctes_validos,
                'valor_total': float(valor_total),
                'total_autorizados': total_autorizados,
                'total_cancelados': total_cancelados,
                'total_rejeitados': total_rejeitados
            },
            'grafico_cliente': grafico_cliente,
            'grafico_distribuidor': grafico_distribuidor,
            'tabela_cliente': tabela_cliente
        }

        serializer = CtePainelSerializer(response_data)
        return Response(serializer.data)


class MdfePainelAPIView(APIView):
    """
    API para o painel de MDF-e. Mostra dados sobre MDF-es emitidos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        data_inicio_str = params.get('data_inicio')
        data_fim_str = params.get('data_fim')

        # Padrão: último mês
        if not data_inicio_str or not data_fim_str:
             hoje = date.today()
             data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1) if hoje.month != 12 else date(hoje.year, 12, 31)
             data_inicio = date(data_fim.year, data_fim.month, 1)
        else:
             try:
                 data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                 data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
             except ValueError:
                 return Response({"error": "Formato de data inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        data_fim_query = data_fim + timedelta(days=1)

        # Filtros MDF-e
        filtro_periodo_mdfe = Q(identificacao__dh_emi__date__gte=data_inicio, identificacao__dh_emi__date__lt=data_fim_query)
        filtro_mdfe_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)
        mdfes_no_periodo = MDFeDocumento.objects.filter(filtro_periodo_mdfe)

        # Filtros CT-e (para eficiência)
        filtro_periodo_cte = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query)
        filtro_cte_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)

        # === Card com totais ===
        total_mdfes = mdfes_no_periodo.filter(filtro_mdfe_valido).count()
        total_autorizados = mdfes_no_periodo.filter(protocolo__codigo_status=100, cancelamento__isnull=True, encerrado=False).count()
        total_encerrados = mdfes_no_periodo.filter(protocolo__codigo_status=100, cancelamento__isnull=True, encerrado=True).count()
        total_cancelados = mdfes_no_periodo.filter(cancelamento__c_stat=135).count()

        # === Gráfico de relação CT-e por MDF-e ===
        mdfes_com_ctes = mdfes_no_periodo.filter(filtro_mdfe_valido).annotate(total_ctes=Count('docs_vinculados_mdfe'))
        cte_mdfe_distribuicao = {'0 CT-es': 0, '1 CT-e': 0, '2 a 5 CT-es': 0, '6 a 10 CT-es': 0, '11+ CT-es': 0}
        for mdfe in mdfes_com_ctes:
            qtd = mdfe.total_ctes
            if qtd == 0: cte_mdfe_distribuicao['0 CT-es'] += 1
            elif qtd == 1: cte_mdfe_distribuicao['1 CT-e'] += 1
            elif 2 <= qtd <= 5: cte_mdfe_distribuicao['2 a 5 CT-es'] += 1
            elif 6 <= qtd <= 10: cte_mdfe_distribuicao['6 a 10 CT-es'] += 1
            else: cte_mdfe_distribuicao['11+ CT-es'] += 1

        grafico_cte_mdfe = [{'categoria': cat, 'contagem': cont} for cat, cont in cte_mdfe_distribuicao.items()]

        # === Top veículos utilizados em MDF-es ===
        veiculos_tracao = mdfes_no_periodo.filter(
            filtro_mdfe_valido, modal_rodoviario__veiculo_tracao__isnull=False
        ).values('modal_rodoviario__veiculo_tracao__placa').annotate(total=Count('id')).order_by('-total')[:10]
        top_veiculos = [{'placa': v['modal_rodoviario__veiculo_tracao__placa'], 'total': v['total']} for v in veiculos_tracao if v['modal_rodoviario__veiculo_tracao__placa']]

        # === Tabela de MDF-es por veículo (Top 5) ===
        tabela_mdfe_veiculo = []
        for v in top_veiculos[:5]:
            placa = v['placa']
            mdfes_veiculo = mdfes_no_periodo.filter(filtro_mdfe_valido, modal_rodoviario__veiculo_tracao__placa=placa)
            total_mdfes_veiculo = mdfes_veiculo.count()
            total_docs = MDFeDocumentosVinculados.objects.filter(mdfe__in=mdfes_veiculo).count()
            encerrados = mdfes_veiculo.filter(encerrado=True).count()
            percentual_encerrados = (encerrados / total_mdfes_veiculo * 100) if total_mdfes_veiculo else 0

            tabela_mdfe_veiculo.append({
                'placa': placa, 'total_mdfes': total_mdfes_veiculo, 'total_documentos': total_docs,
                'media_docs': round(total_docs / total_mdfes_veiculo, 2) if total_mdfes_veiculo else 0,
                'encerrados': encerrados, 'percentual_encerrados': round(percentual_encerrados, 1)
            })

        # === Cálculo de eficiência (% de CT-es válidos que estão em MDF-es válidos) ===
        total_ctes_periodo = CTeDocumento.objects.filter(filtro_periodo_cte & filtro_cte_valido).count()
        total_ctes_em_mdfes = CTeDocumento.objects.filter(
            filtro_periodo_cte & filtro_cte_valido,
            mdfe_vinculado__in=mdfes_no_periodo.filter(filtro_mdfe_valido) # Verifica se está em um MDF-e válido do período
        ).distinct().count()
        eficiencia = (total_ctes_em_mdfes / total_ctes_periodo * 100) if total_ctes_periodo else 0

        # Compilar resposta
        response_data = {
            'filtros': {'data_inicio': data_inicio.isoformat(), 'data_fim': data_fim.isoformat()},
            'cards': {
                'total_mdfes': total_mdfes, 'total_autorizados': total_autorizados,
                'total_encerrados': total_encerrados, 'total_cancelados': total_cancelados,
                'total_ctes_periodo': total_ctes_periodo, 'total_ctes_em_mdfes': total_ctes_em_mdfes
            },
            'grafico_cte_mdfe': grafico_cte_mdfe,
            'top_veiculos': top_veiculos,
            'tabela_mdfe_veiculo': tabela_mdfe_veiculo,
            'eficiencia': round(eficiencia, 2)
        }

        serializer = MdfePainelSerializer(response_data)
        return Response(serializer.data)


class GeograficoPainelAPIView(APIView):
    """
    API para o painel geográfico. Mostra dados sobre origens e destinos.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        data_inicio_str = params.get('data_inicio')
        data_fim_str = params.get('data_fim')

        # Padrão: último mês
        if not data_inicio_str or not data_fim_str:
             hoje = date.today()
             data_fim = date(hoje.year, hoje.month + 1, 1) - timedelta(days=1) if hoje.month != 12 else date(hoje.year, 12, 31)
             data_inicio = date(data_fim.year, data_fim.month, 1)
        else:
             try:
                 data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d').date()
                 data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d').date()
             except ValueError:
                 return Response({"error": "Formato de data inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        data_fim_query = data_fim + timedelta(days=1)

        # Filtros
        filtro_periodo = Q(identificacao__data_emissao__date__gte=data_inicio, identificacao__data_emissao__date__lt=data_fim_query)
        filtro_valido = Q(processado=True, protocolo__codigo_status=100) & ~Q(cancelamento__c_stat=135)
        ctes_validos_qs = CTeDocumento.objects.filter(filtro_periodo & filtro_valido)

        # === Principais origens ===
        origens = ctes_validos_qs.values(
            'identificacao__codigo_mun_ini', 'identificacao__nome_mun_ini', 'identificacao__uf_ini'
        ).annotate(
            total=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('-total')[:10] # Top 10 por quantidade

        top_origens = [{
            'municipio': o['identificacao__nome_mun_ini'], 'uf': o['identificacao__uf_ini'],
            'codigo': o['identificacao__codigo_mun_ini'], 'total': o['total'],
            'valor': float(o['valor'] or 0)
        } for o in origens if o['identificacao__nome_mun_ini'] and o['identificacao__uf_ini']]

        # === Principais destinos ===
        destinos = ctes_validos_qs.values(
            'identificacao__codigo_mun_fim', 'identificacao__nome_mun_fim', 'identificacao__uf_fim'
        ).annotate(
            total=Count('id'),
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('-total')[:10]

        top_destinos = [{
            'municipio': d['identificacao__nome_mun_fim'], 'uf': d['identificacao__uf_fim'],
            'codigo': d['identificacao__codigo_mun_fim'], 'total': d['total'],
            'valor': float(d['valor'] or 0)
        } for d in destinos if d['identificacao__nome_mun_fim'] and d['identificacao__uf_fim']]

        # === Rotas mais frequentes ===
        rotas = ctes_validos_qs.values(
            'identificacao__codigo_mun_ini', 'identificacao__nome_mun_ini', 'identificacao__uf_ini',
            'identificacao__codigo_mun_fim', 'identificacao__nome_mun_fim', 'identificacao__uf_fim'
        ).annotate(
            total=Count('id'),
            valor_total=Sum('prestacao__valor_total_prestado'),
            km_total=Sum('identificacao__dist_km') # Soma KM total da rota
        ).order_by('-total')[:15] # Top 15

        rotas_frequentes = []
        for r in rotas:
            origem = r['identificacao__nome_mun_ini']
            uf_ini = r['identificacao__uf_ini']
            destino = r['identificacao__nome_mun_fim']
            uf_fim = r['identificacao__uf_fim']

            if origem and uf_ini and destino and uf_fim:
                 rotas_frequentes.append({
                     'origem': {'municipio': origem, 'uf': uf_ini, 'codigo': r['identificacao__codigo_mun_ini']},
                     'destino': {'municipio': destino, 'uf': uf_fim, 'codigo': r['identificacao__codigo_mun_fim']},
                     'total': r['total'],
                     'valor': float(r['valor_total'] or 0),
                     'km_total': float(r['km_total'] or 0) # Adiciona KM
                 })

        # === Dados para mapa de rotas (simplificado - Top 5 fluxos por UF) ===
        rotas_mapa_uf = ctes_validos_qs.values('identificacao__uf_ini', 'identificacao__uf_fim')\
            .annotate(contagem=Count('id'), valor=Sum('prestacao__valor_total_prestado'))\
            .order_by('-contagem')[:5]

        rotas_mapa = [{
            'uf_ini': r['identificacao__uf_ini'], 'uf_fim': r['identificacao__uf_fim'],
            'contagem': r['contagem'], 'valor': float(r['valor'] or 0)
        } for r in rotas_mapa_uf if r['identificacao__uf_ini'] and r['identificacao__uf_fim']]


        # Compilar resposta
        response_data = {
            'filtros': {'data_inicio': data_inicio.isoformat(), 'data_fim': data_fim.isoformat()},
            'top_origens': top_origens,
            'top_destinos': top_destinos,
            'rotas_frequentes': rotas_frequentes,
            'rotas': rotas_mapa # Renomeado de rotas_mapa para rotas para corresponder ao serializer
        }

        serializer = GeograficoPainelSerializer(response_data)
        return Response(serializer.data)


class AlertasPagamentoAPIView(APIView):
    """
    API para obter alertas do sistema (pagamentos pendentes, etc.).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        params = request.query_params
        dias_limite = int(params.get('dias', 7)) # Padrão: 7 dias
        dias_limite = max(1, dias_limite) # Garante pelo menos 1 dia

        hoje = date.today()
        data_limite = hoje + timedelta(days=dias_limite)

        # Pagamentos agregados pendentes próximos do vencimento
        pagamentos_agregados = PagamentoAgregado.objects.filter(
            status='pendente',
            data_prevista__lte=data_limite # Inclui até a data limite
        ).order_by('data_prevista').select_related( # Ordena pelos mais próximos
            'cte', 'cte__identificacao' # Otimiza consulta
        )

        # Pagamentos próprios pendentes (todos, não apenas os próximos)
        # A lógica de "próximo do vencimento" é mais complexa para período (ex: AAAA-MM-1Q)
        pagamentos_proprios = PagamentoProprio.objects.filter(
            status='pendente'
        ).order_by('periodo').select_related('veiculo') # Ordena por período

        # Serializar os resultados
        serializer = AlertaPagamentoSerializer({
            'agregados_pendentes': pagamentos_agregados,
            'proprios_pendentes': pagamentos_proprios,
            'dias_alerta': dias_limite
        })

        return Response(serializer.data)


class AlertaSistemaViewSet(viewsets.ModelViewSet):
    """API para listar e limpar alertas do sistema."""
    queryset = AlertaSistema.objects.all()
    serializer_class = AlertaSistemaSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['post'])
    def limpar_todos(self, request):
        AlertaSistema.objects.all().delete()
        return Response({'message': 'Alertas do sistema removidos.'})
