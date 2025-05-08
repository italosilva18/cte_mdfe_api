# transport/views/cte_views.py

# Imports padrão
import csv
from datetime import datetime, timedelta
from decimal import Decimal # Importado caso _gerar_csv_response precise formatar
from io import StringIO

# Imports Django
from django.http import HttpResponse
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404 # Usado em get_object internamente

# Imports Django REST Framework
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

# Imports Locais
from ..serializers import ( # Use .. para voltar um nível
    CTeDocumentoListSerializer,
    CTeDocumentoDetailSerializer
)
from ..models import ( # Modelos usados pelo ViewSet e filtros
    CTeDocumento,
    CTeIdentificacao, # Usado no filtro
    CTeRemetente,     # Usado no filtro
    CTEDestinatario,  # Usado no filtro
    CTeModalRodoviario, # Usado no filtro
    CTeVeiculoRodoviario, # Usado no filtro
    CTeProtocoloAutorizacao, # Usado no filtro e DACTE
    CTeCancelamento # Usado no filtro
)
from ..services.parser_cte import parse_cte_completo # Serviço usado na action reprocessar


# --- Função Auxiliar (pode ser movida para utils.py) ---
def _gerar_csv_response(queryset, serializer_class, filename):
    """Gera uma HttpResponse com CSV a partir de um queryset e serializer."""
    if not queryset.exists():
        # Retorna um Response do DRF em vez de HttpResponse para consistência da API
        return Response({"error": "Não há dados para gerar o relatório CSV."},
                       status=status.HTTP_404_NOT_FOUND)

    serializer = serializer_class(queryset, many=True)
    dados = serializer.data

    # Usa o primeiro item para obter as chaves (cabeçalhos)
    if not dados:
         # Retorna um Response do DRF
        return Response({"error": "Não há dados serializados para gerar o relatório CSV."},
                       status=status.HTTP_404_NOT_FOUND)

    field_names = list(dados[0].keys())

    # Usa StringIO para construir o CSV em memória
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=field_names)
    writer.writeheader()
    writer.writerows(dados)

    # Cria a HttpResponse com o conteúdo CSV
    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'

    return response

# ===============================================================
# ==> APIS PARA CT-e
# ===============================================================

class CTeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """API para consulta de CT-es."""
    # queryset definido em get_queryset
    # serializer_class definido em get_serializer_class
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """Define o serializer com base na ação."""
        if self.action == 'retrieve':
            return CTeDocumentoDetailSerializer
        # Para 'list' e outras ações (como 'export'), usa o ListSerializer
        return CTeDocumentoListSerializer

    def get_queryset(self):
        """Permite filtrar os CT-es por diversos parâmetros."""
        # Começa com todos os CTes e ordena pelo mais recente
        queryset = CTeDocumento.objects.all().order_by('-data_upload')

        # --- Filtros ---
        params = self.request.query_params

        # Filtro por período (data_emissao)
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(identificacao__data_emissao__date__gte=data_inicio)
        if data_fim:
            # Adiciona 1 dia para incluir todo o dia final (se data_fim for apenas data)
            try:
                data_fim_obj = datetime.strptime(data_fim, '%Y-%m-%d').date() + timedelta(days=1)
                queryset = queryset.filter(identificacao__data_emissao__date__lt=data_fim_obj)
            except ValueError:
                pass # Ignora data_fim inválida

        # Filtro por modalidade (CIF/FOB)
        modalidade = params.get('modalidade')
        if modalidade in ['CIF', 'FOB']: # Valida a entrada
            queryset = queryset.filter(modalidade=modalidade)

        # Filtro por emitente (CNPJ)
        emitente_cnpj = params.get('emitente_cnpj')
        if emitente_cnpj:
            queryset = queryset.filter(emitente__cnpj=emitente_cnpj)

        # Filtro por remetente (CNPJ)
        remetente_cnpj = params.get('remetente_cnpj')
        if remetente_cnpj:
            queryset = queryset.filter(remetente__cnpj=remetente_cnpj)

        # Filtro por destinatário (CNPJ)
        destinatario_cnpj = params.get('destinatario_cnpj')
        if destinatario_cnpj:
            queryset = queryset.filter(destinatario__cnpj=destinatario_cnpj)

        # Filtro por origem (UF_ini)
        uf_ini = params.get('uf_ini')
        if uf_ini:
            queryset = queryset.filter(identificacao__uf_ini=uf_ini)

        # Filtro por destino (UF_fim)
        uf_fim = params.get('uf_fim')
        if uf_fim:
            queryset = queryset.filter(identificacao__uf_fim=uf_fim)

        # Filtro por placa (qualquer veículo associado ao modal rodoviário)
        placa = params.get('placa')
        if placa:
            # Usa __isnull=False para garantir que modal_rodoviario exista
            queryset = queryset.filter(modal_rodoviario__isnull=False, modal_rodoviario__veiculos__placa=placa)

        # Filtro por status de processamento (booleano)
        processado = params.get('processado')
        if processado is not None:
             is_processed = processado.lower() == 'true'
             queryset = queryset.filter(processado=is_processed)

        # Filtro por status de autorização (baseado no protocolo)
        autorizado = params.get('autorizado')
        if autorizado is not None:
            is_authorized = autorizado.lower() == 'true'
            if is_authorized:
                # Filtra por protocolo existente com código 100
                queryset = queryset.filter(protocolo__codigo_status=100)
            else:
                # Filtra por protocolo inexistente OU protocolo com código diferente de 100
                queryset = queryset.filter(Q(protocolo__isnull=True) | ~Q(protocolo__codigo_status=100))

        # Filtro por status de cancelamento (baseado no cancelamento)
        cancelado = params.get('cancelado')
        if cancelado is not None:
            is_canceled = cancelado.lower() == 'true'
            if is_canceled:
                 # Filtra por cancelamento existente com status 135
                queryset = queryset.filter(cancelamento__c_stat=135)
            else:
                # Filtra por cancelamento inexistente OU cancelamento com status diferente de 135
                queryset = queryset.filter(Q(cancelamento__isnull=True) | ~Q(cancelamento__c_stat=135))

        # Filtro por texto (pesquisa genérica em campos chave)
        texto = params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(chave__icontains=texto) |
                Q(identificacao__numero__icontains=texto) |
                Q(remetente__razao_social__icontains=texto) |
                Q(destinatario__razao_social__icontains=texto) |
                Q(emitente__razao_social__icontains=texto) # Adicionado emitente
            )

        # Usa distinct() para evitar duplicatas se filtros usarem joins que multiplicam resultados
        return queryset.distinct()

    # --- Actions ---
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os CT-es filtrados para CSV."""
        queryset = self.get_queryset() # Aplica os mesmos filtros da listagem
        filename = f"ctes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        # Usa o serializer de lista para exportar os campos resumidos
        return _gerar_csv_response(queryset, CTeDocumentoListSerializer, filename)

    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        """Endpoint para baixar o XML do CT-e."""
        cte = self.get_object() # Obtém o CT-e pelo ID (pk)

        # Verifica se o XML existe no objeto
        if not cte.xml_original:
            return Response({"error": "XML não disponível para este CT-e."}, status=status.HTTP_404_NOT_FOUND)

        # Retorna o XML como um arquivo
        response = HttpResponse(cte.xml_original, content_type='application/xml; charset=utf-8') # Define charset
        response['Content-Disposition'] = f'attachment; filename="CTe_{cte.chave}.xml"'
        return response

    @action(detail=True, methods=['get'])
    def dacte(self, request, pk=None):
        """Endpoint para gerar o DACTE (PDF) do CT-e (atualmente retorna JSON)."""
        cte = self.get_object()

        # Verifica se o CT-e está autorizado (condição para DACTE válido)
        is_authorized = hasattr(cte, 'protocolo') and cte.protocolo and cte.protocolo.codigo_status == 100
        is_canceled = hasattr(cte, 'cancelamento') and cte.cancelamento and cte.cancelamento.c_stat == 135

        if not is_authorized or is_canceled:
            status_text = "cancelado" if is_canceled else "não autorizado"
            return Response({"error": f"DACTE não disponível para CT-e {status_text}."},
                           status=status.HTTP_400_BAD_REQUEST)

        # --- Lógica de Geração do DACTE (Placeholder) ---
        # Em produção, aqui você chamaria uma função para gerar o PDF
        # Ex: pdf_content = gerar_dacte_pdf(cte)
        # response = HttpResponse(pdf_content, content_type='application/pdf')
        # response['Content-Disposition'] = f'attachment; filename="DACTE_{cte.chave}.pdf"'
        # return response
        # -------------------------------------------------

        # Implementação atual de placeholder: retorna JSON com dados básicos
        data_emissao = getattr(cte.identificacao, 'data_emissao', None)
        data = {
            "message": "Funcionalidade de geração de DACTE (PDF) em implementação.",
            "info": "Dados básicos para DACTE:",
            "chave": cte.chave,
            "numero": getattr(cte.identificacao, 'numero', None),
            "serie": getattr(cte.identificacao, 'serie', None),
            "data_emissao": data_emissao.strftime('%d/%m/%Y %H:%M') if data_emissao else None,
            "remetente": getattr(cte.remetente, 'razao_social', None),
            "destinatario": getattr(cte.destinatario, 'razao_social', None),
            "valor_total": float(getattr(cte.prestacao, 'valor_total_prestado', 0)),
            "protocolo": getattr(cte.protocolo, 'numero_protocolo', None),
            "modalidade": cte.modalidade,
        }
        return Response(data) # Retorna JSON por enquanto

    @action(detail=True, methods=['post'])
    def reprocessar(self, request, pk=None):
        """Endpoint para solicitar o reprocessamento de um CT-e."""
        cte = self.get_object()

        # Verifica se o XML original existe para poder reprocessar
        if not cte.xml_original:
            return Response({"error": "XML original não encontrado. Reprocessamento impossível."},
                           status=status.HTTP_400_BAD_REQUEST)

        # Marca como não processado para forçar o reprocessamento
        cte.processado = False
        cte.save(update_fields=['processado'])

        try:
            # Chama a função de parsing completa novamente
            success = parse_cte_completo(cte) # Passa o objeto CT-e
            if success:
                return Response({"message": "CT-e reprocessado com sucesso."})
            else:
                # Se o parser retornou False, indica erro interno no parser
                 return Response({"error": "Falha durante o reprocessamento. Verifique os logs."},
                                status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
             # Captura exceções levantadas pelo parser
             print(f"ERRO ao reprocessar CT-e {cte.chave}: {e}")
             # Garante que o status volte para não processado
             cte.processado = False
             cte.save(update_fields=['processado'])
             return Response({"error": f"Erro durante o reprocessamento: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)