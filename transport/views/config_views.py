# transport/views/config_views.py

# Imports padrão
import os
import json
import csv
import subprocess
import tempfile
import hashlib
import shutil
import traceback
from io import StringIO
from datetime import datetime
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

# Imports Django
from django.http import HttpResponse, JsonResponse, FileResponse
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404

# Imports Django REST Framework
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser # IsAdminUser pode ser útil aqui
from rest_framework import serializers # Para ValidationError

# Imports Locais
from ..serializers.config_serializers import ( # Use .. para voltar um nível
    ParametroSistemaSerializer,
    ConfiguracaoEmpresaSerializer,
    RegistroBackupSerializer,
    # Adicionar serializers de relatórios se/quando criados
)
from ..serializers.vehicle_serializers import VeiculoSerializer, ManutencaoVeiculoSerializer
from ..models import (
    ParametroSistema,
    ConfiguracaoEmpresa,
    RegistroBackup,
    Veiculo,
    CTePrestacaoServico,
)

# ===============================================================
# ==> APIS PARA CONFIGURAÇÃO DO SISTEMA
# ===============================================================

class ParametroSistemaViewSet(viewsets.ModelViewSet):
    """
    API para gerenciar parâmetros do sistema.
    Apenas usuários autenticados podem ver, admins podem modificar.
    """
    queryset = ParametroSistema.objects.all().order_by('grupo', 'nome')
    serializer_class = ParametroSistemaSerializer
    permission_classes = [IsAuthenticated] # Permite leitura para todos autenticados

    def get_permissions(self):
        """ Permissões mais restritas para escrita. """
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'atualizar_multiplos']:
            # Apenas admins podem modificar
            return [IsAuthenticated(), IsAdminUser()]
        # Permite leitura (list, retrieve, valores) para qualquer autenticado
        return [IsAuthenticated()]

    def get_queryset(self):
        """Permite filtrar parâmetros por grupo e editabilidade."""
        queryset = super().get_queryset()
        params = self.request.query_params

        # Filtro por grupo
        grupo = params.get('grupo')
        if grupo:
            queryset = queryset.filter(grupo=grupo)

        # Filtro por editável
        editavel = params.get('editavel')
        if editavel is not None:
            queryset = queryset.filter(editavel=editavel.lower() == 'true')

        return queryset

    @action(detail=False, methods=['get'])
    def valores(self, request):
        """
        Retorna valores simplificados dos parâmetros (nome: valor_tipado)
        no formato adequado para uso direto no frontend.
        Acessível para qualquer usuário autenticado.
        """
        grupo = request.query_params.get('grupo')
        queryset = self.get_queryset() # Aplica filtros de grupo/editavel se presentes

        if grupo:
            queryset = queryset.filter(grupo=grupo)

        # Obter parâmetros e seus valores tipados
        parametros = {}
        for param in queryset:
            parametros[param.nome] = param.get_valor_tipado()

        return Response(parametros)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated, IsAdminUser])
    @transaction.atomic # Garante atomicidade na atualização múltipla
    def atualizar_multiplos(self, request):
        """
        Atualiza múltiplos parâmetros em uma única requisição.
        Apenas para Admins.
        Formato esperado no body:
        {
            "parametros": {
                "NOME_PARAM1": "valor1",
                "NOME_PARAM2": "valor2",
                ...
            }
        }
        """
        parametros_data = request.data.get('parametros', {})

        if not parametros_data or not isinstance(parametros_data, dict):
            return Response({"error": "Formato inválido. Esperado: {'parametros': {nome: valor, ...}}"},
                           status=status.HTTP_400_BAD_REQUEST)

        atualizados = []
        erros = []

        # Itera sobre os parâmetros enviados para atualização
        for nome, valor in parametros_data.items():
            try:
                # Busca o parâmetro pelo nome
                param = ParametroSistema.objects.select_for_update().get(nome=nome) # Lock para atomicidade

                # Verificar se o parâmetro é editável
                if not param.editavel:
                    erros.append({'nome': nome, 'erro': "Este parâmetro não é editável."})
                    continue

                # Tenta validar e salvar o novo valor (converte para string como no modelo)
                # Idealmente, a validação do tipo ocorreria aqui se necessário
                valor_str = str(valor)
                param.valor = valor_str
                # Validação do modelo (opcional, mas bom)
                # param.full_clean(exclude=['nome']) # Exclui nome pois não estamos mudando
                param.save()

                atualizados.append({
                    'nome': nome,
                    'valor': valor_str,
                    'valor_tipado': param.get_valor_tipado() # Mostra o valor convertido
                })

            except ParametroSistema.DoesNotExist:
                erros.append({'nome': nome, 'erro': "Parâmetro não encontrado."})
            except ValidationError as ve: # Captura erros de validação do Django
                 erros.append({'nome': nome, 'erro': str(ve)})
            except Exception as e:
                logger.warning("Erro ao atualizar parâmetro %s: %s", nome, e)
                erros.append({'nome': nome, 'erro': f"Erro inesperado: {str(e)}"})

        # Se houve erros, a transação será revertida pelo @transaction.atomic
        # Se não houve erros (ou os erros foram apenas avisos), a transação será commitada

        response_status = status.HTTP_200_OK if not erros else status.HTTP_400_BAD_REQUEST
        return Response({
            'message': f"Atualização concluída. {len(atualizados)} atualizados, {len(erros)} com erro.",
            'atualizados': atualizados,
            'erros': erros,
        }, status=response_status)


class ConfiguracaoEmpresaViewSet(viewsets.ModelViewSet):
    """
    API para gerenciar configurações da empresa (dados da empresa usuária).
    Assume que haverá apenas UMA instância deste modelo.
    """
    queryset = ConfiguracaoEmpresa.objects.all()
    serializer_class = ConfiguracaoEmpresaSerializer
    permission_classes = [IsAuthenticated] # Leitura para autenticados

    def get_permissions(self):
        """ Permissões mais restritas para escrita (apenas Admin). """
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated()]

    def list(self, request, *args, **kwargs):
        """
        Retorna a configuração da empresa (espera-se apenas uma).
        Se não existir, retorna um objeto vazio ou um status 404.
        """
        configuracao = ConfiguracaoEmpresa.objects.first() # Pega a primeira (e única)
        if not configuracao:
            # Retorna 404 se nenhuma configuração foi criada ainda
            return Response({"detail": "Configuração da empresa não encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(configuracao)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """
        Cria OU Atualiza a configuração da empresa.
        Garante que apenas uma instância exista.
        """
        configuracao_existente = ConfiguracaoEmpresa.objects.first()
        serializer = self.get_serializer(instance=configuracao_existente, data=request.data, partial=bool(configuracao_existente))

        serializer.is_valid(raise_exception=True)
        serializer.save()

        status_code = status.HTTP_200_OK if configuracao_existente else status.HTTP_201_CREATED
        return Response(serializer.data, status=status_code)

    # Desabilitar retrieve, update, destroy padrão pois tratamos tudo via list/create
    def retrieve(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def update(self, request, *args, **kwargs):
         return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def partial_update(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def destroy(self, request, *args, **kwargs):
         return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)


# ===============================================================
# ==> APIS PARA BACKUP E RESTAURAÇÃO
# ===============================================================

class BackupAPIView(viewsets.ViewSet):
    """
    API para gerenciar backups do banco de dados do sistema.
    Ações disponíveis: list, gerar, download, restaurar (simulado).
    Permissões: Apenas Administradores.
    """
    permission_classes = [IsAuthenticated, IsAdminUser] # Apenas Admins

    def list(self, request):
        """Listar backups registrados no banco de dados."""
        try:
            registros = RegistroBackup.objects.all().order_by('-data_hora')
            serializer = RegistroBackupSerializer(registros, many=True)
            return Response(serializer.data)
        except Exception as e:
            logger.warning("Erro ao listar backups: %s", e)
            return Response({"error": f"Erro interno ao listar backups: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def gerar(self, request):
        """Gerar um novo backup do banco de dados e registrar."""
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        registro = None # Para guardar o registro criado

        try:
            # --- Lógica Real de Backup (Adaptar ao seu banco) ---
            logger.info("INFO: Iniciando geração de backup...")
            db_settings = settings.DATABASES['default']
            db_name = db_settings.get('NAME')
            db_engine = db_settings.get('ENGINE', '')

            # Define diretório e nome do arquivo
            backup_dir = os.path.join(settings.MEDIA_ROOT, 'backups')
            os.makedirs(backup_dir, exist_ok=True) # Cria o diretório se não existir
            filename = f"backup_{db_name}_{timestamp}.sql" # Nome mais descritivo
            filepath = os.path.join(backup_dir, filename)

            command = None
            env = os.environ.copy() # Copia variáveis de ambiente

            # Comando para SQLite
            if 'sqlite3' in db_engine:
                command = f"sqlite3 \"{db_name}\" .dump > \"{filepath}\""
            # Comando para PostgreSQL (exemplo)
            elif 'postgresql' in db_engine:
                db_user = db_settings.get('USER')
                db_host = db_settings.get('HOST', 'localhost')
                db_port = db_settings.get('PORT', '5432')
                db_password = db_settings.get('PASSWORD') # Pega a senha das settings
                if db_password:
                     env['PGPASSWORD'] = db_password # Define PGPASSWORD no ambiente
                command = f"pg_dump -U {db_user} -h {db_host} -p {db_port} -d {db_name} -f \"{filepath}\""
            # Adicionar comandos para outros bancos (MySQL, etc.) se necessário
            else:
                raise NotImplementedError(f"Backup não implementado para o banco de dados: {db_engine}")

            # Executa o comando
            logger.info("Executando comando de backup: %s", command)
            result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True, encoding='utf-8', errors='ignore', env=env)
            logger.info(
                "Comando de backup concluído. Saída: %s, Erro: %s",
                result.stdout,
                result.stderr,
            )

            # Calcula tamanho e hash MD5
            if not os.path.exists(filepath):
                 raise FileNotFoundError(f"Arquivo de backup não foi criado em: {filepath}")
            tamanho_bytes = os.path.getsize(filepath)
            md5_hash = hashlib.md5()
            with open(filepath, 'rb') as f:
                while chunk := f.read(8192): # Lê em chunks para arquivos grandes
                    md5_hash.update(chunk)
            md5_hex = md5_hash.hexdigest()

            # Registra o backup no banco
            registro = RegistroBackup.objects.create(
                nome_arquivo=filename,
                tamanho_bytes=tamanho_bytes,
                md5_hash=md5_hex,
                localizacao=filepath,  # Salva o caminho completo
                usuario=request.user.username,
                status='completo'
            )
            logger.info("INFO: Backup %s gerado e registrado com sucesso.", filename)
            # --- Fim da Lógica Real ---

            # Retorna FileResponse para download direto do backup gerado
            response = FileResponse(
                open(filepath, 'rb'),
                as_attachment=True,
                filename=filename # Nome que aparecerá no download do usuário
            )
            # Opcional: Adicionar headers com informações do registro
            response['X-Backup-ID'] = registro.id
            response['X-Backup-Status'] = registro.status
            return response

        except subprocess.CalledProcessError as cpe:
            # Erro específico na execução do comando
            logger.warning("ERRO (Comando Backup): %s", cpe.stderr)
            error_details = f"Erro ao executar comando de backup: {cpe.stderr}"
            if registro:  # Se o registro foi criado antes do erro de comando
                registro.status = 'erro'
                registro.detalhes = error_details
                registro.save()
            else:  # Tenta criar registro de erro
                try:
                    RegistroBackup.objects.create(
                        nome_arquivo=f"erro_backup_{timestamp}.log", status='erro',
                        usuario=request.user.username, detalhes=error_details)
                except:
                    pass
            return Response({"error": "Erro ao executar comando de backup.", "details": cpe.stderr},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            # Outros erros (permissão, NotImplementedError, etc.)
            logger.warning("ERRO ao gerar backup: %s", e)
            traceback.print_exc()
            error_details = f"Erro ao gerar backup: {str(e)}\n{traceback.format_exc()}"
            if registro:  # Atualiza registro se já criado
                registro.status = 'erro'
                registro.detalhes = error_details
                registro.save()
            else:  # Tenta criar registro de erro
                try:
                    RegistroBackup.objects.create(
                        nome_arquivo=f"erro_backup_{timestamp}.log", status='erro',
                        usuario=request.user.username, detalhes=error_details[:999])  # Limita tamanho do detalhe
                except:
                    pass
            return Response({"error": f"Erro inesperado ao gerar backup: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """Baixar um arquivo de backup existente pelo ID do registro."""
        registro = get_object_or_404(RegistroBackup, pk=pk)

        # Verifica se o arquivo ainda existe na localização registrada
        if not registro.localizacao or not os.path.exists(registro.localizacao):
             return Response({"error": f"Arquivo de backup '{registro.nome_arquivo}' não encontrado na localização registrada."},
                            status=status.HTTP_404_NOT_FOUND)

        try:
            # Retorna o arquivo para download
            return FileResponse(
                open(registro.localizacao, 'rb'),
                as_attachment=True,
                filename=registro.nome_arquivo # Usa o nome original para o download
            )
        except Exception as e:
            logger.warning("Erro ao baixar backup %s: %s", registro.nome_arquivo, e)
            return Response({"error": f"Erro ao tentar baixar o arquivo: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def restaurar(self, request):
        """
        Restaurar a partir de um arquivo de backup enviado.
        Atenção: Operação perigosa, substitui dados atuais!
        Implementação atual é SIMULADA. Restauração real deve ser manual.
        """
        # Verificar se um arquivo foi enviado no campo 'arquivo_backup'
        backup_file = request.FILES.get('arquivo_backup')
        if not backup_file:
             return Response({"error": "Nenhum arquivo de backup enviado no campo 'arquivo_backup'."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Verificar extensão (simples verificação)
        if not backup_file.name.lower().endswith('.sql'):
             # Poderia aceitar .dump, .backup dependendo do banco
             return Response({"error": "Arquivo inválido. Apenas arquivos .sql são suportados (nesta implementação simulada)."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            # --- Lógica Real de Restauração (NÃO IMPLEMENTADA AQUI) ---
            # A restauração real é complexa e arriscada via web.
            # O ideal é salvar o arquivo e instruir o admin a restaurar manualmente.

            logger.info(
                "INFO: Solicitação de restauração recebida com arquivo %s (%s bytes) pelo usuário %s.",
                backup_file.name,
                backup_file.size,
                request.user.username,
            )

            # Exemplo Simulado: Salva o arquivo temporariamente para inspeção
            temp_dir = tempfile.mkdtemp(prefix="backup_restore_")
            temp_path = os.path.join(temp_dir, backup_file.name)
            try:
                with open(temp_path, 'wb+') as destination:
                    for chunk in backup_file.chunks():
                        destination.write(chunk)
                logger.info("INFO: Arquivo de backup salvo temporariamente em %s.", temp_path)
                # Aqui, você poderia adicionar lógica para notificar o admin
            finally:
                 # É importante limpar o diretório temporário depois,
                 # a menos que o admin precise do arquivo lá.
                # shutil.rmtree(temp_dir) # Descomentar se quiser limpar automaticamente
                logger.info("INFO: Limpeza do diretório temporário %s pode ser necessária.", temp_dir)


            # Retorna mensagem indicando que a restauração é manual
            return Response({
                "message": "Arquivo de backup recebido com sucesso. A restauração do banco de dados deve ser realizada manualmente por um administrador utilizando este arquivo.",
                "arquivo_recebido": backup_file.name,
                "tamanho_bytes": backup_file.size,
                "local_temporario": temp_path # Informa onde foi salvo (APENAS PARA DEBUG/ADMIN)
            }, status=status.HTTP_202_ACCEPTED) # 202 Accepted indica que a requisição foi aceita, mas a ação principal (restauração) não foi feita aqui.
            # --- Fim da Lógica (Simulada) ---

        except Exception as e:
            logger.warning("ERRO ao processar solicitação de restauração: %s", e)
            traceback.print_exc()
            return Response({"error": f"Erro ao processar pedido de restauração: {str(e)}"},
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# ===============================================================
# ==> API DE RELATÓRIOS (Estrutura)
# ===============================================================

class RelatorioAPIView(APIView):
    """
    API para geração de relatórios em diversos formatos.
    Suporta diferentes tipos de relatórios e formatos de saída.
    Funcionalidade pendente de implementação.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, format=None):
        """
        Endpoint para gerar relatórios.
        Parâmetros via query string:
        - tipo: Tipo de relatório (faturamento, veiculos, ctes, mdfes, pagamentos, km_rodado, manutencoes) - obrigatório
        - formato: Formato de saída (csv, xlsx, pdf, json) - opcional, default csv
        - filtros: JSON (URL encoded) com filtros específicos para o relatório (ex: data_inicio, data_fim, placa, etc.) - opcional
        """
        params = request.query_params
        tipo = params.get('tipo')
        formato = params.get('formato', 'csv').lower() # Default csv
        filtros_json = params.get('filtros', '{}')

        if not tipo:
            return Response({"error": "Parâmetro 'tipo' de relatório é obrigatório."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Decodifica e parseia os filtros JSON
            filtros = json.loads(filtros_json) if filtros_json else {}
        except json.JSONDecodeError:
            return Response({"error": "Formato de 'filtros' inválido. Deve ser um objeto JSON válido (URL encoded)."}, status=status.HTTP_400_BAD_REQUEST)

        # Processar datas comuns se fornecidas nos filtros
        data_inicio = None
        data_fim = None
        if 'data_inicio' in filtros:
            try: data_inicio = datetime.strptime(filtros['data_inicio'], '%Y-%m-%d').date()
            except (ValueError, TypeError): return Response({"error": "Formato de data_inicio inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        if 'data_fim' in filtros:
            try: data_fim = datetime.strptime(filtros['data_fim'], '%Y-%m-%d').date()
            except (ValueError, TypeError): return Response({"error": "Formato de data_fim inválido. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        # --- Chamada da Lógica de Geração Específica ---
        # A implementação real ocorreria aqui, chamando funções auxiliares
        try:
            if tipo == 'faturamento':
                dados = self._gerar_relatorio_faturamento(data_inicio, data_fim, filtros)
            elif tipo == 'veiculos':
                dados = self._gerar_relatorio_veiculos(filtros)
            # ... adicionar outros tipos ...
            elif tipo == 'manutencoes':
                dados = self._gerar_relatorio_manutencoes(data_inicio, data_fim, filtros)
            else:
                 return Response({"error": f"Tipo de relatório '{tipo}' não suportado ou não implementado."}, status=status.HTTP_400_BAD_REQUEST)

            # --- Formatação da Saída ---
            if formato == 'csv':
                 filename = f"relatorio_{tipo}_{timezone.now().strftime('%Y%m%d')}.csv"
                 return self._gerar_csv(dados, filename)
            elif formato == 'json':
                 return Response(dados)
            # elif formato == 'xlsx':
            #    # Implementar geração de XLSX (requer openpyxl ou similar)
            #    return Response({"error": "Formato XLSX não implementado."}, status=501)
            # elif formato == 'pdf':
            #    # Implementar geração de PDF (requer reportlab, weasyprint ou similar)
            #    return Response({"error": "Formato PDF não implementado."}, status=501)
            else:
                 return Response({"error": f"Formato '{formato}' não suportado."}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.warning("Erro ao gerar relatório '%s': %s", tipo, e)
            traceback.print_exc()
            return Response({"error": f"Erro interno ao gerar relatório: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # --- Métodos Auxiliares de Geração (NÃO IMPLEMENTADOS) ---
    def _gerar_relatorio_faturamento(self, data_inicio, data_fim, filtros):
        """Gera dados agregados de faturamento por mês."""
        qs = CTePrestacaoServico.objects.select_related('cte__identificacao')
        if data_inicio:
            qs = qs.filter(cte__identificacao__data_emissao__date__gte=data_inicio)
        if data_fim:
            qs = qs.filter(cte__identificacao__data_emissao__date__lte=data_fim)

        agregados = qs.annotate(mes=TruncMonth('cte__identificacao__data_emissao'))\
            .values('mes')\
            .annotate(valor=Sum('valor_total_prestado'))\
            .order_by('mes')

        dados = []
        for item in agregados:
            mes = item['mes'].strftime('%Y-%m') if item['mes'] else 'N/A'
            dados.append({'mes': mes, 'valor': float(item['valor'] or 0)})
        return dados

    def _gerar_relatorio_veiculos(self, filtros):
        """Retorna dados do cadastro de veículos."""
        qs = Veiculo.objects.all()
        if 'ativo' in filtros:
            qs = qs.filter(ativo=bool(filtros['ativo']))
        if 'placa' in filtros:
            qs = qs.filter(placa__icontains=filtros['placa'])
        serializer = VeiculoSerializer(qs, many=True)
        return serializer.data

    def _gerar_relatorio_ctes(self, data_inicio, data_fim, filtros):
        """(NÃO IMPLEMENTADO) Gera dados para o relatório de CT-es."""
        logger.info("INFO: Gerando relatório de CT-es com filtros: %s", filtros)
        return {"message": "Relatório de CT-es ainda não implementado.", "filtros": filtros}

    def _gerar_relatorio_mdfes(self, data_inicio, data_fim, filtros):
        """(NÃO IMPLEMENTADO) Gera dados para o relatório de MDF-es."""
        logger.info("INFO: Gerando relatório de MDF-es com filtros: %s", filtros)
        return {"message": "Relatório de MDF-es ainda não implementado.", "filtros": filtros}

    def _gerar_relatorio_pagamentos(self, data_inicio, data_fim, filtros):
        """(NÃO IMPLEMENTADO) Gera dados para o relatório de pagamentos."""
        logger.info("INFO: Gerando relatório de pagamentos com filtros: %s", filtros)
        return {"message": "Relatório de pagamentos ainda não implementado.", "filtros": filtros}

    def _gerar_relatorio_km_rodado(self, data_inicio, data_fim, filtros):
        """(NÃO IMPLEMENTADO) Gera dados para o relatório de KM rodado."""
        logger.info("INFO: Gerando relatório de KM rodado com filtros: %s", filtros)
        return {"message": "Relatório de KM rodado ainda não implementado.", "filtros": filtros}

    def _gerar_relatorio_manutencoes(self, data_inicio, data_fim, filtros):
        """(NÃO IMPLEMENTADO) Gera dados para o relatório de manutenções."""
        logger.info("INFO: Gerando relatório de manutenções com filtros: %s", filtros)
        # Exemplo básico de busca (sem filtros específicos da API, apenas data)
        qs = ManutencaoVeiculo.objects.all()
        if data_inicio: qs = qs.filter(data_servico__gte=data_inicio)
        if data_fim: qs = qs.filter(data_servico__lte=data_fim)
        # Aplicar outros filtros de 'filtros' aqui...
        serializer = ManutencaoVeiculoSerializer(qs, many=True)
        return serializer.data # Retorna dados serializados para CSV/JSON

    # --- Método Auxiliar para Gerar CSV ---
    def _gerar_csv(self, dados, nome_arquivo):
        """Função auxiliar para gerar arquivos CSV a partir de uma lista de dicts."""
        if not dados or not isinstance(dados, list) or not isinstance(dados[0], dict):
            # Se dados não for uma lista de dicionários, retorna erro ou mensagem
            if isinstance(dados, dict) and 'message' in dados:
                return Response(dados, status=status.HTTP_501_NOT_IMPLEMENTED) # Retorna msg de não implementado
            return Response({"error": "Formato de dados inválido para gerar CSV."},
                           status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Pega cabeçalhos do primeiro dicionário
        fieldnames = list(dados[0].keys())
        output = StringIO()
        writer = csv.DictWriter(output, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(dados)

        response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8') # Adiciona charset
        response['Content-Disposition'] = f'attachment; filename="{nome_arquivo}"'
        return response