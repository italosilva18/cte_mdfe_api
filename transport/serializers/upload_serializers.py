# transport/serializers/upload_serializers.py

from rest_framework import serializers

# =============================================
# === Serializer para Formulário de Upload ===
# =============================================

class UploadXMLSerializer(serializers.Serializer):
    """
    Serializer usado pela UnifiedUploadViewSet (ação 'create') e
    para descrever os campos no formulário do Browsable API/Swagger.
    Valida a presença do arquivo principal e, opcionalmente, do de retorno.
    """
    arquivo_xml = serializers.FileField(
        required=True,
        allow_empty_file=False, # Não permitir arquivos vazios
        label="Arquivo XML Principal",
        help_text="Selecione o arquivo XML do CT-e, MDF-e ou Evento."
    )
    arquivo_xml_retorno = serializers.FileField(
        required=False, # Opcional
        allow_null=True,
        allow_empty_file=True, # Permite não enviar ou enviar vazio
        label="Arquivo XML de Retorno (Opcional)",
        help_text="Selecione o arquivo XML de retorno (usado para eventos)."
    )

    # Adicionar validações extras se necessário, por exemplo,
    # para verificar a extensão do arquivo ou o tipo MIME, embora
    # a validação principal do conteúdo ocorra na view.
    # def validate_arquivo_xml(self, value):
    #     if not value.name.lower().endswith('.xml'):
    #         raise serializers.ValidationError("O arquivo principal deve ser um .xml")
    #     # Adicionar validação de tamanho se desejado
    #     # if value.size > MAX_UPLOAD_SIZE:
    #     #     raise serializers.ValidationError(f"Arquivo muito grande ({value.size} bytes).")
    #     return value


class BatchUploadXMLSerializer(serializers.Serializer):
    """
    Serializer para a action 'batch_upload' da UnifiedUploadViewSet.
    Valida a presença de uma lista de arquivos XML.
    """
    arquivos_xml = serializers.ListField(
        child=serializers.FileField(allow_empty_file=False), # Cada arquivo não pode ser vazio
        required=True,
        min_length=1, # Pelo menos um arquivo deve ser enviado
        label="Arquivos XML",
        help_text="Selecione um ou mais arquivos XML para processamento em lote."
    )

    # Validação para garantir que todos os arquivos na lista são XML (opcional)
    # def validate_arquivos_xml(self, value_list):
    #     for arquivo in value_list:
    #         if not arquivo.name.lower().endswith('.xml'):
    #             raise serializers.ValidationError(f"Arquivo '{arquivo.name}' não é .xml.")
    #         # Validação de tamanho por arquivo, se necessário
    #     return value_list