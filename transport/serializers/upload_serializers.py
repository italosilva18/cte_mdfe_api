# transport/serializers/upload_serializers.py

from rest_framework import serializers

class UploadXMLSerializer(serializers.Serializer):
    # ... (mantido como antes)
    arquivo_xml = serializers.FileField(
        required=True,
        allow_empty_file=False,
        label="Arquivo XML Principal",
        help_text="Selecione o arquivo XML do CT-e, MDF-e ou Evento."
    )
    arquivo_xml_retorno = serializers.FileField(
        required=False,
        allow_null=True,
        allow_empty_file=True,
        label="Arquivo XML de Retorno (Opcional)",
        help_text="Selecione o arquivo XML de retorno (usado para eventos)."
    )

class BatchUploadXMLSerializer(serializers.Serializer): # CONTINUAÇÃO
    """
    Serializer para a action 'batch_upload' da UnifiedUploadViewSet.
    Valida a presença de uma lista de arquivos XML.
    """
    # AGORA APENAS UM CAMPO PARA TODOS OS ARQUIVOS DO LOTE
    arquivos_xml = serializers.ListField(
        child=serializers.FileField(allow_empty_file=False),
        required=True,
        min_length=1,
        label="Arquivos XML (CT-e, MDF-e, Eventos, Retornos)",
        help_text="Selecione todos os arquivos XML para processamento em lote."
    )
    # O campo arquivos_xml_retorno foi removido daqui.
    # A lógica de emparelhamento será feita no backend.