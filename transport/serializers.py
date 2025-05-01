# transport/serializers.py

from rest_framework import serializers
# ---> ADICIONAR ESTA IMPORTAÇÃO <---
from django.contrib.auth.models import User # Importar modelo User
# ---> FIM DA IMPORTAÇÃO <---
from .models import (
    # Base
    Endereco,

    # CT-e Models
    CTeDocumento, CTeIdentificacao, CTeComplemento, CTeObservacaoContribuinte,
    CTeObservacaoFisco, CTeEmitente, CTeRemetente, CTeExpedidor, CTeRecebedor,
    CTEDestinatario, CTePrestacaoServico, CTeComponenteValor, CTeTributos,
    CTeCarga, CTeQuantidadeCarga, CTeDocumentoTransportado, CTeSeguro,
    CTeModalRodoviario, CTeVeiculoRodoviario, CTeMotorista, CTeAutXML,
    CTeResponsavelTecnico, CTeProtocoloAutorizacao, CTeSuplementar,
    CTeCancelamento,

    # MDF-e Models
    MDFeDocumento, MDFeIdentificacao, MDFeMunicipioCarregamento, MDFePercurso,
    MDFeEmitente, MDFeModalRodoviario, MDFeVeiculoTracao, MDFeVeiculoReboque,
    MDFeCondutor, MDFeCIOT, MDFeValePedagio, MDFeContratante,
    MDFeMunicipioDescarga, MDFeDocumentosVinculados, MDFeProdutoPerigoso,
    MDFeSeguroCarga, MDFeAverbacaoSeguro, MDFeProdutoPredominante, MDFeTotais,
    MDFeLacreRodoviario, MDFeAutXML, MDFeInformacoesAdicionais,
    MDFeResponsavelTecnico, MDFeProtocoloAutorizacao, MDFeSuplementar,
    MDFeCancelamento,

    # Veículos e Manutenção
    Veiculo, ManutencaoVeiculo,

    # Pagamentos e Parametrização
    FaixaKM, PagamentoAgregado, PagamentoProprio
)

# =============================================
# === Serializer para Formulário de Upload ===
# =============================================

class UploadXMLSerializer(serializers.Serializer):
    """Serializer usado apenas para descrever os campos no formulário do Browsable API."""
    arquivo_xml = serializers.FileField(
        required=True,
        label="Arquivo XML Principal",
        help_text="Selecione o arquivo XML do CT-e, MDF-e ou Evento."
    )
    arquivo_xml_retorno = serializers.FileField(
        required=False,
        allow_null=True,
        label="Arquivo XML de Retorno (Opcional)",
        help_text="Selecione o arquivo XML de retorno (usado para eventos)."
    )

# ========================
# === Serializers Base ===
# ========================

class EnderecoSerializer(serializers.ModelSerializer):
    """ Serializer base para o modelo Endereco (usado por herança). """
    class Meta:
        model = Endereco
        exclude = ['id'] # Exclui o ID base do Endereco


# =======================================
# === Serializers para Usuários (User) === # <-- ADICIONADOS
# =======================================

class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer para atualizar o perfil do usuário logado (PATCH)."""
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'}, help_text="Opcional. Defina para alterar a senha.")
    password_confirm = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'}, help_text="Confirmação da nova senha.")

    class Meta:
        model = User
        # Campos permitidos para atualização pelo próprio usuário
        fields = ['first_name', 'last_name', 'email', 'password', 'password_confirm']
        extra_kwargs = {
            # Nenhum campo é estritamente obrigatório no PATCH
            'email': {'required': False},
            'first_name': {'required': False},
            'last_name': {'required': False},
        }

    def validate(self, data):
        # Validação de confirmação de senha (só se password for enviado)
        password = data.get('password')
        password_confirm = data.pop('password_confirm', None) # Remove confirmação dos dados a salvar

        if password: # Se uma nova senha foi fornecida
             if not password_confirm:
                 raise serializers.ValidationError({"password_confirm": "Confirmação de senha é obrigatória ao definir uma nova senha."})
             if password != password_confirm:
                 raise serializers.ValidationError({"password_confirm": "As senhas não coincidem."})
        elif password_confirm:
            # Se a confirmação foi enviada mas a senha não, é um erro
            raise serializers.ValidationError({"password": "Senha é obrigatória se a confirmação for fornecida."})

        return data

    def update(self, instance, validated_data):
        # Trata a senha separadamente usando set_password para hashing
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)

        # Atualiza os outros campos
        # Chama o update padrão do ModelSerializer para os campos restantes
        instance = super().update(instance, validated_data)
        instance.save()
        return instance


class UserSerializer(serializers.ModelSerializer):
    """Serializer para CRUD completo de Usuários (usado pelo UserViewSet - Admin)."""
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'}, help_text="Obrigatório na criação. Opcional na atualização.")

    class Meta:
        model = User
        # Define os campos a serem expostos/editados pela API de admin
        fields = ['id', 'username', 'password', 'first_name', 'last_name', 'email', 'is_staff', 'is_active', 'is_superuser', 'date_joined', 'last_login']
        read_only_fields = ['id', 'date_joined', 'last_login']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False}, # Não obrigatório em GET/PATCH
            'username': {'required': True}, # Username sempre obrigatório
            'email': {'required': False},
        }

    def create(self, validated_data):
        # Garante que a senha seja obrigatória na criação
        if 'password' not in validated_data:
             raise serializers.ValidationError({'password': 'Este campo é obrigatório na criação.'})

        # Usa create_user para garantir o hash correto da senha
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            email=validated_data.get('email', ''),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            is_staff=validated_data.get('is_staff', False),
            is_active=validated_data.get('is_active', True),
            is_superuser=validated_data.get('is_superuser', False) # Cuidado ao expor/permitir isso
        )
        return user

    def update(self, instance, validated_data):
        # Atualiza a senha SE ela for fornecida
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)

        # Atualiza outros campos (chama o método padrão para o resto)
        instance = super().update(instance, validated_data)
        instance.save()
        return instance


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
    tomador_endereco = EnderecoSerializer(read_only=True, allow_null=True)
    data_emissao_formatada = serializers.DateTimeField(source='data_emissao', format='%d/%m/%Y %H:%M', read_only=True, allow_null=True)

    class Meta:
        model = CTeIdentificacao
        exclude = ['id', 'cte']

class CTeComplementoSerializer(serializers.ModelSerializer):
    observacoes_contribuinte = CTeObservacaoContribuinteSerializer(many=True, read_only=True)
    observacoes_fisco = CTeObservacaoFiscoSerializer(many=True, read_only=True)

    class Meta:
        model = CTeComplemento
        exclude = ['id', 'cte']

class CTeEmitenteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CTeEmitente
        fields = [f.name for f in Endereco._meta.get_fields() if f.name != 'id'] + \
                 ['cnpj', 'cpf', 'ie', 'razao_social', 'nome_fantasia', 'telefone', 'email', 'crt']
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
        exclude = ['id', 'cte', 'arquivo_xml_evento'] # Campo de arquivo não serializado

# --- Serializers Principais para CT-e ---

class CTeDocumentoListSerializer(serializers.ModelSerializer):
    """ Serializer otimizado para listagem de CT-es. """
    numero_cte = serializers.IntegerField(source='identificacao.numero', read_only=True, allow_null=True)
    serie_cte = serializers.IntegerField(source='identificacao.serie', read_only=True, allow_null=True)
    data_emissao = serializers.DateTimeField(source='identificacao.data_emissao', read_only=True, allow_null=True, format='%d/%m/%Y %H:%M')
    remetente_nome = serializers.CharField(source='remetente.razao_social', read_only=True, allow_null=True)
    destinatario_nome = serializers.CharField(source='destinatario.razao_social', read_only=True, allow_null=True)
    valor_total = serializers.DecimalField(source='prestacao.valor_total_prestado', max_digits=15, decimal_places=2, read_only=True, allow_null=True)
    uf_inicio = serializers.CharField(source='identificacao.uf_ini', read_only=True, allow_null=True)
    uf_fim = serializers.CharField(source='identificacao.uf_fim', read_only=True, allow_null=True)
    placa_principal = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = CTeDocumento
        fields = [
            'id', 'chave', 'numero_cte', 'serie_cte', 'modalidade', 'data_emissao', 'remetente_nome',
            'destinatario_nome', 'uf_inicio', 'uf_fim', 'valor_total',
            'placa_principal', 'status', 'processado', 'data_upload'
        ]
        read_only_fields = fields

    def get_placa_principal(self, obj):
        try: return obj.modal_rodoviario.veiculos.first().placa
        except: return None

    def get_status(self, obj):
        if hasattr(obj, 'cancelamento') and obj.cancelamento and obj.cancelamento.c_stat == 135: return "Cancelado"
        if hasattr(obj, 'protocolo') and obj.protocolo: return "Autorizado" if obj.protocolo.codigo_status == 100 else f"Rejeitado ({obj.protocolo.codigo_status})"
        if obj.processado: return "Processado (s/ Prot.)"
        return "Pendente"

class CTeDocumentoDetailSerializer(serializers.ModelSerializer):
    """ Serializer para a visualização detalhada de um CT-e processado. """
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
    documentos_transportados = CTeDocumentoTransportadoSerializer(many=True, read_only=True)
    seguros = CTeSeguroSerializer(many=True, read_only=True)
    autorizados_xml = CTeAutXMLSerializer(many=True, read_only=True)
    status_geral = serializers.SerializerMethodField()

    class Meta:
        model = CTeDocumento
        fields = [
            'id', 'chave', 'versao', 'modalidade', 'data_upload', 'processado', 'status_geral',
            'identificacao', 'complemento', 'emitente', 'remetente', 'expedidor',
            'recebedor', 'destinatario', 'prestacao', 'tributos', 'carga',
            'modal_rodoviario', 'resp_tecnico', 'protocolo', 'suplementar', 'cancelamento',
            'documentos_transportados', 'seguros', 'autorizados_xml',
        ]
        read_only_fields = fields

    def get_status_geral(self, obj):
        return CTeDocumentoListSerializer().get_status(obj)


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
        fields = ['nome', 'cpf']

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
    cte_info = CTeDocumentoListSerializer(source='cte_relacionado', read_only=True, allow_null=True)
    produtos_perigosos = MDFeProdutoPerigosoSerializer(many=True, read_only=True)
    tipo_doc = serializers.SerializerMethodField()

    class Meta:
        model = MDFeDocumentosVinculados
        fields = ['chave_documento', 'tipo_doc', 'seg_cod_barras', 'ind_reentrega', 'cte_info', 'produtos_perigosos']

    def get_tipo_doc(self, obj):
        try:
            modelo = obj.chave_documento[20:22]
            return {'57': 'CT-e', '55': 'NF-e', '67': 'CT-e OS'}.get(modelo, 'Outro')
        except:
            return 'Desconhecido'

class MDFeMunicipioDescargaSerializer(serializers.ModelSerializer):
    docs_vinculados = MDFeDocumentosVinculadosSerializer(source='docs_vinculados_municipio', many=True, read_only=True)
    class Meta:
        model = MDFeMunicipioDescarga
        fields = ['c_mun_descarga', 'x_mun_descarga', 'docs_vinculados']

class MDFeAverbacaoSeguroSerializer(serializers.ModelSerializer):
    class Meta:
        model = MDFeAverbacaoSeguro
        fields = ['numero']

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
        fields = ['numero']

class MDFeAutXMLSerializer(serializers.ModelSerializer):
     class Meta:
        model = MDFeAutXML
        fields = ['cnpj', 'cpf']

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
        exclude = ['id', 'mdfe', 'arquivo_xml_evento']

# --- Serializers Principais para MDF-e ---

class MDFeDocumentoListSerializer(serializers.ModelSerializer):
    """ Serializer otimizado para listagem de MDF-es. """
    numero_mdfe = serializers.IntegerField(source='identificacao.n_mdf', read_only=True, allow_null=True)
    data_emissao = serializers.DateTimeField(source='identificacao.dh_emi', read_only=True, allow_null=True, format='%d/%m/%Y %H:%M')
    uf_inicio = serializers.CharField(source='identificacao.uf_ini', read_only=True, allow_null=True)
    uf_fim = serializers.CharField(source='identificacao.uf_fim', read_only=True, allow_null=True)
    placa_tracao = serializers.CharField(source='modal_rodoviario.veiculo_tracao.placa', read_only=True, allow_null=True)
    status_code_protocolo = serializers.IntegerField(source='protocolo.codigo_status', read_only=True, allow_null=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = MDFeDocumento
        fields = [ 'id', 'chave', 'numero_mdfe', 'data_emissao', 'uf_inicio', 'uf_fim',
                   'placa_tracao', 'status_code_protocolo', 'status', 'processado', 'data_upload' ]
        read_only_fields = fields

    def get_status(self, obj):
        if hasattr(obj, 'cancelamento') and obj.cancelamento and obj.cancelamento.c_stat == 135: return "Cancelado"
        # if getattr(obj, 'encerrado', False): return "Encerrado" # Descomente se adicionar campo encerrado
        if hasattr(obj, 'protocolo') and obj.protocolo: return "Autorizado" if obj.protocolo.codigo_status == 100 else f"Rejeitado ({obj.protocolo.codigo_status})"
        if obj.processado: return "Processado (s/ Prot.)"
        return "Pendente"

class MDFeDocumentoDetailSerializer(serializers.ModelSerializer):
    """ Serializer para a visualização detalhada de um MDF-e processado. """
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
    municipios_descarga = MDFeMunicipioDescargaSerializer(many=True, read_only=True)
    condutores = MDFeCondutorSerializer(many=True, read_only=True)
    seguros_carga = MDFeSeguroCargaSerializer(many=True, read_only=True)
    lacres_rodoviarios = MDFeLacreRodoviarioSerializer(many=True, read_only=True)
    autorizados_xml = MDFeAutXMLSerializer(many=True, read_only=True)
    status_geral = serializers.SerializerMethodField()

    class Meta:
        model = MDFeDocumento
        fields = [
            'id', 'chave', 'versao', 'data_upload', 'processado', 'status_geral',
            # Adicionar status de encerramento
            # 'encerrado', 'data_encerramento', 'protocolo_encerramento',
            'identificacao', 'emitente', 'modal_rodoviario', 'prod_pred', 'totais',
            'adicional', 'resp_tecnico', 'protocolo', 'suplementar', 'cancelamento',
            'municipios_descarga', 'condutores', 'seguros_carga', 'lacres_rodoviarios', 'autorizados_xml',
        ]
        read_only_fields = fields

    def get_status_geral(self, obj):
        return MDFeDocumentoListSerializer().get_status(obj)


# ==============================================
# === Serializers Veículos e Manutenções ===
# ==============================================

class ManutencaoVeiculoSerializer(serializers.ModelSerializer):
    valor_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    veiculo_placa = serializers.CharField(source='veiculo.placa', read_only=True)

    class Meta:
        model = ManutencaoVeiculo
        fields = [ 'id', 'veiculo', 'veiculo_placa', 'data_servico', 'servico_realizado', 'oficina',
                   'quilometragem', 'peca_utilizada', 'valor_peca', 'valor_mao_obra', 'valor_total',
                   'status', 'observacoes', 'nota_fiscal', 'criado_em', 'atualizado_em' ]
        read_only_fields = ('valor_total', 'criado_em', 'atualizado_em', 'veiculo_placa')
        extra_kwargs = {'veiculo': {'write_only': True, 'required': False}}


class VeiculoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Veiculo
        fields = [ 'id', 'placa', 'renavam', 'tara', 'capacidade_kg', 'capacidade_m3',
                   'tipo_proprietario', 'proprietario_cnpj', 'proprietario_cpf',
                   'proprietario_nome', 'rntrc_proprietario', 'uf_proprietario',
                   'ativo', 'criado_em', 'atualizado_em' ]
        read_only_fields = ('criado_em', 'atualizado_em')


# ===================================================
# === Serializers Pagamentos e Parametrização ===
# ===================================================

class FaixaKMSerializer(serializers.ModelSerializer):
    class Meta:
        model = FaixaKM
        fields = '__all__'

class PagamentoAgregadoSerializer(serializers.ModelSerializer):
    cte_chave = serializers.CharField(source='cte.chave', read_only=True)
    cte_numero = serializers.IntegerField(source='cte.identificacao.numero', read_only=True, allow_null=True)
    cte_data_emissao = serializers.DateTimeField(source='cte.identificacao.data_emissao', read_only=True, allow_null=True, format='%d/%m/%Y')

    class Meta:
        model = PagamentoAgregado
        fields = [ 'id', 'cte', 'cte_chave', 'cte_numero', 'cte_data_emissao', 'placa', 'condutor_cpf', 'condutor_nome',
                   'valor_frete_total', 'percentual_repasse', 'valor_repassado', 'obs', 'status', 'data_prevista', 'data_pagamento',
                   'criado_em', 'atualizado_em' ]
        read_only_fields = ('valor_repassado', 'criado_em', 'atualizado_em', 'cte_chave', 'cte_numero', 'cte_data_emissao')
        extra_kwargs = {'cte': {'write_only': True, 'required': False}}

class PagamentoProprioSerializer(serializers.ModelSerializer):
    veiculo_placa = serializers.CharField(source='veiculo.placa', read_only=True)
    valor_total_pagar = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PagamentoProprio
        fields = [ 'id', 'veiculo', 'veiculo_placa', 'periodo', 'km_total_periodo', 'valor_base_faixa', 'ajustes',
                   'valor_total_pagar', 'status', 'data_pagamento', 'obs', 'criado_em', 'atualizado_em' ]
        read_only_fields = ('valor_total_pagar', 'criado_em', 'atualizado_em', 'veiculo_placa',
                            'km_total_periodo', 'valor_base_faixa') # Calculados pela action
        extra_kwargs = { 'veiculo': {'write_only': True, 'required': False},
                         'periodo': {'required': False} }

# =====================================================
# === Serializadores para Dashboards/Painéis ===
# =====================================================

class DashboardGeralDataSerializer(serializers.Serializer):
    """
    Serializer para dados do dashboard geral.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cif_fob = serializers.ListField(required=False)
    grafico_metas = serializers.ListField(required=False)
    ultimos_lancamentos = serializers.DictField(required=False)

class FinanceiroPainelSerializer(serializers.Serializer):
    """
    Serializer para dados do painel financeiro.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cif_fob = serializers.ListField(required=False)

class FinanceiroMensalSerializer(serializers.Serializer):
    """
    Serializer para dados do painel financeiro mensal.
    """
    mes = serializers.CharField(required=True)
    faturamento = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    cif = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    fob = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    entregas = serializers.IntegerField(required=False)

class FinanceiroDetalheSerializer(serializers.Serializer):
    """
    Serializer para dados do painel financeiro detalhado.
    """
    label = serializers.CharField(required=True)
    id = serializers.CharField(required=False)
    faturamento_total = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    qtd_ctes = serializers.IntegerField(required=False)
    valor_medio = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)

class CtePainelSerializer(serializers.Serializer):
    """
    Serializer para dados do painel de CT-e.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cliente = serializers.ListField(required=False)
    grafico_distribuidor = serializers.ListField(required=False)
    tabela_cliente = serializers.ListField(required=False)

class MdfePainelSerializer(serializers.Serializer):
    """
    Serializer para dados do painel de MDF-e.
    """
    filtros = serializers.DictField(required=False)
    cards = serializers.DictField(required=False)
    grafico_cte_mdfe = serializers.ListField(required=False)
    top_veiculos = serializers.ListField(required=False)
    tabela_mdfe_veiculo = serializers.ListField(required=False)
    eficiencia = serializers.FloatField(required=False)

class GeograficoPainelSerializer(serializers.Serializer):
    """
    Serializer para dados do painel geográfico.
    """
    filtros = serializers.DictField(required=False)
    rotas = serializers.ListField(required=False)
    top_origens = serializers.ListField(required=False)
    top_destinos = serializers.ListField(required=False)
    rotas_frequentes = serializers.ListField(required=False)

class ManutencaoIndicadoresSerializer(serializers.Serializer):
    """
    Serializer para indicadores de manutenção.
    """
    total_manutencoes = serializers.IntegerField(required=False)
    total_pecas = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    total_mao_obra = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    valor_total = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)

class ManutencaoGraficosSerializer(serializers.Serializer):
    """
    Serializer para gráficos de manutenção.
    """
    por_status = serializers.ListField(required=False)
    por_veiculo = serializers.ListField(required=False)
    por_periodo = serializers.ListField(required=False)

# =====================================================
# === Serializadores para Alertas ===
# =====================================================

class AlertaPagamentoSerializer(serializers.Serializer):
    """
    Serializer para retornar alertas de pagamentos pendentes ou próximos do vencimento.
    Usado pela AlertasPagamentoAPIView.
    """
    agregados_pendentes = PagamentoAgregadoSerializer(many=True, required=False)
    proprios_pendentes = PagamentoProprioSerializer(many=True, required=False)
    dias_alerta = serializers.IntegerField(required=False)