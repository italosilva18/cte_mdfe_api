# transport/serializers/cte_serializers.py

from rest_framework import serializers

# Importar todos os modelos CT-e e o Endereco base
from ..models import (
    Endereco, # Necessário para obter os campos de Endereco
    CTeDocumento, CTeIdentificacao, CTeComplemento, CTeObservacaoContribuinte,
    CTeObservacaoFisco, CTeEmitente, CTeRemetente, CTeExpedidor, CTeRecebedor,
    CTEDestinatario, CTePrestacaoServico, CTeComponenteValor, CTeTributos,
    CTeCarga, CTeQuantidadeCarga, CTeDocumentoTransportado, CTeSeguro,
    CTeModalRodoviario, CTeVeiculoRodoviario, CTeMotorista, CTeAutXML,
    CTeResponsavelTecnico, CTeProtocoloAutorizacao, CTeSuplementar,
    CTeCancelamento,
)

# Importar serializers base (se houver - como EnderecoSerializer)
# from .base_serializers import EnderecoSerializer # Descomente se EnderecoSerializer foi criado em base_serializers.py

# =========================
# === Serializers CT-e ===
# =========================

# --- Serializers Detalhados para Relações do CT-e ---

class CTeObservacaoContribuinteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeObservacaoContribuinte
        fields = ['campo', 'texto']

class CTeObservacaoFiscoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeObservacaoFisco
        fields = ['campo', 'texto']

class CTeIdentificacaoSerializer(serializers.ModelSerializer):
    # Se EnderecoSerializer existir em base_serializers:
    # tomador_endereco = EnderecoSerializer(read_only=True, allow_null=True)
    # Senão, definimos os campos do endereço manualmente se necessário para leitura:
    tomador_logradouro = serializers.CharField(source='tomador_endereco.logradouro', read_only=True, allow_null=True)
    tomador_numero = serializers.CharField(source='tomador_endereco.numero', read_only=True, allow_null=True)
    # ... adicionar outros campos do endereço do tomador se precisar expor ...

    # Campo formatado para data/hora
    data_emissao_formatada = serializers.DateTimeField(source='data_emissao', format='%d/%m/%Y %H:%M', read_only=True, allow_null=True)

    class Meta:
        model = CTeIdentificacao
        # Exclui as chaves estrangeiras e ID, inclui todos os outros campos do modelo
        exclude = ['id', 'cte', 'tomador_endereco'] # Exclui a FK direta para o Endereco

class CTeComplementoSerializer(serializers.ModelSerializer):
    # Relações aninhadas (nested relationships)
    observacoes_contribuinte = CTeObservacaoContribuinteSerializer(many=True, read_only=True)
    observacoes_fisco = CTeObservacaoFiscoSerializer(many=True, read_only=True)

    class Meta:
        model = CTeComplemento
        exclude = ['id', 'cte']

# Serializers para Entidades Fiscais (Emitente, Remetente, etc.)
# Nota: Estes serializers listam manualmente os campos herdados de Endereco.
# Uma abordagem alternativa seria usar o EnderecoSerializer aninhado ou herança de serializers.
class CTeEmitenteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeEmitente
        # Lista todos os campos de Endereco + campos específicos de CTeEmitente
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email', 'crt']
        # Exclui os campos internos da herança e a FK para CTeDocumento
        exclude = ['cte', 'endereco_ptr']

class CTeRemetenteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeRemetente
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email']
        exclude = ['cte', 'endereco_ptr']

class CTeExpedidorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeExpedidor
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email']
        exclude = ['cte', 'endereco_ptr']

class CTeRecebedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeRecebedor
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email']
        exclude = ['cte', 'endereco_ptr']

class CTEDestinatarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTEDestinatario
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email', 'isuf']
        exclude = ['cte', 'endereco_ptr']


class CTeComponenteValorSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeComponenteValor
        fields = ['nome', 'valor']

class CTePrestacaoServicoSerializer(serializers.ModelSerializer):
    componentes = CTeComponenteValorSerializer(many=True, read_only=True)
    class Meta:
        model = CTePrestacaoServico
        exclude = ['id', 'cte']

class CTeTributosSerializer(serializers.ModelSerializer):
    # O campo 'icms' é um JSONField, o DRF lida com ele automaticamente
    class Meta:
        model = CTeTributos
        exclude = ['id', 'cte']

class CTeQuantidadeCargaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeQuantidadeCarga
        fields = ['codigo_unidade', 'tipo_medida', 'quantidade']

class CTeCargaSerializer(serializers.ModelSerializer):
    quantidades = CTeQuantidadeCargaSerializer(many=True, read_only=True)
    class Meta:
        model = CTeCarga
        exclude = ['id', 'cte']

class CTeDocumentoTransportadoSerializer(serializers.ModelSerializer):
    # Formata datas para leitura se necessário
    data_emissao_nf_fmt = serializers.DateField(source='data_emissao_nf', format='%d/%m/%Y', read_only=True, allow_null=True)
    data_emissao_outros_fmt = serializers.DateField(source='data_emissao_outros', format='%d/%m/%Y', read_only=True, allow_null=True)
    class Meta:
        model = CTeDocumentoTransportado
        exclude = ['id', 'cte']

class CTeSeguroSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeSeguro
        exclude = ['id', 'cte']

class CTeVeiculoRodoviarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeVeiculoRodoviario
        exclude = ['id', 'modal']

class CTeMotoristaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeMotorista
        exclude = ['id', 'modal']

class CTeModalRodoviarioSerializer(serializers.ModelSerializer):
    veiculos = CTeVeiculoRodoviarioSerializer(many=True, read_only=True)
    motoristas = CTeMotoristaSerializer(many=True, read_only=True)
    class Meta:
        model = CTeModalRodoviario
        exclude = ['id', 'cte']

class CTeAutXMLSerializer(serializers.ModelSerializer):
     class Meta:
        model = CTeAutXML
        # Exclui id e cte, mostra apenas cnpj/cpf
        fields = ['cnpj', 'cpf']

class CTeResponsavelTecnicoSerializer(serializers.ModelSerializer):
     class Meta:
        model = CTeResponsavelTecnico
        exclude = ['id', 'cte']

class CTeProtocoloAutorizacaoSerializer(serializers.ModelSerializer):
     data_recebimento_formatada = serializers.DateTimeField(source='data_recebimento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
     class Meta:
        model = CTeProtocoloAutorizacao
        exclude = ['id', 'cte']

class CTeSuplementarSerializer(serializers.ModelSerializer):
     class Meta:
        model = CTeSuplementar
        exclude = ['id', 'cte']

class CTeCancelamentoSerializer(serializers.ModelSerializer):
      dh_evento_formatada = serializers.DateTimeField(source='dh_evento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
      dh_reg_evento_formatada = serializers.DateTimeField(source='dh_reg_evento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
      class Meta:
        model = CTeCancelamento
        # Exclui campos internos e o arquivo XML binário
        exclude = ['id', 'cte', 'arquivo_xml_evento']

# --- Serializers Principais para CT-e (Listagem e Detalhe) ---

class CTeDocumentoListSerializer(serializers.ModelSerializer):
    """ Serializer otimizado para listagem de CT-es (usado por CTeDocumentoViewSet). """
    # Campos derivados de relações para facilitar a exibição na lista
    numero_cte = serializers.IntegerField(source='identificacao.numero', read_only=True, allow_null=True)
    serie_cte = serializers.IntegerField(source='identificacao.serie', read_only=True, allow_null=True)
    data_emissao = serializers.DateTimeField(source='identificacao.data_emissao', read_only=True, allow_null=True, format='%d/%m/%Y %H:%M')
    remetente_nome = serializers.CharField(source='remetente.razao_social', read_only=True, allow_null=True)
    destinatario_nome = serializers.CharField(source='destinatario.razao_social', read_only=True, allow_null=True)
    valor_total = serializers.DecimalField(source='prestacao.valor_total_prestado', max_digits=15, decimal_places=2, read_only=True, allow_null=True)
    uf_inicio = serializers.CharField(source='identificacao.uf_ini', read_only=True, allow_null=True)
    uf_fim = serializers.CharField(source='identificacao.uf_fim', read_only=True, allow_null=True)
    placa_principal = serializers.SerializerMethodField() # Obtém a placa via método
    status = serializers.SerializerMethodField() # Obtém o status via método

    class Meta:
        model = CTeDocumento
        fields = [
            'id', 'chave', 'numero_cte', 'serie_cte', 'modalidade', 'data_emissao', 'remetente_nome',
            'destinatario_nome', 'uf_inicio', 'uf_fim', 'valor_total',
            'placa_principal', 'status', 'processado', 'data_upload'
        ]
        read_only_fields = fields # Garante que a lista seja apenas leitura

    def get_placa_principal(self, obj):
        """ Pega a placa do primeiro veículo associado ao modal rodoviário, se existir. """
        try:
             # Acessa o modal e depois a lista de veículos, pegando o primeiro
             return obj.modal_rodoviario.veiculos.first().placa
        except AttributeError: # Caso modal_rodoviario ou veiculos não existam
             return None

    def get_status(self, obj):
        """ Determina o status consolidado do CT-e. """
        if hasattr(obj, 'cancelamento') and obj.cancelamento and obj.cancelamento.c_stat == 135:
            return "Cancelado"
        if hasattr(obj, 'protocolo') and obj.protocolo:
            return "Autorizado" if obj.protocolo.codigo_status == 100 else f"Rejeitado ({obj.protocolo.codigo_status})"
        if obj.processado:
            return "Processado (s/ Prot.)"
        return "Pendente"


class CTeDocumentoDetailSerializer(serializers.ModelSerializer):
    """ Serializer para a visualização detalhada de um CT-e processado. """
    # Usa os serializers detalhados definidos acima para aninhar as informações
    identificacao = CTeIdentificacaoSerializer(read_only=True)
    complemento = CTeComplementoSerializer(read_only=True, allow_null=True)
    emitente = CTeEmitenteSerializer(read_only=True)
    remetente = CTeRemetenteSerializer(read_only=True)
    expedidor = CTeExpedidorSerializer(read_only=True, allow_null=True)
    recebedor = CTeRecebedorSerializer(read_only=True, allow_null=True)
    destinatario = CTEDestinatarioSerializer(read_only=True)
    prestacao = CTePrestacaoServicoSerializer(read_only=True)
    tributos = CTeTributosSerializer(read_only=True, allow_null=True)
    carga = CTeCargaSerializer(read_only=True, allow_null=True)
    modal_rodoviario = CTeModalRodoviarioSerializer(read_only=True, allow_null=True)
    resp_tecnico = CTeResponsavelTecnicoSerializer(read_only=True, allow_null=True)
    protocolo = CTeProtocoloAutorizacaoSerializer(read_only=True, allow_null=True)
    suplementar = CTeSuplementarSerializer(read_only=True, allow_null=True)
    cancelamento = CTeCancelamentoSerializer(read_only=True, allow_null=True)
    # Relações ManyToMany
    documentos_transportados = CTeDocumentoTransportadoSerializer(many=True, read_only=True)
    seguros = CTeSeguroSerializer(many=True, read_only=True)
    autorizados_xml = CTeAutXMLSerializer(many=True, read_only=True)
    # Campo derivado
    status_geral = serializers.SerializerMethodField()

    class Meta:
        model = CTeDocumento
        # Lista os campos a serem incluídos na resposta detalhada
        fields = [
            'id', 'chave', 'versao', 'modalidade', 'data_upload', 'processado', 'status_geral',
            'identificacao', 'complemento', 'emitente', 'remetente', 'expedidor',
            'recebedor', 'destinatario', 'prestacao', 'tributos', 'carga',
            'modal_rodoviario', 'resp_tecnico', 'protocolo', 'suplementar', 'cancelamento',
            'documentos_transportados', 'seguros', 'autorizados_xml',
            # 'xml_original' # Omitido por padrão para não poluir, pode ser acessado via /xml/ endpoint
        ]
        read_only_fields = fields # Garante que a visualização detalhada seja apenas leitura

    def get_status_geral(self, obj):
        """ Reutiliza a lógica de status do serializer de lista. """
        return CTeDocumentoListSerializer().get_status(obj)