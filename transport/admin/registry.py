from .common import *

# === Registro de Outros Modelos Relacionados ===
# ==========================================================

# Registra modelos relacionados adicionais que não precisam de customização completa
admin.site.register(CTeEmitente)
admin.site.register(CTeRemetente)
admin.site.register(CTeExpedidor)
admin.site.register(CTeRecebedor)
admin.site.register(CTeVeiculoRodoviario)
admin.site.register(CTeMotorista)
admin.site.register(CTeSeguro)
admin.site.register(CTeProtocoloAutorizacao)
admin.site.register(CTeSuplementar)
admin.site.register(MDFeEmitente)
admin.site.register(MDFeVeiculoTracao)
admin.site.register(MDFeVeiculoReboque)
admin.site.register(MDFeProdutoPerigoso)
admin.site.register(MDFeSeguroCarga)
admin.site.register(MDFeProdutoPredominante)
admin.site.register(MDFeInformacoesAdicionais)
admin.site.register(MDFeProtocoloAutorizacao)
admin.site.register(MDFeSuplementar)

# Opcional: Criar e registrar o Admin site personalizado
# transport_admin = TransporteDashboardAdmin(name='transport_admin')
# transport_admin.register(CTeDocumento, CTeDocumentoAdmin)
# transport_admin.register(MDFeDocumento, MDFeDocumentoAdmin)
# transport_admin.register(Veiculo, VeiculoAdmin)
# ...E assim por diante
