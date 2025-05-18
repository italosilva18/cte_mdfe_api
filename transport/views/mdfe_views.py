# transport/views/mdfe_views.py

# Imports padrão
import csv
from datetime import datetime, timedelta
from decimal import Decimal
from io import StringIO

# Imports Django
from django.http import HttpResponse
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404 # Usado internamente

# Imports Django REST Framework
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
import logging

logger = logging.getLogger(__name__)

# Imports Locais
from ..serializers.mdfe_serializers import ( # Use .. para voltar um nível
    MDFeDocumentoListSerializer,
    MDFeDocumentoDetailSerializer
)
from ..models import ( # Modelos usados pelo ViewSet e filtros
    MDFeDocumento,
    MDFeIdentificacao,
    MDFeEmitente,
    MDFeModalRodoviario,
    MDFeVeiculoTracao,
    MDFeVeiculoReboque,
    MDFeProtocoloAutorizacao,
    MDFeCancelamento,
    MDFeDocumentosVinculados,
    MDFeMunicipioDescarga,
    CTeDocumento # Usado na action 'documentos'
)
from ..services.parser_mdfe import parse_mdfe_completo # Serviço usado na action reprocessar


# --- Função Auxiliar (pode ser movida para utils.py) ---
# Copiada de cte_views.py - idealmente ficaria em utils.py
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
# ==> APIS PARA MDF-e
# ===============================================================

class MDFeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """API para consulta de MDF-es."""
    # queryset definido em get_queryset
    # serializer_class definido em get_serializer_class
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """Define o serializer com base na ação."""
        if self.action == 'retrieve':
            return MDFeDocumentoDetailSerializer
        return MDFeDocumentoListSerializer

    def get_queryset(self):
        """Permite filtrar os MDF-es por diversos parâmetros."""
        queryset = MDFeDocumento.objects.all().order_by('-data_upload')
        params = self.request.query_params

        # Filtro por período (data_emissao dh_emi)
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')
        if data_inicio:
            queryset = queryset.filter(identificacao__dh_emi__date__gte=data_inicio)
        if data_fim:
            try:
                data_fim_obj = datetime.strptime(data_fim, '%Y-%m-%d').date() + timedelta(days=1)
                queryset = queryset.filter(identificacao__dh_emi__date__lt=data_fim_obj)
            except ValueError:
                pass

        # Filtro por emitente (CNPJ)
        emitente_cnpj = params.get('emitente_cnpj')
        if emitente_cnpj:
            queryset = queryset.filter(emitente__cnpj=emitente_cnpj)

        # Filtro por origem (UF_ini)
        uf_ini = params.get('uf_ini')
        if uf_ini:
            queryset = queryset.filter(identificacao__uf_ini=uf_ini)

        # Filtro por destino (UF_fim)
        uf_fim = params.get('uf_fim')
        if uf_fim:
            queryset = queryset.filter(identificacao__uf_fim=uf_fim)

        # Filtro por placa (tracao ou reboque)
        placa = params.get('placa')
        if placa:
            queryset = queryset.filter(
                Q(modal_rodoviario__veiculo_tracao__placa=placa) |
                Q(modal_rodoviario__veiculos_reboque__placa=placa)
            )

        # Filtro por status de processamento
        processado = params.get('processado')
        if processado is not None:
            is_processed = processado.lower() == 'true'
            queryset = queryset.filter(processado=is_processed)

        # Filtro por status de autorização
        autorizado = params.get('autorizado')
        if autorizado is not None:
            is_authorized = autorizado.lower() == 'true'
            if is_authorized:
                queryset = queryset.filter(protocolo__codigo_status=100)
            else:
                queryset = queryset.filter(Q(protocolo__isnull=True) | ~Q(protocolo__codigo_status=100))

        # Filtro por status de cancelamento
        cancelado = params.get('cancelado')
        if cancelado is not None:
            is_canceled = cancelado.lower() == 'true'
            if is_canceled:
                queryset = queryset.filter(cancelamento__c_stat=135)
            else:
                queryset = queryset.filter(Q(cancelamento__isnull=True) | ~Q(cancelamento__c_stat=135))

        # Filtro por status de encerramento
        encerrado = params.get('encerrado')
        if encerrado is not None:
             is_closed = encerrado.lower() == 'true'
             queryset = queryset.filter(encerrado=is_closed)

        # Filtro por texto (chave, número MDF-e, placa)
        texto = params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(chave__icontains=texto) |
                Q(identificacao__n_mdf__icontains=texto) |
                Q(modal_rodoviario__veiculo_tracao__placa__icontains=texto)
            )

        return queryset.distinct()

    # --- Actions ---
    @action(detail=False, methods=['get'])
    def export(self, request):
        """Exporta os MDF-es filtrados para CSV."""
        queryset = self.get_queryset()
        filename = f"mdfes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return _gerar_csv_response(queryset, MDFeDocumentoListSerializer, filename)

    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        """Endpoint para baixar o XML do MDF-e."""
        mdfe = self.get_object()

        if not mdfe.xml_original:
            return Response({"error": "XML não disponível para este MDF-e."}, status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(mdfe.xml_original, content_type='application/xml; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="MDFe_{mdfe.chave}.xml"'
        return response

    @action(detail=True, methods=['get'])
    def damdfe(self, request, pk=None):
        """Endpoint para gerar o DAMDFE (PDF) do MDF-e (atualmente retorna JSON)."""
        mdfe = self.get_object()

        # Verifica se o MDF-e está autorizado e não cancelado
        is_authorized = hasattr(mdfe, 'protocolo') and mdfe.protocolo and mdfe.protocolo.codigo_status == 100
        is_canceled = hasattr(mdfe, 'cancelamento') and mdfe.cancelamento and mdfe.cancelamento.c_stat == 135

        if not is_authorized or is_canceled:
            status_text = "cancelado" if is_canceled else "não autorizado"
            return Response({"error": f"DAMDFE não disponível para MDF-e {status_text}."},
                           status=status.HTTP_400_BAD_REQUEST)

        # --- Lógica de Geração do DAMDFE (Placeholder) ---
        # pdf_content = gerar_damdfe_pdf(mdfe)
        # response = HttpResponse(pdf_content, content_type='application/pdf')
        # response['Content-Disposition'] = f'attachment; filename="DAMDFE_{mdfe.chave}.pdf"'
        # return response
        # --------------------------------------------------

        # Implementação atual de placeholder: retorna JSON com dados básicos
        data_emissao = getattr(mdfe.identificacao, 'dh_emi', None)
        placa_tracao = getattr(getattr(mdfe.modal_rodoviario, 'veiculo_tracao', None), 'placa', None)

        data = {
            "message": "Funcionalidade de geração de DAMDFE (PDF) em implementação.",
            "info": "Dados básicos para DAMDFE:",
            "chave": mdfe.chave,
            "numero": getattr(mdfe.identificacao, 'n_mdf', None),
            "serie": getattr(mdfe.identificacao, 'serie', None),
            "data_emissao": data_emissao.strftime('%d/%m/%Y %H:%M') if data_emissao else None,
            "uf_inicio": getattr(mdfe.identificacao, 'uf_ini', None),
            "uf_fim": getattr(mdfe.identificacao, 'uf_fim', None),
            "placa": placa_tracao,
            "protocolo": getattr(mdfe.protocolo, 'numero_protocolo', None),
            "encerrado": mdfe.encerrado,
        }
        return Response(data)

    @action(detail=True, methods=['post'])
    def reprocessar(self, request, pk=None):
        """Endpoint para solicitar o reprocessamento de um MDF-e."""
        mdfe = self.get_object()

        if not mdfe.xml_original:
            return Response({"error": "XML original não encontrado. Reprocessamento impossível."},
                           status=status.HTTP_400_BAD_REQUEST)

        mdfe.processado = False
        mdfe.save(update_fields=['processado'])

        try:
            success = parse_mdfe_completo(mdfe)
            if success:
                return Response({"message": "MDF-e reprocessado com sucesso."})
            else:
                return Response({"error": "Falha durante o reprocessamento. Verifique os logs."},
                               status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.warning("ERRO ao reprocessar MDF-e %s: %s", mdfe.chave, e)
            mdfe.processado = False
            mdfe.save(update_fields=['processado'])
            return Response({"error": f"Erro durante o reprocessamento: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def documentos(self, request, pk=None):
        """Endpoint para listar documentos vinculados ao MDF-e."""
        mdfe = self.get_object()

        # Obtém os documentos vinculados, selecionando dados relacionados para otimizar
        docs = MDFeDocumentosVinculados.objects.filter(mdfe=mdfe)\
                   .select_related('municipio_descarga', 'cte_relacionado',
                                   'cte_relacionado__emitente', 'cte_relacionado__remetente',
                                   'cte_relacionado__destinatario', 'cte_relacionado__prestacao')\
                   .prefetch_related('produtos_perigosos') # Prefetch para produtos perigosos

        # Prepara a resposta
        resultados = []
        for doc in docs:
            # Determina o tipo de documento pela chave (posições 20-21)
            tipo_doc = "Desconhecido"
            try:
                modelo = doc.chave_documento[20:22]
                if modelo == '57': tipo_doc = 'CT-e'
                elif modelo == '55': tipo_doc = 'NF-e'
                elif modelo == '67': tipo_doc = 'CT-e OS'
            except: pass

            # Prepara dados básicos do documento
            item = {
                'id': doc.id,
                'chave': doc.chave_documento,
                'tipo': tipo_doc,
                'municipio': {
                    'codigo': doc.municipio_descarga.c_mun_descarga,
                    'nome': doc.municipio_descarga.x_mun_descarga
                } if hasattr(doc, 'municipio_descarga') and doc.municipio_descarga else None,
                'produtos_perigosos': []  # Inicializa
            }

            # Adiciona dados do CT-e relacionado se existir
            if doc.cte_relacionado:
                cte = doc.cte_relacionado
                item['cte'] = {
                    'id': str(cte.id),
                    'numero': getattr(getattr(cte, 'identificacao', None), 'numero', None),
                    'serie': getattr(getattr(cte, 'identificacao', None), 'serie', None),
                    'emitente': getattr(getattr(cte, 'emitente', None), 'razao_social', None),
                    'remetente': getattr(getattr(cte, 'remetente', None), 'razao_social', None),
                    'destinatario': getattr(getattr(cte, 'destinatario', None), 'razao_social', None),
                    'valor': float(getattr(getattr(cte, 'prestacao', None), 'valor_total_prestado', 0))
                }

            # Adiciona produtos perigosos (já pré-carregados)
            item['produtos_perigosos'] = [
                {
                    'n_onu': p.n_onu,
                    'nome': p.x_nome_ae,
                    'classe_risco': p.x_cla_risco,
                    'grupo_embalagem': p.gr_emb,
                    'qtd_total': p.q_tot_prod,
                    'qtd_tipo_volume': p.q_vol_tipo
                } for p in doc.produtos_perigosos.all() # Acessa os produtos pré-carregados
            ]

            resultados.append(item)

        return Response(resultados)