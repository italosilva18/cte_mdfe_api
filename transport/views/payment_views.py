# transport/views/payment_views.py

# Imports padrão
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

# Imports Django
from django.http import HttpResponse
from django.db.models import Q, Sum, OuterRef, Exists
from django.utils import timezone
from django.shortcuts import get_object_or_404 # Usado internamente
from django.db import transaction

# Imports Django REST Framework
from rest_framework import viewsets, status, serializers # Importa serializers para ValidationError
from rest_framework.response import Response
from rest_framework.decorators import action
import logging

logger = logging.getLogger(__name__)
from rest_framework.permissions import IsAuthenticated

# Imports Locais
from ..serializers.payment_serializers import ( # Use .. para voltar um nível
    FaixaKMSerializer,
    PagamentoAgregadoSerializer,
    PagamentoProprioSerializer
)
from ..models import (  # Modelos usados pelos ViewSets
    FaixaKM,
    PagamentoAgregado,
    PagamentoProprio,
    Veiculo,
    CTeDocumento,
    CTeIdentificacao, # Usado nos filtros/cálculos
    CTeModalRodoviario, # Usado nos filtros/cálculos
    CTeMotorista, # Usado nos filtros/cálculos
    CTePrestacaoServico, # Usado nos filtros/cálculos
    CTeVeiculoRodoviario # Usado nos filtros/cálculos
)
# Funções utilitárias de outros módulos (se necessário)
# Ex: from ..utils import format_currency
from ..utils import csv_response


# ===============================================================
# ==> APIS PARA PAGAMENTOS
# ===============================================================

class FaixaKMViewSet(viewsets.ModelViewSet):
    """API para CRUD de Faixas de KM para pagamento."""
    queryset = FaixaKM.objects.all().order_by('min_km')
    serializer_class = FaixaKMSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        """Validação adicional antes de salvar uma nova faixa."""
        min_km = serializer.validated_data.get('min_km')
        max_km = serializer.validated_data.get('max_km')

        # Verifica se min_km < max_km quando max_km é fornecido
        if max_km is not None and min_km >= max_km:
            raise serializers.ValidationError({'max_km': 'O KM máximo deve ser maior que o KM mínimo.'})

        # Verifica sobreposições
        if self._verifica_sobreposicao(min_km, max_km):
             raise serializers.ValidationError({'min_km': 'Existe sobreposição com outra faixa de KM.'})

        serializer.save()

    def perform_update(self, serializer):
        """Validação adicional antes de atualizar uma faixa existente."""
        instance = serializer.instance
        min_km = serializer.validated_data.get('min_km', instance.min_km)
        max_km = serializer.validated_data.get('max_km', instance.max_km)

        # Verifica se min_km < max_km quando max_km é fornecido
        if max_km is not None and min_km >= max_km:
            raise serializers.ValidationError({'max_km': 'O KM máximo deve ser maior que o KM mínimo.'})

        # Verifica sobreposições, excluindo a própria instância
        if self._verifica_sobreposicao(min_km, max_km, instance.pk):
             raise serializers.ValidationError({'min_km': 'Existe sobreposição com outra faixa de KM.'})

        serializer.save()

    def _verifica_sobreposicao(self, min_km, max_km, exclude_pk=None):
        """Verifica se a nova faixa (min_km, max_km) se sobrepõe a alguma existente."""
        queryset = FaixaKM.objects.all()
        if exclude_pk:
            queryset = queryset.exclude(pk=exclude_pk)

        # Condições de sobreposição
        # 1. Nova faixa começa DENTRO de uma faixa existente
        q1 = Q(min_km__lte=min_km) & (Q(max_km__gte=min_km) | Q(max_km__isnull=True))
        # 2. Nova faixa termina DENTRO de uma faixa existente (se tiver fim)
        q2 = Q()
        if max_km is not None:
            q2 = Q(min_km__lte=max_km) & (Q(max_km__gte=max_km) | Q(max_km__isnull=True))
        # 3. Nova faixa ENGLOBA uma faixa existente
        q3 = Q(min_km__gte=min_km) & (Q(max_km__lte=max_km) if max_km is not None else Q())

        return queryset.filter(q1 | q2 | q3).exists()


class PagamentoAgregadoViewSet(viewsets.ModelViewSet):
    """API para gerenciar pagamentos a motoristas agregados."""
    queryset = PagamentoAgregado.objects.all().order_by('-data_prevista')
    serializer_class = PagamentoAgregadoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Permite filtrar pagamentos por diversos parâmetros."""
        queryset = super().get_queryset()
        params = self.request.query_params

        # Filtro por status
        status_filter = params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filtro por placa
        placa = params.get('placa')
        if placa:
            queryset = queryset.filter(placa=placa)

        # Filtro por período (data_prevista)
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(data_prevista__gte=data_inicio)
        if data_fim:
            queryset = queryset.filter(data_prevista__lte=data_fim)

        # Filtro por condutor (CPF)
        condutor_cpf = params.get('condutor_cpf')
        if condutor_cpf:
            queryset = queryset.filter(condutor_cpf=condutor_cpf)

        # Filtro por texto (nome do condutor)
        texto = params.get('q')
        if texto:
            queryset = queryset.filter(condutor_nome__icontains=texto)

        # Selecionar/Prefetch dados relacionados para otimizar
        queryset = queryset.select_related('cte', 'cte__identificacao')

        return queryset

    @action(detail=False, methods=['post'])
    @transaction.atomic # Garante que a geração seja atômica
    def gerar(self, request):
        """
        Endpoint para gerar registros de pagamentos agregados em lote.
        Parâmetros no body:
        - data_inicio: Data inicial para filtrar CT-es (YYYY-MM-DD)
        - data_fim: Data final para filtrar CT-es (YYYY-MM-DD)
        - percentual: Percentual de repasse (opcional, padrão: 25%)
        - data_prevista: Data prevista para pagamento (opcional, padrão: hoje - YYYY-MM-DD)
        """
        data_inicio = request.data.get('data_inicio')
        data_fim = request.data.get('data_fim')
        percentual = request.data.get('percentual', 25.0)
        data_prevista_str = request.data.get('data_prevista', date.today().isoformat())

        if not data_inicio or not data_fim:
            return Response({"error": "Parâmetros data_inicio e data_fim são obrigatórios"},
                           status=status.HTTP_400_BAD_REQUEST)

        try:
            data_prevista = datetime.strptime(data_prevista_str, '%Y-%m-%d').date()
            percentual_decimal = Decimal(str(percentual))
            if not (0 < percentual_decimal <= 100):
                raise ValueError("Percentual fora do intervalo válido (0-100).")
        except (ValueError, TypeError, InvalidOperation) as e:
            return Response({"error": f"Parâmetro inválido: {e}"},
                           status=status.HTTP_400_BAD_REQUEST)

        # Buscar CT-es válidos, com veículo agregado, no período, que ainda não têm pagamento
        ctes_sem_pagamento = CTeDocumento.objects.filter(
            Q(identificacao__data_emissao__date__gte=data_inicio) &
            Q(identificacao__data_emissao__date__lte=data_fim) &
            Q(processado=True) &
            Q(protocolo__codigo_status=100) & # Autorizado
            ~Q(cancelamento__c_stat=135) & # Não cancelado
            Q(modal_rodoviario__veiculos__tipo_proprietario='02') & # Veículo Agregado
            ~Exists(PagamentoAgregado.objects.filter(cte=OuterRef('pk'))) # Sem pagamento existente
        ).select_related(
            'prestacao', 'identificacao', 'modal_rodoviario' # Seleciona dados relacionados
        ).prefetch_related(
            'modal_rodoviario__veiculos', 'modal_rodoviario__motoristas' # Prefetch dados ManyToMany
        ).distinct() # Garante que cada CT-e apareça uma vez

        contador = {'criados': 0, 'erros': 0, 'avisos': 0}
        erros_detalhados = []
        avisos_detalhados = []

        for cte in ctes_sem_pagamento:
            try:
                # Verificar se CT-e tem prestação e modal rodoviário
                if not hasattr(cte, 'prestacao') or not cte.prestacao:
                     avisos_detalhados.append(f"CT-e {cte.chave}: Sem dados de prestação, ignorado.")
                     contador['avisos'] += 1
                     continue
                if not hasattr(cte, 'modal_rodoviario') or not cte.modal_rodoviario:
                     avisos_detalhados.append(f"CT-e {cte.chave}: Sem dados de modal rodoviário, ignorado.")
                     contador['avisos'] += 1
                     continue

                # Encontrar o primeiro veículo agregado no CT-e
                veiculo_agregado = next((v for v in cte.modal_rodoviario.veiculos.all() if v.tipo_proprietario == '02'), None)
                if not veiculo_agregado:
                    avisos_detalhados.append(f"CT-e {cte.chave}: Nenhum veículo com tipo '02' (Agregado) encontrado, ignorado.")
                    contador['avisos'] += 1
                    continue

                # Buscar motorista principal (se houver)
                motorista = cte.modal_rodoviario.motoristas.first()
                motorista_nome = motorista.nome if motorista else (veiculo_agregado.proprietario_nome or "Motorista Agregado")
                motorista_cpf = motorista.cpf if motorista else None

                # Criar pagamento
                PagamentoAgregado.objects.create(
                    cte=cte,
                    placa=veiculo_agregado.placa,
                    condutor_nome=motorista_nome,
                    condutor_cpf=motorista_cpf,
                    valor_frete_total=cte.prestacao.valor_total_prestado,
                    percentual_repasse=percentual_decimal,
                    # valor_repassado é calculado no save()
                    data_prevista=data_prevista,
                    status='pendente'
                )
                contador['criados'] += 1
            except Exception as e:
                erros_detalhados.append(f"CT-e {cte.chave}: {str(e)}")
                contador['erros'] += 1

        status_final = status.HTTP_201_CREATED if contador['criados'] > 0 else status.HTTP_200_OK
        return Response({
            "message": f"Geração de pagamentos concluída.",
            "criados": contador['criados'],
            "erros": contador['erros'],
            "avisos": contador['avisos'], # Avisos sobre CTes ignorados
            "detalhes_erros": erros_detalhados,
            "detalhes_avisos": avisos_detalhados
        }, status=status_final)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os pagamentos agregados filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"pagamentos_agregados_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return csv_response(queryset, self.get_serializer_class(), filename)


class PagamentoProprioViewSet(viewsets.ModelViewSet):
    """API para gerenciar pagamentos a motoristas próprios."""
    queryset = PagamentoProprio.objects.all().order_by('-periodo')
    serializer_class = PagamentoProprioSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Permite filtrar pagamentos por diversos parâmetros."""
        queryset = super().get_queryset()
        params = self.request.query_params

        # Filtro por status
        status_filter = params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filtro por veículo (ID)
        veiculo_id = params.get('veiculo')
        if veiculo_id:
            queryset = queryset.filter(veiculo_id=veiculo_id)

        # Filtro por placa do veículo
        placa = params.get('placa')
        if placa:
            queryset = queryset.filter(veiculo__placa=placa)

        # Filtro por período (exato)
        periodo = params.get('periodo')
        if periodo:
            queryset = queryset.filter(periodo=periodo)

        # Selecionar/Prefetch dados relacionados para otimizar
        queryset = queryset.select_related('veiculo')

        return queryset

    def _calcular_km_periodo(self, veiculo, periodo_str):
        """
        Calcula o KM rodado para um veículo em um período (AAAA-MM ou AAAA-MM-XQ).
        Soma dist_km dos CT-es válidos do veículo no período.
        Retorna 0 em caso de erro ou se não houver CTes.
        """
        try:
            # Extrai ano e mês base do período
            match = re.match(r'(\d{4})-(\d{2})', periodo_str)
            if not match:
                raise ValueError("Formato de período inválido.")
            ano, mes = map(int, match.groups())

            # Determina data de início e fim com base na quinzena/mês
            if periodo_str.endswith('-1Q'): # Primeira quinzena
                data_inicio = date(ano, mes, 1)
                data_fim = date(ano, mes, 15)
            elif periodo_str.endswith('-2Q'): # Segunda quinzena
                 data_inicio = date(ano, mes, 16)
                 if mes == 12:
                     data_fim = date(ano, 12, 31)
                 else:
                      data_fim = date(ano, mes + 1, 1) - timedelta(days=1)
            else: # Mês inteiro
                 data_inicio = date(ano, mes, 1)
                 if mes == 12:
                     data_fim = date(ano, 12, 31)
                 else:
                      data_fim = date(ano, mes + 1, 1) - timedelta(days=1)

            # Soma dist_km dos CT-es válidos do veículo no período
            # Usar Coalesce(Sum(...), 0) para tratar caso de não haver CTes
            from django.db.models.functions import Coalesce
            km_total = CTeDocumento.objects.filter(
                modal_rodoviario__veiculos__placa=veiculo.placa,
                identificacao__data_emissao__date__gte=data_inicio,
                identificacao__data_emissao__date__lte=data_fim,
                processado=True,
                protocolo__codigo_status=100 # Autorizado
            ).exclude(cancelamento__c_stat=135).aggregate( # Não cancelado
                total_km=Coalesce(Sum('identificacao__dist_km'), 0)
            )['total_km']

            return km_total if km_total is not None else 0
        except Exception as e:
            logger.warning(
                "Erro ao calcular KM para %s no período %s: %s",
                veiculo.placa,
                periodo_str,
                e,
            )
            return 0  # Retorna 0 em caso de erro

    @action(detail=False, methods=['post'])
    def calcular_km(self, request):
        """
        Endpoint para calcular a quantidade de KM rodados em um período.
        Retorna o valor base a ser pago de acordo com as faixas cadastradas.
        Parâmetros no body:
        - veiculo_id: ID do veículo (obrigatório)
        - periodo: Período no formato AAAA-MM ou AAAA-MM-XQ (obrigatório)
        - km_total: (Opcional) Quantidade de KM informada manualmente
        """
        veiculo_id = request.data.get('veiculo_id')
        periodo = request.data.get('periodo')
        km_manual = request.data.get('km_total')

        if not veiculo_id or not periodo:
            return Response({"error": "Parâmetros veiculo_id e periodo são obrigatórios."},
                           status=status.HTTP_400_BAD_REQUEST)

        try:
            veiculo = Veiculo.objects.get(pk=veiculo_id)
        except Veiculo.DoesNotExist:
            return Response({"error": "Veículo não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        # Validação de formato do período
        if not re.match(r'^\d{4}-\d{2}(-[12]Q)?$', periodo):
            return Response({"error": "Formato de período inválido. Use AAAA-MM ou AAAA-MM-1Q/2Q."},
                           status=status.HTTP_400_BAD_REQUEST)

        km_total = 0
        fonte_km = "Não calculado"

        # Se km foi informado manualmente, usar esse valor
        if km_manual is not None:
            try:
                km_total = int(km_manual)
                if km_total < 0:
                     raise ValueError("KM deve ser positivo.")
                fonte_km = "Manual"
            except (ValueError, TypeError):
                return Response({"error": "Valor de km_total inválido."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Cálculo automático de KM
            km_total = self._calcular_km_periodo(veiculo, periodo)
            fonte_km = "Automático (baseado nos CT-es)"

        # Buscar faixa correspondente ao km_total
        try:
            # Ordena por min_km descendente para pegar a faixa mais específica primeiro
            faixa = FaixaKM.objects.filter(
                Q(min_km__lte=km_total) &
                (Q(max_km__gte=km_total) | Q(max_km__isnull=True)) # Inclui faixas sem limite superior
            ).order_by('-min_km').first()

            if not faixa:
                 # Se não achou faixa específica, pega a última cadastrada como fallback? Ou retorna erro?
                 # Retornar erro é mais seguro para evitar pagamentos incorretos.
                 return Response({"error": f"Nenhuma faixa de KM aplicável encontrada para {km_total} KM."},
                                status=status.HTTP_400_BAD_REQUEST)

            valor_base = faixa.valor_pago

            return Response({
                "km_total": km_total,
                "fonte_km": fonte_km,
                "veiculo": {"id": str(veiculo.id), "placa": veiculo.placa},
                "periodo": periodo,
                "faixa_aplicada": {"id": faixa.id, "min_km": faixa.min_km, "max_km": faixa.max_km, "valor": float(faixa.valor_pago)},
                "valor_base": float(valor_base)
            })

        except Exception as e:
            logger.warning(
                "Erro ao calcular valor base para %s / %s: %s",
                veiculo.placa,
                periodo,
                e,
            )
            return Response({"error": f"Erro ao calcular valor base: {str(e)}"},
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def gerar(self, request):
        """
        Endpoint para gerar registros de pagamentos próprios em lote.
        Parâmetros no body:
        - periodo: Período no formato AAAA-MM ou AAAA-MM-XQ (obrigatório)
        - veiculos: Lista de IDs de veículos ou "todos" para todos veículos próprios (opcional, default="todos")
        - km_padrao: KM padrão a considerar (opcional, sobrescreve cálculo automático)
        """
        periodo = request.data.get('periodo')
        veiculos_param = request.data.get('veiculos', 'todos') # Default "todos"
        km_padrao = request.data.get('km_padrao')

        if not periodo:
            return Response({"error": "Parâmetro periodo é obrigatório."},
                           status=status.HTTP_400_BAD_REQUEST)

        # Validação de formato do período
        if not re.match(r'^\d{4}-\d{2}(-[12]Q)?$', periodo):
            return Response({"error": "Formato de período inválido. Use AAAA-MM ou AAAA-MM-1Q/2Q."},
                           status=status.HTTP_400_BAD_REQUEST)

        # Obter veículos
        try:
            if veiculos_param == 'todos':
                # Seleciona veículos próprios (tipo '00') e ativos
                veiculos = Veiculo.objects.filter(tipo_proprietario='00', ativo=True)
            elif isinstance(veiculos_param, list):
                # Seleciona veículos da lista que são próprios e ativos
                veiculos = Veiculo.objects.filter(id__in=veiculos_param, tipo_proprietario='00', ativo=True)
            else:
                 raise ValueError("Parâmetro veiculos deve ser 'todos' ou uma lista de IDs.")
        except ValueError as ve:
             return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.warning("Erro ao buscar veículos: %s", e)
            return Response({"error": "Erro ao buscar veículos."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if not veiculos.exists():
            return Response({"message": "Nenhum veículo próprio e ativo encontrado para processar."},
                           status=status.HTTP_200_OK) # Não é um erro, apenas nada a fazer

        # Validar km_padrao (se fornecido)
        km_total_padrao = None
        if km_padrao is not None:
            try:
                km_total_padrao = int(km_padrao)
                if km_total_padrao < 0:
                    raise ValueError("KM deve ser positivo.")
            except (ValueError, TypeError):
                return Response({"error": "Valor de km_padrao inválido."},
                               status=status.HTTP_400_BAD_REQUEST)

        resultados = {'criados': 0, 'ignorados': 0, 'erros': 0, 'detalhes': []}

        # Processa cada veículo
        for veiculo in veiculos:
            # Verifica se já existe pagamento para este veículo/período
            if PagamentoProprio.objects.filter(veiculo=veiculo, periodo=periodo).exists():
                resultados['ignorados'] += 1
                resultados['detalhes'].append({'veiculo': veiculo.placa, 'status': 'ignorado', 'motivo': 'Pagamento já existe'})
                continue

            try:
                # Calcula ou usa KM padrão
                km_total = km_total_padrao if km_total_padrao is not None else self._calcular_km_periodo(veiculo, periodo)

                # Busca faixa de KM correspondente
                faixa = FaixaKM.objects.filter(
                    Q(min_km__lte=km_total) &
                    (Q(max_km__gte=km_total) | Q(max_km__isnull=True))
                ).order_by('-min_km').first()

                if not faixa:
                     # Se não há faixa aplicável, não pode gerar o pagamento base
                     raise ValueError(f"Nenhuma faixa de KM encontrada para {km_total} KM.")

                # Cria o registro de pagamento
                PagamentoProprio.objects.create(
                    veiculo=veiculo,
                    periodo=periodo,
                    km_total_periodo=km_total,
                    valor_base_faixa=faixa.valor_pago,
                    ajustes=Decimal('0.00'), # Ajustes podem ser feitos depois
                    status='pendente'
                    # valor_total_pagar é calculado no save()
                )
                resultados['criados'] += 1
                resultados['detalhes'].append({
                    'veiculo': veiculo.placa,
                    'status': 'criado',
                    'km_total': km_total,
                    'valor_base': float(faixa.valor_pago)
                })

            except Exception as e:
                logger.warning(
                    "Erro ao gerar pagamento para %s / %s: %s",
                    veiculo.placa,
                    periodo,
                    e,
                )
                resultados['erros'] += 1
                resultados['detalhes'].append({'veiculo': veiculo.placa, 'status': 'erro', 'motivo': str(e)})

        return Response({
            "message": f"Geração de pagamentos concluída.",
            "criados": resultados['criados'],
            "ignorados": resultados['ignorados'],
            "erros": resultados['erros'],
            "resultados_detalhados": resultados['detalhes']
        })

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os pagamentos próprios filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"pagamentos_proprios_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return csv_response(queryset, self.get_serializer_class(), filename)
