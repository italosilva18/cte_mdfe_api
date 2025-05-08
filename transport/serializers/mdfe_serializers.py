# transport/serializers/mdfe_serializers.py

from rest_framework import serializers

# Importar modelos base e MDF-e
from ..models import (
    Endereco, # Necessário para obter os campos de Endereco
    # Modelos MDF-e
    MDFeDocumento, MDFeIdentificacao, MDFeMunicipioCarregamento, MDFePercurso,
    MDFeEmitente, MDFeModalRodoviario, MDFeVeiculoTracao, MDFeVeiculoReboque,
    MDFeCondutor, MDFeCIOT, MDFeValePedagio, MDFeContratante,
    MDFeMunicipioDescarga, MDFeDocumentosVinculados, MDFeProdutoPerigoso,
    MDFeSeguroCarga, MDFeAverbacaoSeguro, MDFeProdutoPredominante, MDFeTotais,
    MDFeLacreRodoviario, MDFeAutXML, MDFeInformacoesAdicionais,
    MDFeResponsavelTecnico, MDFeProtocoloAutorizacao, MDFeSuplementar,
    MDFeCancelamento, MDFeCancelamentoEncerramento,
    # Modelo CT-e necessário para MDFeDocumentosVinculadosSerializer
    CTeDocumento
)

# Importar serializers base e de outros módulos se necessário
# from .base_serializers import EnderecoSerializer # Descomente se usar
from .cte_serializers import CTeDocumentoListSerializer # Necessário para aninhar info do CT-e

# ==========================
# === Serializers MDF-e ===
# ==========================

# --- Serializers Detalhados para Relações do MDF-e ---

class MDFeMunicipioCarregamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeMunicipioCarregamento
        fields = ['c_mun_carrega', 'x_mun_carrega']

class MDFePercursoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFePercurso
        fields = ['uf_per']

class MDFeIdentificacaoSerializer(serializers.ModelSerializer):
    municipios_carregamento = MDFeMunicipioCarregamentoSerializer(many=True, read_only=True)
    percurso = MDFePercursoSerializer(many=True, read_only=True)
    dh_emi_formatada = serializers.DateTimeField(source='dh_emi', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
    dh_ini_viagem_formatada = serializers.DateTimeField(source='dh_ini_viagem', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)

    class Meta:
        model = MDFeIdentificacao
        exclude = ['id', 'mdfe']

class MDFeEmitenteSerializer(serializers.ModelSerializer):
     # Lista manualmente os campos herdados + específicos
     class Meta:
        model = MDFeEmitente
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email']
        exclude = ['mdfe', 'endereco_ptr']

class MDFeVeiculoTracaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeVeiculoTracao
        exclude = ['id', 'modal']

class MDFeVeiculoReboqueSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeVeiculoReboque
        exclude = ['id', 'modal']

class MDFeCondutorSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeCondutor
        fields = ['nome', 'cpf'] # Exclui id e mdfe

class MDFeCIOTSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeCIOT
        exclude = ['id', 'modal']

class MDFeValePedagioSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeValePedagio
        exclude = ['id', 'modal']

class MDFeContratanteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeContratante
        exclude = ['id', 'modal']

class MDFeModalRodoviarioSerializer(serializers.ModelSerializer):
    # Relações aninhadas
    veiculo_tracao = MDFeVeiculoTracaoSerializer(read_only=True, allow_null=True)
    veiculos_reboque = MDFeVeiculoReboqueSerializer(many=True, read_only=True)
    ciots = MDFeCIOTSerializer(many=True, read_only=True)
    vales_pedagio = MDFeValePedagioSerializer(many=True, read_only=True)
    contratantes = MDFeContratanteSerializer(many=True, read_only=True)

    class Meta:
        model = MDFeModalRodoviario
        exclude = ['id', 'mdfe']

class MDFeProdutoPerigosoSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeProdutoPerigoso
        exclude = ['id', 'documento_vinculado']

class MDFeDocumentosVinculadosSerializer(serializers.ModelSerializer):
    # Usa o serializer de lista do CT-e para mostrar um resumo do CT-e relacionado
    cte_info = CTeDocumentoListSerializer(source='cte_relacionado', read_only=True, allow_null=True)
    produtos_perigosos = MDFeProdutoPerigosoSerializer(many=True, read_only=True)
    tipo_doc = serializers.SerializerMethodField() # Campo calculado

    class Meta:
        model = MDFeDocumentosVinculados
        # Inclui apenas os campos relevantes para a exibição do vínculo
        fields = ['chave_documento', 'tipo_doc', 'seg_cod_barras', 'ind_reentrega', 'cte_info', 'produtos_perigosos']

    def get_tipo_doc(self, obj):
        """ Determina o tipo de documento baseado na chave. """
        try:
            modelo = obj.chave_documento[20:22]
            return {'57': 'CT-e', '55': 'NF-e', '67': 'CT-e OS'}.get(modelo, 'Outro')
        except: # Em caso de erro (chave inválida, etc.)
            return 'Desconhecido'

class MDFeMunicipioDescargaSerializer(serializers.ModelSerializer):
    # Aninha os documentos vinculados a este município
    docs_vinculados = MDFeDocumentosVinculadosSerializer(source='docs_vinculados_municipio', many=True, read_only=True)
    class Meta:
        model = MDFeMunicipioDescarga
        fields = ['c_mun_descarga', 'x_mun_descarga', 'docs_vinculados']

class MDFeAverbacaoSeguroSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeAverbacaoSeguro
        fields = ['numero'] # Apenas o número da averbação

class MDFeSeguroCargaSerializer(serializers.ModelSerializer):
    averbacoes = MDFeAverbacaoSeguroSerializer(many=True, read_only=True)
    class Meta:
        model = MDFeSeguroCarga
        exclude = ['id', 'mdfe']

class MDFeProdutoPredominanteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeProdutoPredominante
        exclude = ['id', 'mdfe']

class MDFeTotaisSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeTotais
        exclude = ['id', 'mdfe']

class MDFeLacreRodoviarioSerializer(serializers.ModelSerializer):
     class Meta:
        model = MDFeLacreRodoviario
        fields = ['numero'] # Apenas o número do lacre

class MDFeAutXMLSerializer(serializers.ModelSerializer):
     class Meta:
        model = MDFeAutXML
        fields = ['cnpj', 'cpf'] # Apenas os dados de autorização

class MDFeInformacoesAdicionaisSerializer(serializers.ModelSerializer):
     class Meta:
        model = MDFeInformacoesAdicionais
        exclude = ['id', 'mdfe']

class MDFeResponsavelTecnicoSerializer(serializers.ModelSerializer):
     class Meta:
        model = MDFeResponsavelTecnico
        exclude = ['id', 'mdfe']

class MDFeProtocoloAutorizacaoSerializer(serializers.ModelSerializer):
     data_recebimento_formatada = serializers.DateTimeField(source='data_recebimento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
     class Meta:
        model = MDFeProtocoloAutorizacao
        exclude = ['id', 'mdfe']

class MDFeSuplementarSerializer(serializers.ModelSerializer):
     class Meta:
        model = MDFeSuplementar
        exclude = ['id', 'mdfe']

class MDFeCancelamentoSerializer(serializers.ModelSerializer):
    dh_evento_formatada = serializers.DateTimeField(source='dh_evento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
    dh_reg_evento_formatada = serializers.DateTimeField(source='dh_reg_evento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
    class Meta:
        model = MDFeCancelamento
        exclude = ['id', 'mdfe', 'arquivo_xml_evento'] # Exclui arquivo binário

class MDFeCancelamentoEncerramentoSerializer(serializers.ModelSerializer):
    """Serializer para o modelo de cancelamento de encerramento de MDF-e."""
    dh_evento_formatada = serializers.DateTimeField(source='dh_evento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
    dh_reg_evento_formatada = serializers.DateTimeField(source='dh_reg_evento', format='%d/%m/%Y %H:%M:%S', read_only=True, allow_null=True)
    class Meta:
        model = MDFeCancelamentoEncerramento
        exclude = ['id', 'mdfe', 'arquivo_xml_evento'] # Exclui arquivo binário

# --- Serializers Principais para MDF-e (Listagem e Detalhe) ---

class MDFeDocumentoListSerializer(serializers.ModelSerializer):
    """ Serializer otimizado para listagem de MDF-es (usado por MDFeDocumentoViewSet). """
    numero_mdfe = serializers.IntegerField(source='identificacao.n_mdf', read_only=True, allow_null=True)
    data_emissao = serializers.DateTimeField(source='identificacao.dh_emi', read_only=True, allow_null=True, format='%d/%m/%Y %H:%M')
    uf_inicio = serializers.CharField(source='identificacao.uf_ini', read_only=True, allow_null=True)
    uf_fim = serializers.CharField(source='identificacao.uf_fim', read_only=True, allow_null=True)
    placa_tracao = serializers.CharField(source='modal_rodoviario.veiculo_tracao.placa', read_only=True, allow_null=True)
    # Campo calculado para status
    status = serializers.SerializerMethodField()
    # Adiciona contagem de documentos para a lista
    documentos_count = serializers.SerializerMethodField()

    class Meta:
        model = MDFeDocumento
        fields = [
            'id', 'chave', 'numero_mdfe', 'data_emissao', 'uf_inicio', 'uf_fim',
            'placa_tracao', 'documentos_count', 'status', 'processado', 'data_upload',
            'encerrado' # Inclui o campo de encerrado na lista
        ]
        read_only_fields = fields # Garante que a lista seja apenas leitura

    def get_status(self, obj):
        """ Determina o status consolidado do MDF-e. """
        if hasattr(obj, 'cancelamento') and obj.cancelamento and obj.cancelamento.c_stat == 135:
            return "Cancelado"
        if obj.encerrado: # Checa o campo 'encerrado' do modelo
             # Verifica se o encerramento foi cancelado
             if hasattr(obj, 'cancelamento_encerramento') and obj.cancelamento_encerramento and obj.cancelamento_encerramento.c_stat == 135:
                 return "Enc. Cancelado"
             return "Encerrado"
        if hasattr(obj, 'protocolo') and obj.protocolo:
            return "Autorizado" if obj.protocolo.codigo_status == 100 else f"Rejeitado ({obj.protocolo.codigo_status})"
        if obj.processado:
            return "Processado (s/ Prot.)"
        return "Pendente"

    def get_documentos_count(self, obj):
        """ Retorna a contagem de documentos vinculados (otimizado se pré-carregado). """
        # Se você pré-carregar a contagem na view (com annotate), pode acessar aqui
        if hasattr(obj, 'docs_count_annotation'):
             return obj.docs_count_annotation
        # Senão, faz a contagem (menos eficiente para listas grandes)
        return obj.docs_vinculados_mdfe.count()

class MDFeDocumentoDetailSerializer(serializers.ModelSerializer):
    """ Serializer para a visualização detalhada de um MDF-e processado. """
    # Usa os serializers detalhados definidos acima
    identificacao = MDFeIdentificacaoSerializer(read_only=True)
    emitente = MDFeEmitenteSerializer(read_only=True)
    modal_rodoviario = MDFeModalRodoviarioSerializer(read_only=True, allow_null=True)
    prod_pred = MDFeProdutoPredominanteSerializer(read_only=True, allow_null=True)
    totais = MDFeTotaisSerializer(read_only=True)
    adicional = MDFeInformacoesAdicionaisSerializer(read_only=True, allow_null=True)
    resp_tecnico = MDFeResponsavelTecnicoSerializer(read_only=True, allow_null=True)
    protocolo = MDFeProtocoloAutorizacaoSerializer(read_only=True, allow_null=True)
    suplementar = MDFeSuplementarSerializer(read_only=True, allow_null=True)
    cancelamento = MDFeCancelamentoSerializer(read_only=True, allow_null=True)
    cancelamento_encerramento = MDFeCancelamentoEncerramentoSerializer(read_only=True, allow_null=True)
    # Relações ManyToMany
    municipios_descarga = MDFeMunicipioDescargaSerializer(many=True, read_only=True) # Inclui os documentos aninhados
    condutores = MDFeCondutorSerializer(many=True, read_only=True)
    seguros_carga = MDFeSeguroCargaSerializer(many=True, read_only=True)
    lacres_rodoviarios = MDFeLacreRodoviarioSerializer(many=True, read_only=True)
    autorizados_xml = MDFeAutXMLSerializer(many=True, read_only=True)
    # Campo derivado
    status_geral = serializers.SerializerMethodField()
    # Informações de encerramento formatadas
    encerramento_info = serializers.SerializerMethodField()

    class Meta:
        model = MDFeDocumento
        # Lista todos os campos a serem incluídos no detalhe
        fields = [
            'id', 'chave', 'versao', 'data_upload', 'processado', 'status_geral',
            'encerrado', 'data_encerramento', 'municipio_encerramento_cod',
            'uf_encerramento', 'protocolo_encerramento', 'encerramento_info',
            'identificacao', 'emitente', 'modal_rodoviario', 'prod_pred', 'totais',
            'adicional', 'resp_tecnico', 'protocolo', 'suplementar', 'cancelamento',
            'cancelamento_encerramento', 'municipios_descarga', 'condutores',
            'seguros_carga', 'lacres_rodoviarios', 'autorizados_xml',
            # 'xml_original' # Omitido
        ]
        read_only_fields = fields # Garante que a visualização detalhada seja apenas leitura

    def get_status_geral(self, obj):
        """ Reutiliza a lógica de status do serializer de lista. """
        return MDFeDocumentoListSerializer().get_status(obj)

    def get_encerramento_info(self, obj):
        """ Retorna informações formatadas sobre o encerramento do MDF-e. """
        if obj.encerrado:
            # Verifica se o encerramento foi cancelado
            if hasattr(obj, 'cancelamento_encerramento') and obj.cancelamento_encerramento and obj.cancelamento_encerramento.c_stat == 135:
                 return {
                     'status': 'Encerramento Cancelado',
                     'data_cancelamento': obj.cancelamento_encerramento.dh_reg_evento.strftime('%d/%m/%Y %H:%M') if obj.cancelamento_encerramento.dh_reg_evento else None,
                     'protocolo_cancelamento': obj.cancelamento_encerramento.n_prot_retorno,
                     'justificativa_cancelamento': obj.cancelamento_encerramento.x_just
                 }
            else:
                 return {
                     'status': 'Encerrado',
                     'data': obj.data_encerramento.strftime('%d/%m/%Y') if obj.data_encerramento else None,
                     'municipio': obj.municipio_encerramento_cod,
                     'uf': obj.uf_encerramento,
                     'protocolo': obj.protocolo_encerramento
                 }
        return None # Retorna None se não estiver encerrado