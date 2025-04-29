# transport/views.py

import xmltodict
import traceback
import calendar
from datetime import date, timedelta, datetime as dt
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.db import transaction, models
from django.db.models import (
    Sum, Count, Avg, F, Q, Case, When, Value, Subquery, OuterRef,
    DecimalField, CharField, DateField, FloatField, IntegerField, Min, Max
)
from django.db.models.functions import Coalesce, TruncMonth, ExtractMonth, ExtractYear, TruncDay, TruncWeek
from django.http import HttpResponse

# Importações do DRF
from rest_framework import viewsets, status, permissions, mixins
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from rest_framework.exceptions import ParseError, ValidationError, NotFound, PermissionDenied, APIException

# Importar Modelos
from .models import (
    CTeDocumento, CTeIdentificacao, CTePrestacaoServico, CTeRemetente, CTEDestinatario,
    CTeCancelamento, CTeEmitente, CTeExpedidor, CTeTributos, CTeModalRodoviario, CTeVeiculoRodoviario,
    MDFeDocumento, MDFeTotais, MDFeDocumentosVinculados, MDFeCancelamento, MDFeVeiculoTracao,
    MDFeIdentificacao, MDFeEmitente, MDFeModalRodoviario, MDFeVeiculoReboque, MDFeCondutor,
    Veiculo, ManutencaoVeiculo,
    PagamentoAgregado, PagamentoProprio, FaixaKM
)

# Importar Serializers
from .serializers import (
    UploadXMLSerializer,
    CTeDocumentoDetailSerializer, CTeDocumentoListSerializer,
    MDFeDocumentoDetailSerializer, MDFeDocumentoListSerializer,
    VeiculoSerializer, ManutencaoVeiculoSerializer,
    PagamentoAgregadoSerializer, PagamentoProprioSerializer, FaixaKMSerializer,
    DashboardGeralDataSerializer, FinanceiroPainelSerializer, FinanceiroMensalSerializer,
    FinanceiroDetalheSerializer, CtePainelSerializer, MdfePainelSerializer,
    GeograficoPainelSerializer, ManutencaoIndicadoresSerializer, ManutencaoGraficosSerializer, 
    AlertaPagamentoSerializer
)

# Importar Parsers
from .services.parser_cte import parse_cte_completo
from .services.parser_mdfe import parse_mdfe_completo
from .services.parser_eventos import parse_evento

# --- Funções Auxiliares ---
def get_date_filters(request, default_days=30):
    """Helper para obter e validar filtros de data (padrão: últimos N dias)."""
    today = date.today()
    date_to_str = request.query_params.get('date_to', today.strftime('%Y-%m-%d'))
    default_date_from = today - timedelta(days=default_days)
    date_from_str = request.query_params.get('date_from', default_date_from.strftime('%Y-%m-%d'))

    try:
        date_to = dt.strptime(date_to_str, '%Y-%m-%d').date()
    except ValueError:
        date_to = today
        print(f"WARN: Data 'date_to' inválida: '{date_to_str}'. Usando padrão: {today.strftime('%Y-%m-%d')}")

    try:
        date_from = dt.strptime(date_from_str, '%Y-%m-%d').date()
    except ValueError:
        date_from = default_date_from
        print(f"WARN: Data 'date_from' inválida: '{date_from_str}'. Usando padrão: {default_date_from.strftime('%Y-%m-%d')}")

    if date_from > date_to:
        print(f"WARN: 'date_from' ({date_from}) posterior a 'date_to' ({date_to}). Invertendo datas.")
        date_from, date_to = date_to, date_from # Inverte

    return date_from, date_to

def get_encoding(xml_bytes):
    """Tenta detectar o encoding do XML (UTF-8 ou Latin-1)."""
    try:
        xml_bytes.decode('utf-8')
        return 'utf-8'
    except UnicodeDecodeError:
        try:
            xml_bytes.decode('latin-1')
            return 'latin-1'
        except UnicodeDecodeError:
            return None

# ===============================================
# ===      ENDPOINT UNIFICADO DE UPLOAD       ===
# ===============================================

class UnifiedUploadViewSet(viewsets.ViewSet):
    """
    Endpoint unificado para upload e processamento de XML (CT-e, MDF-e, Eventos).
    Recebe 'arquivo_xml' e opcionalmente 'arquivo_xml_retorno'.
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UploadXMLSerializer # Para descrever no browsable API

    def create(self, request, *args, **kwargs):
        serializer = UploadXMLSerializer(data=request.data) # Validação inicial
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        arquivo_principal = serializer.validated_data['arquivo_xml']
        arquivo_retorno = serializer.validated_data.get('arquivo_xml_retorno')

        # --- Leitura e Detecção de Encoding ---
        try:
            xml_principal_bytes = arquivo_principal.read()
            encoding_principal = get_encoding(xml_principal_bytes)
            if not encoding_principal:
                raise ParseError('Não foi possível determinar o encoding do XML principal (tente UTF-8 ou Latin-1).')
            xml_principal_text = xml_principal_bytes.decode(encoding_principal)

            xml_retorno_text = None
            if arquivo_retorno:
                xml_retorno_bytes = arquivo_retorno.read()
                encoding_retorno = get_encoding(xml_retorno_bytes) or encoding_principal
                try:
                    xml_retorno_text = xml_retorno_bytes.decode(encoding_retorno)
                except UnicodeDecodeError:
                     raise ParseError(f'Não foi possível decodificar o XML de retorno usando {encoding_retorno}.')

        except Exception as read_err:
            raise ParseError(f'Erro ao ler/decodificar arquivo(s) XML: {read_err}')

        # --- Parsing Inicial e Identificação ---
        try:
            # Usar deepcopy se o parser modificar o dict original? xmltodict geralmente não modifica.
            doc_dict = xmltodict.parse(xml_principal_text)
            tipo_documento, chave_documento, versao_documento = self._identificar_xml(doc_dict)
        except Exception as parse_err:
            raise ParseError(f'Erro ao parsear ou identificar o tipo do XML principal: {parse_err}')

        if not tipo_documento:
             raise ValidationError({'detail': 'Tipo do XML não identificado (esperado CT-e, MDF-e ou Evento).'})

        # --- Processamento Específico ---
        try:
            arquivo_principal.seek(0) # Volta o ponteiro para salvar

            # Usar transação para garantir atomicidade na criação/atualização do DB
            with transaction.atomic():
                if tipo_documento == 'CTE':
                    response_data, status_code = self._processar_cte(
                        request, chave_documento, versao_documento, xml_principal_text, arquivo_principal
                    )
                elif tipo_documento == 'MDFE':
                    response_data, status_code = self._processar_mdfe(
                        request, chave_documento, versao_documento, xml_principal_text, arquivo_principal
                    )
                elif tipo_documento == 'EVENTO':
                    response_data, status_code = self._processar_evento(
                        request, xml_principal_text, xml_retorno_text, arquivo_principal.name
                    )
                else:
                    # Segurança: caso a identificação falhe silenciosamente
                    raise APIException("Erro interno: Tipo de documento desconhecido.")

            return Response(response_data, status=status_code)

        # Captura exceções conhecidas levantadas pelos métodos _processar_* ou _identificar_xml
        except (ValidationError, ParseError, NotFound,
        PermissionDenied, APIException) as api_exc:   #  ← acrescente APIException aqui
            raise api_exc
        # Captura qualquer outra exceção inesperada
        except Exception as e:
            print(f"ERRO CRÍTICO no Upload: Tipo={tipo_documento}, Chave={chave_documento}, Erro={e}\n{traceback.format_exc()}")
            # Retorna um erro 500 genérico para o cliente
            raise APIException(f'Erro interno inesperado ao processar {tipo_documento}. Contate o suporte.', code=status.HTTP_500_INTERNAL_SERVER_ERROR)


    def _identificar_xml(self, doc_dict):
        """Identifica o tipo, chave e versão do XML. Levanta ValueError se inválido."""
        chave = None
        versao = None

        # Tenta CT-e (várias estruturas possíveis)
        proc_cte = doc_dict.get('procCTe')
        cte_proc = doc_dict.get('cteProc')
        cte_node = None
        infcte_node = None
        if proc_cte and isinstance(proc_cte.get('CTe'), dict):
            cte_node = proc_cte['CTe']
            infcte_node = cte_node.get('infCte')
            versao = proc_cte.get('@versao') or cte_node.get('@versao')
        elif cte_proc and isinstance(cte_proc.get('CTe'), dict):
            cte_node = cte_proc['CTe']
            infcte_node = cte_node.get('infCte')
            versao = cte_proc.get('@versao') or cte_node.get('@versao')
        elif isinstance(doc_dict.get('CTe'), dict):
             cte_node = doc_dict['CTe']
             infcte_node = cte_node.get('infCte')
             versao = cte_node.get('@versao')

        if infcte_node and isinstance(infcte_node, dict) and infcte_node.get('@Id','').startswith('CTe'):
            chave = infcte_node.get('@Id', '').replace('CTe', '', 1)
            if not versao: versao = infcte_node.get('@versao', 'N/A') # Tenta pegar versão do infCte
            if len(chave) == 44: return 'CTE', chave, versao
            else: raise ValueError(f"Chave CT-e inválida encontrada: {chave}") # Erro se chave incompleta

        # Tenta MDF-e (várias estruturas possíveis)
        proc_mdfe = doc_dict.get('procMDFe')
        mdfe_proc = doc_dict.get('mdfeProc')
        mdfe_node = None
        infmdfe_node = None
        if proc_mdfe and isinstance(proc_mdfe.get('MDFe'), dict):
            mdfe_node = proc_mdfe['MDFe']
            infmdfe_node = mdfe_node.get('infMDFe')
            versao = proc_mdfe.get('@versao') or mdfe_node.get('@versao')
        elif mdfe_proc and isinstance(mdfe_proc.get('MDFe'), dict):
            mdfe_node = mdfe_proc['MDFe']
            infmdfe_node = mdfe_node.get('infMDFe')
            versao = mdfe_proc.get('@versao') or mdfe_node.get('@versao')
        elif isinstance(doc_dict.get('MDFe'), dict):
             mdfe_node = doc_dict['MDFe']
             infmdfe_node = mdfe_node.get('infMDFe')
             versao = mdfe_node.get('@versao')

        if infmdfe_node and isinstance(infmdfe_node, dict) and infmdfe_node.get('@Id','').startswith('MDFe'):
            chave = infmdfe_node.get('@Id', '').replace('MDFe', '', 1)
            if not versao: versao = infmdfe_node.get('@versao', 'N/A') # Tenta pegar versão do infMDFe
            if len(chave) == 44: return 'MDFE', chave, versao
            else: raise ValueError(f"Chave MDF-e inválida encontrada: {chave}") # Erro se chave incompleta

        # Tenta Evento (várias estruturas possíveis)
        evento_cte = doc_dict.get('eventoCTe') or doc_dict.get('procEventoCTe', {}).get('eventoCTe')
        evento_mdfe = doc_dict.get('eventoMDFe') or doc_dict.get('procEventoMDFe', {}).get('eventoMDFe')
        if (evento_cte and isinstance(evento_cte.get('infEvento'), dict)) or \
           (evento_mdfe and isinstance(evento_mdfe.get('infEvento'), dict)):
            # Evento identificado, chave/versão do doc principal não são relevantes aqui
            return 'EVENTO', None, None

        # Se chegou aqui, não identificou nenhum tipo conhecido
        return None, None, None

    def _processar_cte(self, request, chave, versao, xml_text, arquivo):
        """Processa um XML identificado como CT-e. Levanta erro em caso de falha."""
        print(f"INFO: Processando CT-e Chave: {chave}")
        if CTeDocumento.objects.filter(chave=chave).exists():
            # Levanta erro de conflito que será tratado pela view principal
            raise APIException(detail=f'CT-e com a chave {chave} já existe.', code=status.HTTP_409_CONFLICT)

        cte_doc = CTeDocumento(
            arquivo_xml=arquivo, # Associa o arquivo
            xml_original=xml_text,
            chave=chave,
            versao=versao if versao != 'N/A' else None,
            processado=False
        )
        # Valida o modelo antes de salvar (opcional, mas bom)
        cte_doc.full_clean()
        cte_doc.save() # Salva o registro base primeiro

        # Chama parser completo. Se falhar, a transação será revertida.
        sucesso_parse = parse_cte_completo(cte_doc) # Passa a instância salva

        if sucesso_parse:
            serializer = CTeDocumentoListSerializer(cte_doc) # Retorna resumo
            return serializer.data, status.HTTP_201_CREATED
        else:
            # Se o parser retornou False, algo deu errado DENTRO do parser.
            # A transação DEVERIA ter sido revertida pelo @atomic do parser.
            # Levanta um erro 500 para indicar falha interna.
            raise APIException(detail=f'Erro interno no processamento detalhado do CT-e {chave}. Ver logs.', code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _processar_mdfe(self, request, chave, versao, xml_text, arquivo):
        """Processa um XML identificado como MDF-e. Levanta erro em caso de falha."""
        print(f"INFO: Processando MDF-e Chave: {chave}")
        if MDFeDocumento.objects.filter(chave=chave).exists():
            raise APIException(detail=f'MDF-e com a chave {chave} já existe.', code=status.HTTP_409_CONFLICT)

        mdfe_doc = MDFeDocumento(
            arquivo_xml=arquivo,
            xml_original=xml_text,
            chave=chave,
            versao=versao if versao != 'N/A' else None,
            processado=False
        )
        mdfe_doc.full_clean()
        mdfe_doc.save()

        sucesso_parse = parse_mdfe_completo(mdfe_doc)
        if sucesso_parse:
            serializer = MDFeDocumentoListSerializer(mdfe_doc)
            return serializer.data, status.HTTP_201_CREATED
        else:
            raise APIException(detail=f'Erro interno no processamento detalhado do MDF-e {chave}. Ver logs.', code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _processar_evento(self, request, xml_evento_text, xml_retorno_text, nome_arquivo):
        """Processa um XML identificado como Evento. Levanta erro em caso de falha."""
        print(f"INFO: Processando Evento XML: {nome_arquivo}")
        try:
            # O parser de eventos deve levantar exceções específicas (ValueError, ObjectDoesNotExist)
            # ou retornar True/Model/None/False
            resultado_parser = parse_evento(xml_evento_text, xml_retorno_text)

            if resultado_parser is True:
                return {'detail': 'Evento processado e aplicado com sucesso.'}, status.HTTP_200_OK
            elif isinstance(resultado_parser, models.Model):
                 return {'detail': 'Evento registrado com sucesso.', 'tipo': type(resultado_parser).__name__, 'id': resultado_parser.pk}, status.HTTP_200_OK
            elif resultado_parser is None:
                 return {'detail': 'Evento recebido, mas não aplicável ou não suportado.'}, status.HTTP_202_ACCEPTED
            else: # False
                 # Indica que o parser encontrou um problema interno não esperado
                 raise APIException(detail='Erro interno ao processar o evento. Ver logs.', code=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except ValueError as ve:
            # Erro esperado do parser (ex: doc não existe, dados inválidos no evento)
            # Se for ObjectDoesNotExist, retorna 404, senão 400.
            if "não encontrado" in str(ve):
                raise NotFound(f'{ve}')
            else:
                raise ValidationError(f'{ve}')
        except Exception as e:
             # Qualquer outro erro dentro do parser de eventos
             print(f"ERRO CRÍTICO no Processamento de Evento: {nome_arquivo}, Erro={e}\n{traceback.format_exc()}")
             raise APIException(f'Erro interno inesperado ao processar evento {nome_arquivo}.')


# ===============================================
# ===        VIEWSETS PARA CONSULTA/CRUD      ===
# ===============================================

class CTeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """Endpoint Read-Only para listar e detalhar CT-es."""
    permission_classes = [permissions.IsAuthenticated]
    queryset = CTeDocumento.objects.all() # Otimizado em get_queryset

    def get_serializer_class(self):
        return CTeDocumentoListSerializer if self.action == 'list' else CTeDocumentoDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            'identificacao', 'remetente', 'destinatario', 'prestacao', 'protocolo', 'cancelamento', 'modal_rodoviario'
        )
        if self.action == 'retrieve':
             qs = qs.prefetch_related(
                 'documentos_transportados', 'seguros', 'autorizados_xml',
                 'prestacao__componentes', 'modal_rodoviario__veiculos', 'modal_rodoviario__motoristas',
                 'complemento__observacoes_contribuinte', 'complemento__observacoes_fisco'
             )
        # Verifica se há filtros ativos
        usando_filtro = 'date_from' in self.request.query_params or 'date_to' in self.request.query_params
        
        if usando_filtro:
            date_from, date_to = get_date_filters(self.request)
            # Garante que identificacao não seja nulo para filtrar data_emissao
            qs = qs.filter(identificacao__isnull=False, identificacao__data_emissao__date__range=[date_from, date_to])
        else:
            # Sem filtro de data, mostra todos os documentos
            qs = qs.filter(identificacao__isnull=False)
            
        return qs.order_by('-identificacao__data_emissao')

    @action(detail=True, methods=['get'], url_path='xml')
    def get_xml_content(self, request, pk=None):
        """Retorna o conteúdo XML original do CT-e."""
        cte = self.get_object()
        xml_content = cte.xml_original
        content_type = 'application/xml'
        if xml_content:
            encoding = get_encoding(xml_content.encode('latin-1')) # Tenta detectar
            if encoding: content_type = f'application/xml; charset={encoding}'
            return HttpResponse(xml_content, content_type=content_type)
        elif cte.arquivo_xml:
            try:
                with cte.arquivo_xml.open('rb') as f: xml_bytes = f.read()
                encoding = get_encoding(xml_bytes)
                if encoding:
                    content_type = f'application/xml; charset={encoding}'
                    return HttpResponse(xml_bytes.decode(encoding), content_type=content_type)
                else: # Fallback para bytes se não detectar encoding
                    return HttpResponse(xml_bytes, content_type='application/octet-stream')
            except Exception as e: raise APIException(f'Erro ao ler arquivo XML: {e}')
        else: raise NotFound('Conteúdo XML não encontrado.')

    @action(detail=True, methods=['get'], url_path='dacte')
    def get_dacte(self, request, pk=None):
        """Gera e retorna o DACTE (Documento Auxiliar do CT-e) em formato PDF."""
        cte = self.get_object()
        
        # Verificar se o CT-e está autorizado
        if not hasattr(cte, 'protocolo') or not cte.protocolo or cte.protocolo.codigo_status != 100:
            return Response(
                {"detail": "Não é possível gerar DACTE para CT-e não autorizado."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Verificar se o CT-e está cancelado
        if hasattr(cte, 'cancelamento') and cte.cancelamento and cte.cancelamento.c_stat == 135:
            return Response(
                {"detail": "Não é possível gerar DACTE para CT-e cancelado."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Implementação futura: integração com gerador de DACTE
        # Por enquanto, retorna uma mensagem informando que a funcionalidade está em desenvolvimento
        return Response(
            {"detail": "Geração de DACTE em desenvolvimento."},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )


class MDFeDocumentoViewSet(viewsets.ReadOnlyModelViewSet):
    """Endpoint Read-Only para listar e detalhar MDF-es."""
    permission_classes = [permissions.IsAuthenticated]
    queryset = MDFeDocumento.objects.all() # Otimizado em get_queryset

    def get_serializer_class(self):
        return MDFeDocumentoListSerializer if self.action == 'list' else MDFeDocumentoDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            'identificacao', 'emitente', 'protocolo', 'cancelamento',
            'modal_rodoviario__veiculo_tracao', 'totais',
        )
        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                 'identificacao__municipios_carregamento', 'identificacao__percurso',
                 'modal_rodoviario__veiculos_reboque', 'modal_rodoviario__ciots',
                 'modal_rodoviario__vales_pedagio', 'modal_rodoviario__contratantes',
                 'condutores', 'municipios_descarga__docs_vinculados_municipio__produtos_perigosos',
                 'seguros_carga__averbacoes', 'lacres_rodoviarios', 'autorizados_xml'
            )
            
        # Verifica se há filtros ativos
        usando_filtro = 'date_from' in self.request.query_params or 'date_to' in self.request.query_params
        
        if usando_filtro:
            date_from, date_to = get_date_filters(self.request)
            qs = qs.filter(identificacao__isnull=False, identificacao__dh_emi__date__range=[date_from, date_to])
        else:
            # Sem filtro de data, mostra todos os documentos
            qs = qs.filter(identificacao__isnull=False)
            
        return qs.order_by('-identificacao__dh_emi')

    @action(detail=True, methods=['get'], url_path='xml')
    def get_xml_content(self, request, pk=None):
        """Retorna o conteúdo XML original do MDF-e."""
        # (Mesma implementação do CTeDocumentoViewSet.xml)
        mdfe = self.get_object()
        xml_content = mdfe.xml_original
        content_type = 'application/xml'
        if xml_content:
            encoding = get_encoding(xml_content.encode('latin-1'))
            if encoding: content_type = f'application/xml; charset={encoding}'
            return HttpResponse(xml_content, content_type=content_type)
        elif mdfe.arquivo_xml:
             try:
                with mdfe.arquivo_xml.open('rb') as f: xml_bytes = f.read()
                encoding = get_encoding(xml_bytes)
                if encoding:
                    content_type = f'application/xml; charset={encoding}'
                    return HttpResponse(xml_bytes.decode(encoding), content_type=content_type)
                else: return HttpResponse(xml_bytes, content_type='application/octet-stream')
             except Exception as e: raise APIException(f'Erro ao ler arquivo XML: {e}')
        else: raise NotFound('Conteúdo XML não encontrado.')

    @action(detail=True, methods=['get'], url_path='damdfe')
    def get_damdfe(self, request, pk=None):
        """Gera e retorna o DAMDFE (Documento Auxiliar do MDF-e) em formato PDF."""
        mdfe = self.get_object()
        
        # Verificar se o MDF-e está autorizado
        if not hasattr(mdfe, 'protocolo') or not mdfe.protocolo or mdfe.protocolo.codigo_status != 100:
            return Response(
                {"detail": "Não é possível gerar DAMDFE para MDF-e não autorizado."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Verificar se o MDF-e está cancelado
        if hasattr(mdfe, 'cancelamento') and mdfe.cancelamento and mdfe.cancelamento.c_stat == 135:
            return Response(
                {"detail": "Não é possível gerar DAMDFE para MDF-e cancelado."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Implementação futura: integração com gerador de DAMDFE
        # Por enquanto, retorna uma mensagem informando que a funcionalidade está em desenvolvimento
        return Response(
            {"detail": "Geração de DAMDFE em desenvolvimento."},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )


class VeiculoViewSet(viewsets.ModelViewSet):
    """Endpoint para CRUD completo de Veículos."""
    queryset = Veiculo.objects.all().order_by('placa')
    serializer_class = VeiculoSerializer
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=True, methods=['get'], url_path='estatisticas')
    def get_estatisticas(self, request, pk=None):
        """Retorna estatísticas detalhadas do veículo."""
        veiculo = self.get_object()
        
        # Quantidade de CT-es e MDF-es vinculados
        ctes_vinculados = CTeVeiculoRodoviario.objects.filter(placa=veiculo.placa).count()
        mdfes_tracao = MDFeVeiculoTracao.objects.filter(placa=veiculo.placa).count()
        mdfes_reboque = MDFeVeiculoReboque.objects.filter(placa=veiculo.placa).count()
        
        # Estatísticas de manutenção
        manutencoes = ManutencaoVeiculo.objects.filter(veiculo=veiculo)
        total_manutencoes = manutencoes.count()
        total_gasto = manutencoes.aggregate(total=Coalesce(Sum('valor_total'), Decimal('0.00')))['total']
        manutencoes_pendentes = manutencoes.filter(status='PENDENTE').count()
        ultima_manutencao = manutencoes.order_by('-data_servico').first()
        ultima_data = ultima_manutencao.data_servico if ultima_manutencao else None
        
        # Kilometragem estimada (baseada nos CT-es)
        km_rodado = CTeIdentificacao.objects.filter(
            cte__modal_rodoviario__veiculos__placa=veiculo.placa,
            cte__cancelamento__isnull=True
        ).aggregate(total=Coalesce(Sum('dist_km'), 0))['total']
        
        # Retorna os dados
        return Response({
            'placa': veiculo.placa,
            'ctes_vinculados': ctes_vinculados,
            'mdfes_vinculados': mdfes_tracao + mdfes_reboque,
            'total_manutencoes': total_manutencoes,
            'total_gasto_manutencao': total_gasto,
            'manutencoes_pendentes': manutencoes_pendentes,
            'ultima_manutencao': ultima_data,
            'km_rodado_estimado': km_rodado
        })


class ManutencaoVeiculoViewSet(viewsets.ModelViewSet):
    """Endpoint CRUD aninhado para Manutenções (/veiculos/{veiculo_pk}/manutencoes/)."""
    serializer_class = ManutencaoVeiculoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        veiculo_pk = self.kwargs.get('veiculo_pk')
        get_object_or_404(Veiculo, pk=veiculo_pk)
        queryset = ManutencaoVeiculo.objects.filter(veiculo_id=veiculo_pk)
        
        # Verifica se há filtros ativos
        usando_filtro = 'date_from' in self.request.query_params or 'date_to' in self.request.query_params
        
        if usando_filtro:
            date_from, date_to = get_date_filters(self.request)
            return queryset.filter(data_servico__range=[date_from, date_to]).order_by('-data_servico')
        else:
            # Sem filtro de data, mostra todas as manutenções do veículo
            return queryset.order_by('-data_servico')

    def perform_create(self, serializer):
        veiculo_pk = self.kwargs.get('veiculo_pk')
        veiculo = get_object_or_404(Veiculo, pk=veiculo_pk)
        serializer.save(veiculo=veiculo)

    def perform_update(self, serializer):
        manutencao = self.get_object()
        if str(manutencao.veiculo.pk) != self.kwargs.get('veiculo_pk'):
             raise PermissionDenied("Não é permitido alterar o veículo da manutenção por esta URL.")
        serializer.save()

# ===============================================
# === VIEWSETS PARA PAGAMENTOS E PARAMETROS   ===
# ===============================================

class FaixaKMViewSet(viewsets.ModelViewSet):
     queryset = FaixaKM.objects.all().order_by('min_km')
     serializer_class = FaixaKMSerializer
     permission_classes = [permissions.IsAdminUser] # Apenas Admin


class PagamentoAgregadoViewSet(viewsets.ModelViewSet):
    """Endpoint para CRUD e geração de Pagamentos de Agregados."""
    queryset = PagamentoAgregado.objects.select_related('cte__identificacao').order_by('-data_prevista', 'status')
    serializer_class = PagamentoAgregadoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Verifica se há filtros ativos
        usando_filtro = 'date_from' in self.request.query_params or 'date_to' in self.request.query_params
        
        if usando_filtro:
            date_from, date_to = get_date_filters(self.request)
            queryset = queryset.filter(data_prevista__range=[date_from, date_to])
        
        return queryset

    @action(detail=False, methods=['post'], url_path='gerar')
    @transaction.atomic
    def gerar_pagamentos_agregados(self, request):
        date_from_str = request.data.get('date_from')
        date_to_str = request.data.get('date_to')
        percentual_padrao = Decimal(request.data.get('percentual', '25.00'))
        if not date_from_str or not date_to_str: raise ValidationError({'detail':'"date_from" e "date_to" são obrigatórios.'})
        try:
            date_from = dt.strptime(date_from_str, '%Y-%m-%d').date()
            date_to = dt.strptime(date_to_str, '%Y-%m-%d').date()
        except ValueError: raise ValidationError({'detail':'Formato de data inválido. Use AAAA-MM-DD.'})

        veiculos_agregados_placas = list(Veiculo.objects.filter(tipo_proprietario='02', ativo=True).values_list('placa', flat=True))
        if not veiculos_agregados_placas: raise NotFound('Nenhum veículo agregado ativo encontrado.')

        ctes_elegiveis = CTeDocumento.objects.filter(
            identificacao__data_emissao__date__range=[date_from, date_to],
            cancelamento__isnull=True,
            modal_rodoviario__veiculos__placa__in=veiculos_agregados_placas,
            pagamento_agregado__isnull=True
        ).select_related('identificacao', 'prestacao', 'modal_rodoviario').prefetch_related('modal_rodoviario__veiculos', 'modal_rodoviario__motoristas')

        criados = 0; erros = []
        for cte in ctes_elegiveis:
            try:
                veiculo_cte = cte.modal_rodoviario.veiculos.filter(placa__in=veiculos_agregados_placas).first()
                motorista = cte.modal_rodoviario.motoristas.first()
                if not veiculo_cte:
                     erros.append(f"CT-e {cte.chave}: Veículo agregado não encontrado no XML.")
                     continue
                data_prevista_pgto = cte.identificacao.data_emissao.date() + timedelta(days=3) # REGRA EXEMPLO
                PagamentoAgregado.objects.create(
                    cte=cte, placa=veiculo_cte.placa,
                    condutor_cpf=motorista.cpf if motorista else None,
                    condutor_nome=motorista.nome if motorista else "Não informado",
                    valor_frete_total=getattr(cte, 'prestacao', None) and cte.prestacao.valor_total_prestado or Decimal('0.00'),
                    percentual_repasse=percentual_padrao, data_prevista=data_prevista_pgto, status='pendente'
                )
                criados += 1
            except Exception as e: erros.append(f"CT-e {cte.chave}: Erro - {e}")

        msg = f"{criados} pagamentos de agregados gerados."
        if erros: return Response({'detail': f"{msg} Erros: {len(erros)}.", 'erros': erros}, status=status.HTTP_207_MULTI_STATUS)
        if criados == 0: return Response({'detail': f"Nenhum CT-e elegível encontrado no período."}, status=status.HTTP_200_OK)
        return Response({'detail': msg}, status=status.HTTP_201_CREATED)


class PagamentoProprioViewSet(viewsets.ModelViewSet):
    queryset = PagamentoProprio.objects.select_related('veiculo').order_by('-periodo', 'veiculo__placa')
    serializer_class = PagamentoProprioSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        periodo = self.request.query_params.get('periodo')
        if periodo: queryset = queryset.filter(periodo=periodo)
        return queryset

    @action(detail=False, methods=['post'], url_path='gerar')
    @transaction.atomic
    def gerar_pagamentos_proprios(self, request):
        periodo = request.data.get('periodo')
        if not periodo: raise ValidationError({'detail': 'Campo "periodo" é obrigatório.'})
        try:
            year, month_part = periodo.split('-'); year = int(year); month = int(month_part[:2])
            day_from, day_to = 1, 31
            if len(month_part) > 2 and month_part[-1].upper() == 'Q':
                 q = int(month_part[-2]); day_to = 15 if q == 1 else (31 if q == 2 else 0); day_from = 1 if q == 1 else (16 if q == 2 else 0)
                 if day_from == 0: raise ValueError("Quinzena inválida.")
            date_from = date(year, month, day_from); date_to = date(year, month, min(day_to, calendar.monthrange(year, month)[1]))
        except Exception as e: raise ValidationError({'detail': f'Período inválido: {periodo}. Erro: {e}'})

        veiculos_proprios = Veiculo.objects.filter(tipo_proprietario='00', ativo=True)
        if not veiculos_proprios.exists(): raise NotFound('Nenhum veículo próprio ativo.')
        faixas_km = list(FaixaKM.objects.order_by('min_km'))
        if not faixas_km: raise ValidationError({'detail': 'Nenhuma FaixaKM cadastrada.'})

        criados = 0; atualizados = 0; erros_veiculo = {}
        for veiculo in veiculos_proprios:
            try:
                km_aggr = CTeIdentificacao.objects.filter(
                    cte__cancelamento__isnull=True, data_emissao__date__range=[date_from, date_to],
                    cte__modal_rodoviario__veiculos__placa=veiculo.placa, # Adapte se necessário
                    dist_km__isnull=False, dist_km__gt=0
                ).aggregate(total_km=Coalesce(Sum('dist_km'), 0))
                km_total = km_aggr['total_km']
                valor_base = next((f.valor_pago for f in faixas_km if km_total >= f.min_km and (f.max_km is None or km_total <= f.max_km)), Decimal('0.00'))
                pagamento, created = PagamentoProprio.objects.update_or_create(
                    veiculo=veiculo, periodo=periodo,
                    defaults={'km_total_periodo': km_total, 'valor_base_faixa': valor_base, 'ajustes': F('ajustes') if not created else Decimal('0.00')}
                )
                pagamento.save()
                if created: criados += 1
                else: atualizados += 1
            except Exception as e: erros_veiculo[veiculo.placa] = str(e)

        msg = f"{criados} criados, {atualizados} atualizados (Período: {periodo})."
        if erros_veiculo: return Response({'detail': f"{msg} Erros.", 'erros': erros_veiculo}, status=status.HTTP_207_MULTI_STATUS)
        return Response({'detail': msg}, status=status.HTTP_200_OK if atualizados > 0 else status.HTTP_201_CREATED)


# ===============================================
# ===         VIEWS PARA PAINÉIS              ===
# ===============================================

class DashboardGeralAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        # Se não estiver usando filtro, mostrar todos os dados
        if not usando_filtro:
            # Define um intervalo de data muito amplo para mostrar todos os registros
            date_from = date(2000, 1, 1)  # Data antiga o suficiente
            date_to = date.today() + timedelta(days=1)  # Data futura para incluir hoje
        else:
            # Se estiver usando filtro, aplicar o filtro normalmente
            date_from, date_to = get_date_filters(request)
        
        # Construir filtros dependendo se o usuário está filtrando ou não
        cte_filter = Q(cancelamento__isnull=True)
        mdfe_filter = Q(cancelamento__isnull=True)
        manut_filter = Q()
        
        # Adicionar filtros de data apenas se o usuário estiver filtrando explicitamente
        if usando_filtro:
            cte_filter &= Q(identificacao__data_emissao__date__range=[date_from, date_to])
            mdfe_filter &= Q(identificacao__dh_emi__date__range=[date_from, date_to])
            manut_filter &= Q(data_servico__range=[date_from, date_to])
        
        cards = {}
        try:
            cards['total_ctes'] = CTeDocumento.objects.filter(cte_filter).count()
            cards['total_mdfes'] = MDFeDocumento.objects.filter(mdfe_filter).count()
            cards['faturamento'] = CTeDocumento.objects.filter(cte_filter).aggregate(t=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0.0')))['t']
            cards['valor_carga'] = MDFeDocumento.objects.filter(mdfe_filter).aggregate(t=Coalesce(Sum('totais__v_carga'), Decimal('0.0')))['t']
            cards['km_rodado'] = CTeDocumento.objects.filter(cte_filter).aggregate(t=Coalesce(Sum('identificacao__dist_km'), 0))['t']
            manut_aggr = ManutencaoVeiculo.objects.filter(manut_filter).aggregate(t=Coalesce(Sum('valor_total'), Decimal('0.0')), q=Count('id'))
            cards['custo_manutencao'] = manut_aggr['t']
            cards['qtd_manutencoes'] = manut_aggr['q']
        except Exception as e: print(f"Erro cards Dashboard: {e}")
        
        grafico_cif_fob = []
        try:
            # Base de filtro sem data para modalidade
            base_filter = Q(modalidade__in=['CIF', 'FOB'], cancelamento__isnull=True)
            if usando_filtro:
                base_filter &= Q(identificacao__data_emissao__date__range=[date_from, date_to])
                
            cif_fob_data = CTeDocumento.objects.filter(base_filter).annotate(
                mes=TruncMonth('identificacao__data_emissao')
            ).values('mes', 'modalidade').annotate(
                valor=Sum('prestacao__valor_total_prestado')
            ).order_by('mes', 'modalidade')
            
            temp_data = {}
            for item in cif_fob_data:
                mes_str = item['mes'].strftime('%Y-%m')
                temp_data.setdefault(mes_str, {'mes': mes_str, 'cif': Decimal(0), 'fob': Decimal(0)})
                if item['modalidade'] == 'CIF': temp_data[mes_str]['cif'] += item['valor'] or 0
                elif item['modalidade'] == 'FOB': temp_data[mes_str]['fob'] += item['valor'] or 0
            grafico_cif_fob = sorted(temp_data.values(), key=lambda x: x['mes'])
        except Exception as e: print(f"Erro gráfico CIF/FOB: {e}")
        
        # Implementar gráfico de metas (exemplo)
        grafico_metas = []
        try:
            # Dados dos últimos 6 meses
            hoje = date.today()
            meses_anteriores = [hoje.replace(day=1) - timedelta(days=1) for _ in range(6)]
            meses_anteriores = [d.replace(day=1) for d in meses_anteriores]
            
            # Para cada mês, obter o faturamento real e meta (exemplo)
            for mes_data in meses_anteriores:
                mes_str = mes_data.strftime('%Y-%m')
                ultimo_dia = calendar.monthrange(mes_data.year, mes_data.month)[1]
                
                # Faturamento real
                faturamento_real = CTeDocumento.objects.filter(
                    identificacao__data_emissao__date__range=[mes_data, mes_data.replace(day=ultimo_dia)],
                    cancelamento__isnull=True
                ).aggregate(
                    total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0.0'))
                )['total']
                
                # Meta (exemplo fixo - poderia vir de uma tabela de metas)
                meta_valor = Decimal('100000.00')  # Exemplo: R$ 100.000,00 por mês
                
                grafico_metas.append({
                    'mes': mes_str,
                    'real': float(faturamento_real),
                    'meta': float(meta_valor),
                    'percentual': float(faturamento_real / meta_valor * 100) if meta_valor > 0 else 0
                })
        except Exception as e:
            print(f"Erro ao gerar gráfico de metas: {e}")
        
        # Últimos lançamentos
        ultimos_ctes = CTeDocumentoListSerializer(
            CTeDocumento.objects.filter(processado=True).order_by('-identificacao__data_emissao')[:5], 
            many=True
        ).data
        
        ultimas_manutencoes = ManutencaoVeiculoSerializer(
            ManutencaoVeiculo.objects.order_by('-data_servico', '-criado_em')[:5], 
            many=True
        ).data
        
        response_data = {
            'filtros': {
                'date_from': date_from.isoformat(), 
                'date_to': date_to.isoformat(),
                'usando_filtro': usando_filtro
            }, 
            'cards': cards, 
            'grafico_cif_fob': grafico_cif_fob, 
            'grafico_metas': grafico_metas, 
            'ultimos_lancamentos': {
                'ctes': ultimos_ctes, 
                'manutencoes': ultimas_manutencoes
            }
        }
        
        serializer = DashboardGeralDataSerializer(response_data)
        return Response(serializer.data)

class CtePainelAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        # Define intervalos de data
        if not usando_filtro:
            # Sem filtro - mostra todos os dados
            date_from = date(2000, 1, 1)
            date_to = date.today() + timedelta(days=1)
        else:
            date_from, date_to = get_date_filters(request)
        
        # Base de filtro
        base_filter = Q(cancelamento__isnull=True)
        if usando_filtro:
            base_filter &= Q(identificacao__data_emissao__date__range=[date_from, date_to])
            
        base_qs = CTeDocumento.objects.filter(base_filter).select_related('destinatario', 'remetente', 'prestacao')
        
        # Dados para cards
        cards = base_qs.aggregate(
            total_ctes=Count('id'), 
            total_cif=Count('id', filter=Q(modalidade='CIF')), 
            total_fob=Count('id', filter=Q(modalidade='FOB')), 
            valor_total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal('0.0')), 
            valor_medio=Coalesce(Avg('prestacao__valor_total_prestado'), Decimal('0.0'))
        )
        
        # Gráfico de clientes
        grafico_cliente = list(base_qs.values(
            label=F('destinatario__razao_social')
        ).annotate(
            value1=Sum('prestacao__valor_total_prestado')
        ).order_by('-value1')[:10])
        
        # Gráfico de distribuidores
        grafico_distribuidor = list(base_qs.values(
            label=F('remetente__razao_social')
        ).annotate(
            value1=Sum('prestacao__valor_total_prestado')
        ).order_by('-value1')[:10])
        
        # Tabela detalhada de clientes
        tabela_cliente = list(base_qs.values(
            'destinatario__razao_social', 'destinatario__cnpj'
        ).annotate(
            faturamento=Sum('prestacao__valor_total_prestado'),
            qtd_ctes=Count('id'),
            valor_medio=Avg('prestacao__valor_total_prestado')
        ).order_by('-faturamento')[:20])
        
        data = {
            'filtros': {
                'date_from': date_from.isoformat(), 
                'date_to': date_to.isoformat(),
                'usando_filtro': usando_filtro
            }, 
            'cards': cards, 
            'grafico_cliente': grafico_cliente, 
            'grafico_distribuidor': grafico_distribuidor, 
            'tabela_cliente': tabela_cliente
        }
        
        serializer = CtePainelSerializer(data)
        return Response(serializer.data)

class MdfePainelAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        # Define intervalos de data
        if not usando_filtro:
            # Sem filtro - mostra todos os dados
            date_from = date(2000, 1, 1)
            date_to = date.today() + timedelta(days=1)
        else:
            date_from, date_to = get_date_filters(request)
        
        # Base de filtro
        base_filter = Q(cancelamento__isnull=True)
        if usando_filtro:
            base_filter &= Q(identificacao__dh_emi__date__range=[date_from, date_to])
            
        base_qs = MDFeDocumento.objects.filter(base_filter).select_related('totais', 'modal_rodoviario__veiculo_tracao')
        
        # Dados para cards
        cards = base_qs.aggregate(
            total_mdfes=Count('id'),
            carga_total_kg=Coalesce(Sum('totais__q_carga', filter=Q(totais__c_unid='01')), Decimal('0.0')),
            carga_total_ton=Coalesce(Sum('totais__q_carga', filter=Q(totais__c_unid='02')), Decimal('0.0')),
            valor_carga_total=Coalesce(Sum('totais__v_carga'), Decimal('0.0'))
        )
        
        # Converte toneladas para kg se necessário
        cards['carga_total_kg'] += cards['carga_total_ton'] * 1000
        
        # Gráfico de relação CT-e/MDF-e
        grafico_cte_mdfe = []
        try:
            # Obter meses com MDFes
            meses = MDFeDocumento.objects.filter(base_filter).annotate(
                mes=TruncMonth('identificacao__dh_emi')
            ).values('mes').distinct().order_by('mes')
            
            for mes_item in meses:
                mes = mes_item['mes']
                mes_str = mes.strftime('%Y-%m')
                
                # Intervalo do mês
                inicio_mes = mes.replace(day=1)
                fim_mes = (inicio_mes + timedelta(days=32)).replace(day=1) - timedelta(days=1)
                
                # Conta MDF-es no mês
                mdfes_count = MDFeDocumento.objects.filter(
                    identificacao__dh_emi__date__range=[inicio_mes, fim_mes],
                    cancelamento__isnull=True
                ).count()
                
                # Conta CT-es emitidos no mesmo mês
                ctes_count = CTeDocumento.objects.filter(
                    identificacao__data_emissao__date__range=[inicio_mes, fim_mes],
                    cancelamento__isnull=True
                ).count()
                
                # Calcula a relação (média de CT-es por MDF-e)
                ratio = round(ctes_count / mdfes_count, 2) if mdfes_count > 0 else 0
                
                grafico_cte_mdfe.append({
                    'mes': mes_str,
                    'mdfes': mdfes_count,
                    'ctes': ctes_count,
                    'ratio': ratio
                })
        except Exception as e:
            print(f"Erro ao gerar gráfico CT-e/MDF-e: {e}")
        
        # Top veículos utilizados
        top_veiculos = list(base_qs.filter(
            modal_rodoviario__veiculo_tracao__placa__isnull=False
        ).values(
            label=F('modal_rodoviario__veiculo_tracao__placa')
        ).annotate(
            value1=Count('id')
        ).order_by('-value1')[:10])
        
        # Tabela de MDFes por veículo
        tabela_mdfe_veiculo = list(base_qs.annotate(
            placa=F('modal_rodoviario__veiculo_tracao__placa')
        ).values(
            'chave', 
            'identificacao__n_mdf', 
            'identificacao__dh_emi', 
            'placa', 
            'totais__v_carga', 
            'totais__q_carga'
        ).order_by('-identificacao__dh_emi')[:50])
        
        # Cálculo de eficiência (% de CT-es transportados em MDF-es)
        eficiencia = 0.0
        try:
            total_ctes = CTeDocumento.objects.filter(
                cancelamento__isnull=True
            )
            if usando_filtro:
                total_ctes = total_ctes.filter(identificacao__data_emissao__date__range=[date_from, date_to])
            
            total_ctes_count = total_ctes.count()
            
            ctes_em_mdfe = MDFeDocumentosVinculados.objects.filter(
                mdfe__cancelamento__isnull=True,
                cte_relacionado__isnull=False
            )
            if usando_filtro:
                ctes_em_mdfe = ctes_em_mdfe.filter(mdfe__identificacao__dh_emi__date__range=[date_from, date_to])
                
            ctes_em_mdfe_count = ctes_em_mdfe.values('cte_relacionado').distinct().count()
            
            eficiencia = round((ctes_em_mdfe_count / total_ctes_count * 100), 2) if total_ctes_count > 0 else 0.0
        except Exception as e:
            print(f"Erro ao calcular eficiência: {e}")
        
        data = {
            'filtros': {
                'date_from': date_from.isoformat(), 
                'date_to': date_to.isoformat(),
                'usando_filtro': usando_filtro
            }, 
            'cards': cards, 
            'grafico_cte_mdfe': grafico_cte_mdfe, 
            'top_veiculos': top_veiculos, 
            'tabela_mdfe_veiculo': tabela_mdfe_veiculo, 
            'eficiencia': eficiencia
        }
        
        serializer = MdfePainelSerializer(data)
        return Response(serializer.data)

class FinanceiroPainelAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        # Define intervalos de data
        if not usando_filtro:
            # Sem filtro - mostra todos os dados
            date_from = date(2000, 1, 1)
            date_to = date.today() + timedelta(days=1)
        else:
            date_from, date_to = get_date_filters(request)
        
        # Base de filtro
        base_filter = Q(cancelamento__isnull=True)
        if usando_filtro:
            base_filter &= Q(identificacao__data_emissao__date__range=[date_from, date_to])
            
        cte_base = CTeDocumento.objects.filter(base_filter).select_related('prestacao', 'tributos')
        
        # Cards financeiros
        cards = cte_base.aggregate(
            faturamento=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal(0.0)), 
            valor_cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal(0.0)), 
            valor_fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal(0.0)), 
            tributos=Coalesce(Sum('tributos__valor_total_tributos'), Decimal(0.0))
        )
        
        # Gráfico CIF/FOB por mês
        cif_fob_data = cte_base.filter(
            modalidade__in=['CIF', 'FOB']
        ).annotate(
            mes=TruncMonth('identificacao__data_emissao')
        ).values(
            'mes', 'modalidade'
        ).annotate(
            valor=Sum('prestacao__valor_total_prestado')
        ).order_by('mes', 'modalidade')
        
        grafico_cif_fob = []
        temp_data = {}
        for item in cif_fob_data:
            mes_str = item['mes'].strftime('%Y-%m')
            temp_data.setdefault(mes_str, {'mes': mes_str, 'cif': Decimal(0), 'fob': Decimal(0)})
            if item['modalidade'] == 'CIF': 
                temp_data[mes_str]['cif'] += item['valor'] or 0
            elif item['modalidade'] == 'FOB': 
                temp_data[mes_str]['fob'] += item['valor'] or 0
                
        grafico_cif_fob = sorted(temp_data.values(), key=lambda x: x['mes'])
        
        data = {
            'filtros': {
                'date_from': date_from.isoformat(), 
                'date_to': date_to.isoformat(),
                'usando_filtro': usando_filtro
            }, 
            'cards': cards, 
            'grafico_cif_fob': grafico_cif_fob
        }
        
        serializer = FinanceiroPainelSerializer(data)
        return Response(serializer.data)

class FinanceiroMensalAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        today = date.today()
        start_date = (today.replace(day=1) - timedelta(days=365*1)).replace(day=1)
        
        # Dados agrupados por mês
        data_mensal = CTeDocumento.objects.filter(
            identificacao__data_emissao__date__gte=start_date,
            cancelamento__isnull=True
        ).annotate(
            mes=TruncMonth('identificacao__data_emissao')
        ).values('mes').annotate(
            faturamento=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal(0.0)),
            cif=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')), Decimal(0.0)),
            fob=Coalesce(Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')), Decimal(0.0)),
            entregas=Count('id')
        ).order_by('mes')
        
        # Formatação dos resultados
        resultado = [
            {
                'mes': item['mes'].strftime('%Y-%m'),
                'faturamento': item['faturamento'],
                'cif': item['cif'],
                'fob': item['fob'],
                'entregas': item['entregas']
            } 
            for item in data_mensal
        ]
        
        serializer = FinanceiroMensalSerializer(resultado, many=True)
        return Response(serializer.data)

class FinanceiroDetalheAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        # Define intervalos de data
        if not usando_filtro:
            # Sem filtro - mostra todos os dados
            date_from = date(2000, 1, 1)
            date_to = date.today() + timedelta(days=1)
        else:
            date_from, date_to = get_date_filters(request)
        
        # Obtém o tipo de agrupamento
        group_by = request.query_params.get('group', 'cliente')
        
        # Mapeia os campos para agrupamento
        allowed_groups = {
            'cliente': {'label': F('destinatario__razao_social'), 'id_': F('destinatario__cnpj')},
            'veiculo': {'label': F('modal_rodoviario__veiculos__placa'), 'id_': F('modal_rodoviario__veiculos__placa')},
            'distribuidora': {'label': F('remetente__razao_social'), 'id_': F('remetente__cnpj')}
        }
        
        if group_by not in allowed_groups:
            raise ValidationError({'detail': 'Parâmetro "group" inválido. Valores permitidos: cliente, veiculo, distribuidora'})
        
        # Seleciona os campos de agrupamento
        group_fields = allowed_groups[group_by]
        
        # Constrói a query base
        base_qs = CTeDocumento.objects.filter(cancelamento__isnull=True)
        
        # Adiciona filtro de data se necessário
        if usando_filtro:
            base_qs = base_qs.filter(identificacao__data_emissao__date__range=[date_from, date_to])
        
        # Filtra por veículos se necessário
        if group_by == 'veiculo':
            base_qs = base_qs.filter(modal_rodoviario__veiculos__placa__isnull=False)
        
        # Realiza a agregação dos dados
        data_agrupada = base_qs.values(**group_fields).annotate(
            faturamento_total=Coalesce(Sum('prestacao__valor_total_prestado'), Decimal(0.0)),
            qtd_ctes=Count('id', distinct=True),
            valor_medio=Avg('prestacao__valor_total_prestado')
        ).order_by('-faturamento_total')
        
        # Formata o resultado para o serializer
        resultado = [
            {
                **{k: v for k, v in item.items() if k != 'id_'},
                'id': item.get('id_')
            } 
            for item in data_agrupada
        ]
        
        serializer = FinanceiroDetalheSerializer(resultado, many=True)
        return Response(serializer.data)

class GeograficoPainelAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        # Define intervalos de data
        if not usando_filtro:
            # Sem filtro - mostra todos os dados
            date_from = date(2000, 1, 1)
            date_to = date.today() + timedelta(days=1)
        else:
            date_from, date_to = get_date_filters(request)
        
        # Constrói a query base
        base_qs = CTeIdentificacao.objects.filter(
            cte__cancelamento__isnull=True,
            uf_ini__isnull=False,
            uf_fim__isnull=False
        )
        
        # Adiciona filtro de data se necessário
        if usando_filtro:
            base_qs = base_qs.filter(data_emissao__date__range=[date_from, date_to])
        
        # Análise de rotas (UF origem/destino)
        rotas = list(base_qs.values(
            'uf_ini', 'uf_fim'
        ).annotate(
            contagem=Count('id'),
            km_total=Sum('dist_km'),
            valor_total=Sum('cte__prestacao__valor_total_prestado')
        ).order_by('-contagem'))
        
        # Top origens (por UF e município)
        top_origens = list(base_qs.values(
            'uf_ini', 'nome_mun_ini'
        ).annotate(
            contagem=Count('id'),
            valor=Sum('cte__prestacao__valor_total_prestado')
        ).order_by('-contagem')[:10])
        
        # Top destinos (por UF e município)
        top_destinos = list(base_qs.values(
            'uf_fim', 'nome_mun_fim'
        ).annotate(
            contagem=Count('id'),
            valor=Sum('cte__prestacao__valor_total_prestado')
        ).order_by('-contagem')[:10])
        
        # Rotas frequentes (as 10 mais utilizadas)
        rotas_frequentes = rotas[:10]
        
        data = {
            'filtros': {
                'date_from': date_from.isoformat(), 
                'date_to': date_to.isoformat(),
                'usando_filtro': usando_filtro
            }, 
            'rotas': rotas, 
            'top_origens': top_origens, 
            'top_destinos': top_destinos, 
            'rotas_frequentes': rotas_frequentes
        }
        
        serializer = GeograficoPainelSerializer(data)
        return Response(serializer.data)

class ManutencaoPainelViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    
    def _get_base_queryset(self, request): 
        # Verifica se o usuário está explicitamente filtrando por data
        usando_filtro = 'date_from' in request.query_params or 'date_to' in request.query_params
        
        if usando_filtro:
            date_from, date_to = get_date_filters(request)
            return ManutencaoVeiculo.objects.filter(data_servico__range=[date_from, date_to])
        else:
            # Sem filtro de data, retorna todas as manutenções
            return ManutencaoVeiculo.objects.all()
    
    @action(detail=False, methods=['get'], url_path='indicadores')
    def indicadores(self, request):
        queryset = self._get_base_queryset(request)
        
        # Indicadores gerais de manutenção
        aggregates = queryset.aggregate(
            total_manutencoes=Count('id'), 
            total_pecas=Coalesce(Sum('valor_peca'), Decimal(0.0)), 
            total_mao_obra=Coalesce(Sum('valor_mao_obra'), Decimal(0.0)), 
            valor_total=Coalesce(Sum('valor_total'), Decimal(0.0))
        )
        
        serializer = ManutencaoIndicadoresSerializer(aggregates)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='graficos')
    def graficos(self, request):
        queryset = self._get_base_queryset(request).select_related('veiculo')
        
        # Manutenções por status
        status_data = list(queryset.values('status').annotate(count=Count('id')).order_by('-count'))
        
        # Gastos por veículo
        por_veiculo_data = list(queryset.values(
            label=F('veiculo__placa')
        ).annotate(
            value1=Sum('valor_total')
        ).order_by('-value1')[:15])
        
        # Gastos por período (agrupados por mês)
        por_periodo_data = queryset.annotate(
            mes=TruncMonth('data_servico')
        ).values('mes').annotate(
            value1=Sum('valor_total')
        ).order_by('mes')
        
        # Formata os dados do período
        por_periodo_formatado = [
            {
                'label': item['mes'].strftime('%Y-%m'), 
                'value1': item['value1']
            } 
            for item in por_periodo_data
        ]
        
        # Estrutura final dos dados
        dados_graficos = {
            'por_status': status_data, 
            'por_veiculo': por_veiculo_data, 
            'por_periodo': por_periodo_formatado
        }
        
        serializer = ManutencaoGraficosSerializer(dados_graficos)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='ultimos')
    def ultimos(self, request): 
        # Retorna as 10 últimas manutenções, independente de filtros
        queryset = ManutencaoVeiculo.objects.order_by('-data_servico', '-criado_em')[:10]
        serializer = ManutencaoVeiculoSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='tendencias')
    def tendencias(self, request):
        """Análise de tendências de manutenção - nova funcionalidade."""
        queryset = self._get_base_queryset(request)
        
        # Frequência de manutenção por veículo
        frequencia_veiculo = queryset.values(
            'veiculo__placa'
        ).annotate(
            primeira=Min('data_servico'),
            ultima=Max('data_servico'),
            total=Count('id'),
            valor_medio=Avg('valor_total')
        ).filter(total__gt=1).order_by('veiculo__placa')
        
        # Calcular intervalo médio entre manutenções
        frequencia_data = []
        for item in frequencia_veiculo:
            dias_total = (item['ultima'] - item['primeira']).days
            qtd_intervalos = max(1, item['total'] - 1)
            dias_medio = dias_total / qtd_intervalos
            
            frequencia_data.append({
                'placa': item['veiculo__placa'],
                'total_manutencoes': item['total'],
                'intervalo_medio_dias': round(dias_medio, 1),
                'valor_medio': item['valor_medio'],
                'ultima_manutencao': item['ultima'].strftime('%Y-%m-%d')
            })
        
        # Tipo de serviços mais comuns
        servicos_comuns = queryset.values(
            'servico_realizado'
        ).annotate(
            count=Count('id'),
            valor_medio=Avg('valor_total')
        ).order_by('-count')[:10]
        
        return Response({
            'frequencia_manutencao': frequencia_data,
            'servicos_mais_comuns': servicos_comuns
        })

# ===============================================
# ===         VIEW PARA ALERTAS               ===
# ===============================================

class AlertasPagamentoAPIView(APIView):
    """Retorna pagamentos pendentes próximos do vencimento ou já vencidos."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        today = date.today()
        # Agregados: Pendentes com data prevista até X dias a partir de hoje (ou já vencidos)
        dias_alerta_agregado = request.query_params.get('dias_agregado', 3) # Padrão 3 dias
        try:
            data_limite_agregados = today + timedelta(days=int(dias_alerta_agregado))
        except ValueError:
            data_limite_agregados = today + timedelta(days=3) # Fallback

        alertas_agregados = PagamentoAgregado.objects.filter(
            status='pendente',
            data_prevista__lte=data_limite_agregados # Inclui vencidos e próximos
        ).select_related('cte__identificacao').order_by('data_prevista')

        # Próprios: Apenas os com status pendente (não têm data prevista)
        alertas_proprios = PagamentoProprio.objects.filter(
             status='pendente'
        ).select_related('veiculo').order_by('periodo', 'veiculo__placa')

        serializer_agregados = PagamentoAgregadoSerializer(alertas_agregados, many=True)
        serializer_proprios = PagamentoProprioSerializer(alertas_proprios, many=True)

        response_data = {
            'agregados_pendentes': serializer_agregados.data,
            'proprios_pendentes': serializer_proprios.data,
            'dias_alerta': int(dias_alerta_agregado)
        }
        
        serializer = AlertaPagamentoSerializer(response_data)
        return Response(serializer.data)

# ===============================================
# ===       API ADICIONAL PARA RELATÓRIOS     ===
# ===============================================

class RelatorioAPIView(APIView):
    """API para geração de relatórios personalizados."""
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, *args, **kwargs):
        tipo_relatorio = request.query_params.get('tipo', 'faturamento')
        date_from, date_to = get_date_filters(request)
        
        # Relatório de faturamento por período
        if tipo_relatorio == 'faturamento':
            # Agrupamento (diário, semanal, mensal)
            agrupamento = request.query_params.get('agrupamento', 'mensal')
            
            if agrupamento == 'diario':
                trunc_func = TruncDay('identificacao__data_emissao')
                format_str = '%Y-%m-%d'
            elif agrupamento == 'semanal':
                trunc_func = TruncWeek('identificacao__data_emissao')
                format_str = '%Y-%m-%d'
            else: # mensal (padrão)
                trunc_func = TruncMonth('identificacao__data_emissao')
                format_str = '%Y-%m'
            
            # Dados agrupados por período
            faturamento_data = CTeDocumento.objects.filter(
                identificacao__data_emissao__date__range=[date_from, date_to],
                cancelamento__isnull=True
            ).annotate(
                periodo=trunc_func
            ).values('periodo').annotate(
                total=Sum('prestacao__valor_total_prestado'),
                cif=Sum('prestacao__valor_total_prestado', filter=Q(modalidade='CIF')),
                fob=Sum('prestacao__valor_total_prestado', filter=Q(modalidade='FOB')),
                qtd=Count('id')
            ).order_by('periodo')
            
            # Formatação dos resultados
            dados = [
                {
                    'periodo': item['periodo'].strftime(format_str),
                    'total': item['total'],
                    'cif': item['cif'] or Decimal('0.0'),
                    'fob': item['fob'] or Decimal('0.0'),
                    'qtd': item['qtd']
                }
                for item in faturamento_data
            ]
            
            # Inclui totalizadores
            totais = {
                'total': sum(item['total'] for item in dados),
                'cif': sum(item['cif'] for item in dados),
                'fob': sum(item['fob'] for item in dados),
                'qtd': sum(item['qtd'] for item in dados)
            }
            
            return Response({
                'titulo': f'Relatório de Faturamento ({agrupamento})',
                'periodo': f'De {date_from.strftime("%d/%m/%Y")} a {date_to.strftime("%d/%m/%Y")}',
                'dados': dados,
                'totais': totais
            })
            
        # Relatório de veículos
        elif tipo_relatorio == 'veiculos':
            # Filtrar apenas veículos ativos com operações no período
            veiculos_ativos = Veiculo.objects.filter(ativo=True)
            
            # Dados de operação por veículo no período
            dados_veiculo = []
            
            for veiculo in veiculos_ativos:
                # CT-es vinculados ao veículo no período
                ctes_vinculados = CTeVeiculoRodoviario.objects.filter(
                    placa=veiculo.placa,
                    modal__cte__identificacao__data_emissao__date__range=[date_from, date_to],
                    modal__cte__cancelamento__isnull=True
                ).values('modal__cte').distinct().count()
                
                # MDF-es como veículo de tração
                mdfes_tracao = MDFeVeiculoTracao.objects.filter(
                    placa=veiculo.placa,
                    modal__mdfe__identificacao__dh_emi__date__range=[date_from, date_to],
                    modal__mdfe__cancelamento__isnull=True
                ).count()
                
                # MDF-es como veículo reboque
                mdfes_reboque = MDFeVeiculoReboque.objects.filter(
                    placa=veiculo.placa,
                    modal__mdfe__identificacao__dh_emi__date__range=[date_from, date_to],
                    modal__mdfe__cancelamento__isnull=True
                ).count()
                
                # Manutenções no período
                manutencoes = ManutencaoVeiculo.objects.filter(
                    veiculo=veiculo,
                    data_servico__range=[date_from, date_to]
                )
                
                custos_manutencao = manutencoes.aggregate(
                    total=Coalesce(Sum('valor_total'), Decimal('0.0'))
                )['total']
                
                # KM estimados
                km_rodado = CTeIdentificacao.objects.filter(
                    cte__modal_rodoviario__veiculos__placa=veiculo.placa,
                    cte__cancelamento__isnull=True,
                    data_emissao__date__range=[date_from, date_to],
                    dist_km__isnull=False
                ).aggregate(
                    total=Coalesce(Sum('dist_km'), 0)
                )['total']
                
                # Adiciona dados do veículo se teve atividade no período
                if ctes_vinculados > 0 or mdfes_tracao > 0 or mdfes_reboque > 0 or custos_manutencao > 0:
                    dados_veiculo.append({
                        'placa': veiculo.placa,
                        'tipo_proprietario': veiculo.get_tipo_proprietario_display() if hasattr(veiculo, 'get_tipo_proprietario_display') else veiculo.tipo_proprietario,
                        'ctes': ctes_vinculados,
                        'mdfes': mdfes_tracao + mdfes_reboque,
                        'km_rodado': km_rodado,
                        'custos_manutencao': custos_manutencao,
                        'custo_km': round(float(custos_manutencao / km_rodado), 2) if km_rodado > 0 else 0
                    })
            
            # Ordenar por KM rodado
            dados_veiculo = sorted(dados_veiculo, key=lambda x: x['km_rodado'], reverse=True)
            
            # Totalizadores
            totais = {
                'veiculos': len(dados_veiculo),
                'km_total': sum(item['km_rodado'] for item in dados_veiculo),
                'ctes_total': sum(item['ctes'] for item in dados_veiculo),
                'mdfes_total': sum(item['mdfes'] for item in dados_veiculo),
                'custos_total': sum(item['custos_manutencao'] for item in dados_veiculo)
            }
            
            return Response({
                'titulo': 'Relatório de Utilização de Veículos',
                'periodo': f'De {date_from.strftime("%d/%m/%Y")} a {date_to.strftime("%d/%m/%Y")}',
                'dados': dados_veiculo,
                'totais': totais
            })
        
        # Tipo de relatório não implementado
        else:
            return Response(
                {'detail': f'Tipo de relatório "{tipo_relatorio}" não implementado.'},
                status=status.HTTP_400_BAD_REQUEST
            )