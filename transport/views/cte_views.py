# transport/views/cte_views.py

# Imports padrão
import csv
from datetime import datetime, timedelta
from io import StringIO

# Imports Django
from django.http import HttpResponse
from django.db.models import Q, Sum, Count, F
from django.utils import timezone
from django.shortcuts import get_object_or_404

# Imports Django REST Framework
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
import logging

logger = logging.getLogger(__name__)

# Imports Locais
from ..serializers.cte_serializers import (
    CTeDocumentoListSerializer, 
    CTeDocumentoDetailSerializer
)

from ..models import (
    CTeDocumento,
    CTeIdentificacao,
    CTeEmitente,
    CTeRemetente,
    CTEDestinatario,
    CTeModalRodoviario,
    CTeVeiculoRodoviario,
    CTeProtocoloAutorizacao,
    CTeCancelamento,
    CTePrestacaoServico,
    CTeComponenteValor
)
from ..services.parser_cte import parse_cte_completo
from ..services.dacte_generator import gerar_dacte_pdf


def generate_csv_from_queryset(queryset, serializer_class):
    """Gera CSV a partir de um queryset usando um serializer."""
    output = StringIO()
    
    # Se não houver dados, retorna CSV vazio
    if not queryset.exists():
        writer = csv.writer(output)
        writer.writerow(['Nenhum registro encontrado'])
        output.seek(0)
        return output.getvalue()
    
    # Serializa os dados
    serializer = serializer_class(queryset, many=True)
    data = serializer.data
    
    if not data:
        writer = csv.writer(output)
        writer.writerow(['Nenhum registro encontrado'])
        output.seek(0)
        return output.getvalue()
    
    # Obtém os campos do primeiro item e traduz para português
    field_mapping = {
        'id': 'ID',
        'chave': 'Chave de Acesso',
        'numero_cte': 'Número CT-e',
        'serie_cte': 'Série',
        'data_emissao': 'Data Emissão',
        'modalidade': 'Modalidade',
        'remetente_nome': 'Remetente',
        'remetente_cnpj': 'CNPJ Remetente',
        'destinatario_nome': 'Destinatário',
        'destinatario_cnpj': 'CNPJ Destinatário',
        'emitente_nome': 'Emitente',
        'emitente_cnpj': 'CNPJ Emitente',
        'uf_inicio': 'UF Início',
        'uf_fim': 'UF Fim',
        'valor_total': 'Valor Total',
        'valor_recebido': 'Valor a Receber',
        'placa_principal': 'Placa',
        'status': 'Status',
        'protocolo_numero': 'Protocolo',
        'protocolo_data': 'Data Autorização',
        'protocolo_codigo_status': 'Código Status',
        'processado': 'Processado',
        'data_upload': 'Data Upload'
    }
    
    # Campos ordenados para o CSV
    ordered_fields = [
        'chave', 'numero_cte', 'serie_cte', 'data_emissao', 'modalidade',
        'remetente_nome', 'remetente_cnpj', 'destinatario_nome', 'destinatario_cnpj',
        'uf_inicio', 'uf_fim', 'valor_total', 'status', 'protocolo_numero'
    ]
    
    # Filtra apenas os campos que existem nos dados
    available_fields = [f for f in ordered_fields if f in data[0]]
    fieldnames = [field_mapping.get(f, f) for f in available_fields]
    
    # Cria o CSV
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for item in data:
        # Cria row apenas com campos disponíveis
        row = {}
        for field in available_fields:
            value = item.get(field, '')
            # Formata valores especiais
            if field == 'data_emissao' and value:
                try:
                    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    value = dt.strftime('%d/%m/%Y %H:%M')
                except:
                    pass
            elif field == 'valor_total' and value:
                try:
                    value = f"R$ {float(value):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
                except:
                    pass
            elif field == 'modalidade' and not value:
                value = 'N/I'
            
            row[field_mapping.get(field, field)] = value if value is not None else ''
        
        writer.writerow(row)
    
    output.seek(0)
    return output.getvalue()


# ===============================================================
# ==> APIS PARA CT-e
# ===============================================================

class CTeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API para consulta de CT-es.
    
    Endpoints:
    - GET /api/ctes/ - Lista CT-es com filtros
    - GET /api/ctes/{id}/ - Detalhes de um CT-e
    - GET /api/ctes/export/ - Exporta CT-es filtrados para CSV
    - GET /api/ctes/{id}/xml/ - Download do XML do CT-e
    - GET /api/ctes/{id}/dacte/ - Gera DACTE (PDF) do CT-e
    - POST /api/ctes/{id}/reprocessar/ - Reprocessa o CT-e
    
    Filtros disponíveis:
    - data_inicio: Data inicial (YYYY-MM-DD)
    - data_fim: Data final (YYYY-MM-DD)
    - modalidade: CIF ou FOB
    - emitente_cnpj: CNPJ do emitente
    - remetente_cnpj: CNPJ do remetente
    - destinatario_cnpj: CNPJ do destinatário
    - uf_ini: UF de início
    - uf_fim: UF de fim
    - placa: Placa do veículo
    - processado: true/false
    - autorizado: true/false
    - cancelado: true/false
    - q: Texto para busca geral
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        """Define o serializer com base na ação."""
        if self.action == 'retrieve':
            return CTeDocumentoDetailSerializer
        return CTeDocumentoListSerializer

    def get_queryset(self):
        """
        Retorna queryset filtrado de CT-es.
        
        Otimizações incluídas:
        - select_related para relações 1-1
        - prefetch_related para relações 1-N
        - distinct() para evitar duplicatas
        """
        # Base queryset com otimizações
        queryset = CTeDocumento.objects.select_related(
            'identificacao',
            'emitente',
            'remetente',
            'destinatario',
            'prestacao',
            'protocolo',
            'cancelamento',
            'modal_rodoviario'
        ).prefetch_related(
            'modal_rodoviario__veiculos',
            'prestacao__componentes'
        ).order_by('-data_upload')

        # Parâmetros da query
        params = self.request.query_params

        # Filtro por período (data_emissao)
        data_inicio = params.get('data_inicio')
        data_fim = params.get('data_fim')
        
        if data_inicio:
            try:
                data_inicio_dt = datetime.strptime(data_inicio, '%Y-%m-%d').date()
                queryset = queryset.filter(identificacao__data_emissao__date__gte=data_inicio_dt)
            except ValueError:
                logger.warning(f"Data início inválida: {data_inicio}")
        
        if data_fim:
            try:
                # Adiciona 1 dia para incluir todo o dia final
                data_fim_dt = datetime.strptime(data_fim, '%Y-%m-%d').date() + timedelta(days=1)
                queryset = queryset.filter(identificacao__data_emissao__date__lt=data_fim_dt)
            except ValueError:
                logger.warning(f"Data fim inválida: {data_fim}")

        # Filtro por modalidade (CIF/FOB)
        modalidade = params.get('modalidade')
        if modalidade in ['CIF', 'FOB']:
            queryset = queryset.filter(modalidade=modalidade)

        # Filtros por CNPJ
        emitente_cnpj = params.get('emitente_cnpj')
        if emitente_cnpj:
            queryset = queryset.filter(emitente__cnpj=emitente_cnpj)

        remetente_cnpj = params.get('remetente_cnpj')
        if remetente_cnpj:
            queryset = queryset.filter(remetente__cnpj=remetente_cnpj)

        destinatario_cnpj = params.get('destinatario_cnpj')
        if destinatario_cnpj:
            queryset = queryset.filter(destinatario__cnpj=destinatario_cnpj)

        # Filtros por UF
        uf_ini = params.get('uf_ini')
        if uf_ini:
            queryset = queryset.filter(identificacao__uf_ini=uf_ini)

        uf_fim = params.get('uf_fim')
        if uf_fim:
            queryset = queryset.filter(identificacao__uf_fim=uf_fim)

        # Filtro por placa
        placa = params.get('placa')
        if placa:
            queryset = queryset.filter(
                modal_rodoviario__veiculos__placa__iexact=placa
            )

        # Filtro por status de processamento
        processado = params.get('processado')
        if processado is not None:
            is_processed = processado.lower() in ['true', '1', 'sim']
            queryset = queryset.filter(processado=is_processed)

        # Filtro por status de autorização
        autorizado = params.get('autorizado')
        if autorizado is not None:
            is_authorized = autorizado.lower() in ['true', '1', 'sim']
            if is_authorized:
                queryset = queryset.filter(protocolo__codigo_status=100)
            else:
                queryset = queryset.filter(
                    Q(protocolo__isnull=True) | ~Q(protocolo__codigo_status=100)
                )

        # Filtro por status de cancelamento
        cancelado = params.get('cancelado')
        if cancelado is not None:
            is_canceled = cancelado.lower() in ['true', '1', 'sim']
            if is_canceled:
                queryset = queryset.filter(cancelamento__c_stat=135)
            else:
                queryset = queryset.filter(
                    Q(cancelamento__isnull=True) | ~Q(cancelamento__c_stat=135)
                )

        # Filtro por texto (busca geral)
        texto = params.get('q')
        if texto:
            queryset = queryset.filter(
                Q(chave__icontains=texto) |
                Q(identificacao__numero__icontains=texto) |
                Q(remetente__razao_social__icontains=texto) |
                Q(destinatario__razao_social__icontains=texto) |
                Q(emitente__razao_social__icontains=texto)
            )

        # Ordenação customizada
        ordering = params.get('ordering')
        if ordering:
            # Valida campos de ordenação para evitar injeção
            valid_orderings = [
                'data_upload', '-data_upload',
                'identificacao__data_emissao', '-identificacao__data_emissao',
                'identificacao__numero', '-identificacao__numero',
                'prestacao__valor_total_prestado', '-prestacao__valor_total_prestado'
            ]
            if ordering in valid_orderings:
                queryset = queryset.order_by(ordering)

        return queryset.distinct()

    @action(detail=False, methods=['get'])
    def export(self, request):
        """
        Exporta os CT-es filtrados para CSV.
        
        Usa os mesmos filtros da listagem.
        Retorna arquivo CSV com encoding UTF-8 BOM para Excel.
        """
        # Obtém queryset filtrado
        queryset = self.get_queryset()
        
        # Limita a quantidade de registros para evitar timeout
        max_export = 10000
        if queryset.count() > max_export:
            return Response(
                {"error": f"Limite de exportação excedido. Máximo {max_export} registros."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Gera o CSV
        csv_content = generate_csv_from_queryset(queryset, CTeDocumentoListSerializer)
        
        # Prepara a resposta HTTP
        filename = f"ctes_export_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        # Adiciona BOM para UTF-8 (melhora compatibilidade com Excel)
        response.write('\ufeff')
        response.write(csv_content)
        
        return response

    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        """
        Download do XML original do CT-e.
        
        Retorna o arquivo XML com o nome correto.
        """
        cte = self.get_object()

        if not cte.xml_original:
            return Response(
                {"error": "XML não disponível para este CT-e."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Determina o encoding do XML
        encoding = 'utf-8'
        if cte.xml_original.startswith('<?xml') and 'encoding=' in cte.xml_original[:100]:
            try:
                start = cte.xml_original.index('encoding="') + 10
                end = cte.xml_original.index('"', start)
                encoding = cte.xml_original[start:end].lower()
            except:
                pass

        # Retorna o XML
        response = HttpResponse(
            cte.xml_original,
            content_type=f'application/xml; charset={encoding}'
        )
        response['Content-Disposition'] = f'attachment; filename="CTe_{cte.chave}.xml"'
        
        return response

    @action(detail=True, methods=['get'])
    def dacte(self, request, pk=None):
        """
        Gera o DACTE (PDF) do CT-e.
        
        Atualmente retorna JSON com dados para implementação futura.
        Em produção, deve gerar PDF real usando biblioteca apropriada.
        """
        cte = self.get_object()

        # Validações
        if not hasattr(cte, 'protocolo') or not cte.protocolo:
            return Response(
                {"error": "CT-e não possui protocolo de autorização."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if cte.protocolo.codigo_status != 100:
            return Response(
                {"error": f"CT-e não autorizado. Status: {cte.protocolo.codigo_status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if hasattr(cte, 'cancelamento') and cte.cancelamento and cte.cancelamento.c_stat == 135:
            return Response(
                {"error": "CT-e cancelado. DACTE não disponível."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Gera o PDF do DACTE
        try:
            # Gera o PDF
            pdf_content = gerar_dacte_pdf(cte)
            
            # Prepara a resposta HTTP
            response = HttpResponse(pdf_content, content_type='application/pdf')
            
            # Define o nome do arquivo e como será exibido
            # 'inline' exibe no navegador, 'attachment' força download
            disposition = request.GET.get('download', 'inline')
            if disposition not in ['inline', 'attachment']:
                disposition = 'inline'
                
            filename = f"DACTE_{cte.chave}.pdf"
            response['Content-Disposition'] = f'{disposition}; filename="{filename}"'
            
            # Headers adicionais para cache
            response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response['Pragma'] = 'no-cache'
            response['Expires'] = '0'
            
            # Log de sucesso
            logger.info(f"DACTE gerado com sucesso para CT-e {cte.chave}")
            
            return response
            
        except Exception as e:
            logger.error(f"Erro ao gerar DACTE: {str(e)}", exc_info=True)
            
            # Em caso de erro, retorna os dados em JSON como fallback
            identificacao = cte.identificacao
            emitente = cte.emitente
            remetente = cte.remetente
            destinatario = cte.destinatario
            prestacao = cte.prestacao if hasattr(cte, 'prestacao') else None
            
            # Monta resposta com dados essenciais
            dacte_data = {
                "tipo": "DACTE_PREVIEW",
                "mensagem": "Geração de PDF em implementação. Dados do DACTE:",
                "cte": {
                    "chave": cte.chave,
                    "numero": identificacao.numero,
                    "serie": identificacao.serie,
                    "modelo": identificacao.modelo,
                    "data_emissao": identificacao.data_emissao.strftime('%d/%m/%Y %H:%M:%S'),
                    "natureza_operacao": identificacao.natureza_operacao,
                    "tipo_cte": identificacao.tipo_cte,
                    "modal": identificacao.modal,
                    "tipo_servico": identificacao.tipo_servico,
                    "cfop": identificacao.cfop,
                    "inicio_prestacao": {
                        "municipio": identificacao.nome_mun_ini,
                        "uf": identificacao.uf_ini
                    },
                    "fim_prestacao": {
                        "municipio": identificacao.nome_mun_fim,
                        "uf": identificacao.uf_fim
                    }
                },
                "emitente": {
                    "cnpj": emitente.cnpj,
                    "ie": emitente.ie,
                    "razao_social": emitente.razao_social,
                    "nome_fantasia": emitente.nome_fantasia,
                    "endereco": {
                        "logradouro": emitente.logradouro,
                        "numero": emitente.numero,
                        "bairro": emitente.bairro,
                        "municipio": emitente.nome_municipio,
                        "uf": emitente.uf,
                        "cep": emitente.cep
                    },
                    "telefone": emitente.telefone
                } if emitente else None,
                "remetente": {
                    "cnpj": remetente.cnpj or remetente.cpf,
                    "ie": remetente.ie,
                    "razao_social": remetente.razao_social,
                    "endereco": {
                        "logradouro": remetente.logradouro,
                        "numero": remetente.numero,
                        "municipio": remetente.nome_municipio,
                        "uf": remetente.uf
                    }
                } if remetente else None,
                "destinatario": {
                    "cnpj": destinatario.cnpj or destinatario.cpf,
                    "ie": destinatario.ie,
                    "razao_social": destinatario.razao_social,
                    "endereco": {
                        "logradouro": destinatario.logradouro,
                        "numero": destinatario.numero,
                        "municipio": destinatario.nome_municipio,
                        "uf": destinatario.uf
                    }
                } if destinatario else None,
                "valores": {
                    "valor_total": float(prestacao.valor_total_prestado),
                    "valor_receber": float(prestacao.valor_recebido),
                    "componentes": [
                        {
                            "nome": comp.nome,
                            "valor": float(comp.valor)
                        } for comp in prestacao.componentes.all()
                    ] if prestacao else []
                } if prestacao else None,
                "protocolo": {
                    "numero": cte.protocolo.numero_protocolo,
                    "data": cte.protocolo.data_recebimento.strftime('%d/%m/%Y %H:%M:%S'),
                    "codigo_status": cte.protocolo.codigo_status,
                    "motivo": cte.protocolo.motivo_status
                },
                "modalidade_frete": cte.modalidade or "N/I",
                "qrcode_url": cte.suplementar.qr_code_url if hasattr(cte, 'suplementar') and cte.suplementar else None
            }
            
            return Response(dacte_data)
            
        except Exception as e:
            logger.error(f"Erro ao preparar dados do DACTE: {str(e)}")
            return Response(
                {"error": "Erro ao processar dados do DACTE."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def reprocessar(self, request, pk=None):
        """
        Reprocessa o XML do CT-e.
        
        Útil quando houve alteração no parser ou erro no processamento inicial.
        Requer que o XML original esteja disponível.
        """
        cte = self.get_object()

        # Validações
        if not cte.xml_original:
            return Response(
                {"error": "XML original não encontrado. Reprocessamento impossível."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if hasattr(cte, 'cancelamento') and cte.cancelamento:
            return Response(
                {"error": "CT-e cancelado não pode ser reprocessado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Log da operação
        logger.info(f"Iniciando reprocessamento do CT-e {cte.chave} por {request.user}")

        # Reset do status
        cte.processado = False
        cte.save(update_fields=['processado'])

        try:
            # Executa o parser
            resultado = parse_cte_completo(cte)
            
            if resultado:
                # Atualiza timestamp
                cte.refresh_from_db()
                
                # Prepara resposta com novo status
                response_data = {
                    "message": "CT-e reprocessado com sucesso.",
                    "cte": {
                        "chave": cte.chave,
                        "processado": cte.processado,
                        "numero": cte.identificacao.numero if hasattr(cte, 'identificacao') else None,
                        "data_emissao": cte.identificacao.data_emissao.isoformat() if hasattr(cte, 'identificacao') else None,
                        "status": "Autorizado" if hasattr(cte, 'protocolo') and cte.protocolo and cte.protocolo.codigo_status == 100 else "Pendente"
                    }
                }
                
                logger.info(f"CT-e {cte.chave} reprocessado com sucesso")
                return Response(response_data)
            else:
                logger.error(f"Parser retornou False para CT-e {cte.chave}")
                return Response(
                    {"error": "Falha no reprocessamento. Verifique se o XML está válido."},
                    status=status.HTTP_422_UNPROCESSABLE_ENTITY
                )
                
        except Exception as e:
            logger.error(f"Erro ao reprocessar CT-e {cte.chave}: {str(e)}", exc_info=True)
            
            # Garante que fica marcado como não processado
            CTeDocumento.objects.filter(pk=cte.pk).update(processado=False)
            
            return Response(
                {"error": f"Erro durante o reprocessamento: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def estatisticas(self, request):
        """
        Retorna estatísticas gerais dos CT-es.
        
        Útil para dashboards e relatórios.
        """
        queryset = self.get_queryset()
        
        # Calcula estatísticas
        stats = queryset.aggregate(
            total=Count('id'),
            processados=Count('id', filter=Q(processado=True)),
            autorizados=Count('id', filter=Q(protocolo__codigo_status=100)),
            cancelados=Count('id', filter=Q(cancelamento__c_stat=135)),
            valor_total=Sum('prestacao__valor_total_prestado'),
            valor_receber=Sum('prestacao__valor_recebido')
        )
        
        # Estatísticas por modalidade
        por_modalidade = queryset.values('modalidade').annotate(
            quantidade=Count('id'),
            valor_total=Sum('prestacao__valor_total_prestado')
        ).order_by('modalidade')
        
        # Estatísticas por UF
        por_uf = queryset.values('identificacao__uf_fim').annotate(
            quantidade=Count('id'),
            valor_total=Sum('prestacao__valor_total_prestado')
        ).order_by('-quantidade')[:10]
        
        return Response({
            "resumo": {
                "total": stats['total'] or 0,
                "processados": stats['processados'] or 0,
                "autorizados": stats['autorizados'] or 0,
                "cancelados": stats['cancelados'] or 0,
                "valor_total": float(stats['valor_total'] or 0),
                "valor_receber": float(stats['valor_receber'] or 0)
            },
            "por_modalidade": list(por_modalidade),
            "top_destinos": list(por_uf)
        })