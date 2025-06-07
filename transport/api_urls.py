# transport/api_urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers

# --- Documentação da API (drf-yasg) ---
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

# --- Views ---
from .views.auth_views import UserViewSet, CurrentUserAPIView
from .views.upload_views import UnifiedUploadViewSet
from .views.cte_views import CTeDocumentoViewSet
from .views.mdfe_views import MDFeDocumentoViewSet
from .views.vehicle_views import VeiculoViewSet, ManutencaoVeiculoViewSet, ManutencaoPainelViewSet
from .views.payment_views import FaixaKMViewSet, PagamentoAgregadoViewSet, PagamentoProprioViewSet
from .views.dashboard_views import (
    DashboardGeralAPIView, CtePainelAPIView, MdfePainelAPIView,
    FinanceiroPainelAPIView, FinanceiroMensalAPIView, FinanceiroDetalheAPIView,
    GeograficoPainelAPIView, AlertasPagamentoAPIView, AlertaSistemaViewSet
)
from .views.config_views import (
    ConfiguracaoEmpresaViewSet, ParametroSistemaViewSet,
    BackupAPIView, RelatorioAPIView
)

# --- Configuração Swagger (Schema View) ---
schema_view = get_schema_view(
   openapi.Info(
      title="API Sistema de Transporte",
      default_version='v1',
      description="Documentação da API para o sistema de gestão de CT-e e MDF-e",
      contact=openapi.Contact(email="seu_email_de_contato@exemplo.com"),
      license=openapi.License(name="MIT License"),
   ),
   public=True,
   permission_classes=(permissions.IsAuthenticated,),
)

# ------------------------------------------------------------------ #
# DRF routers
# ------------------------------------------------------------------ #
router = DefaultRouter()
# Registros do router
router.register(r"upload", UnifiedUploadViewSet, basename="unified-upload")
router.register(r"ctes", CTeDocumentoViewSet, basename="cte-documento")
router.register(r"mdfes", MDFeDocumentoViewSet, basename="mdfe-documento")
router.register(r"veiculos", VeiculoViewSet, basename="veiculo")
router.register(r"pagamentos/agregados", PagamentoAgregadoViewSet, basename="pagamento-agregado")
router.register(r"pagamentos/proprios", PagamentoProprioViewSet, basename="pagamento-proprio")
router.register(r"faixas-km", FaixaKMViewSet, basename="faixa-km")
router.register(r"manutencao/painel", ManutencaoPainelViewSet, basename="manutencao-painel")
router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="manutencao-veiculo")
router.register(r"usuarios", UserViewSet, basename="usuario")
router.register(r"configuracoes/empresa", ConfiguracaoEmpresaViewSet, basename="configuracao-empresa")
router.register(r"configuracoes/parametros", ParametroSistemaViewSet, basename="parametros-sistema")
router.register(r"backup", BackupAPIView, basename="backup")

# Rotas aninhadas para manutenções de veículos
veiculos_router = routers.NestedSimpleRouter(router, r"veiculos", lookup="veiculo")
veiculos_router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="veiculo-manutencao")

# ------------------------------------------------------------------ #
# URL patterns - APENAS APIs
# ------------------------------------------------------------------ #
urlpatterns = [
    # --- API Endpoints ---
    path("", include(router.urls)),  # Inclui as rotas do router principal
    path("", include(veiculos_router.urls)),  # Inclui as rotas aninhadas

    # Rota manual para a action batch_upload da UnifiedUploadViewSet
    path("upload/batch_upload/", UnifiedUploadViewSet.as_view({'post': 'batch_upload'}), name="upload-batch-action"),

    # APIViews avulsas (não gerenciadas pelo router)
    path("dashboard/", DashboardGeralAPIView.as_view(), name="dashboard-geral"),
    path("painel/cte/", CtePainelAPIView.as_view(), name="painel-cte"),
    path("painel/mdfe/", MdfePainelAPIView.as_view(), name="painel-mdfe"),
    path("painel/financeiro/", FinanceiroPainelAPIView.as_view(), name="painel-financeiro"),
    path("financeiro/mensal/", FinanceiroMensalAPIView.as_view(), name="financeiro-mensal"),
    path("financeiro/detalhe/", FinanceiroDetalheAPIView.as_view(), name="financeiro-detalhe"),
    path("painel/geografico/", GeograficoPainelAPIView.as_view(), name="painel-geografico"),
    path("alertas/pagamentos/", AlertasPagamentoAPIView.as_view(), name="alertas-pagamentos"),
    path(
        "alertas/sistema/",
        AlertaSistemaViewSet.as_view({"get": "list"}),
        name="alertas-sistema",
    ),
    path(
        "alertas/sistema/<int:pk>/",
        AlertaSistemaViewSet.as_view({"delete": "destroy"}),
        name="alertas-sistema-detalhe",
    ),
    path(
        "alertas/sistema/limpar_todos/",
        AlertaSistemaViewSet.as_view({"post": "limpar_todos"}),
        name="alertas-sistema-limpar-todos",
    ),

    # Endpoint de Relatórios (APIView)
    path("relatorios/", RelatorioAPIView.as_view(), name="relatorios"),

    # Endpoints específicos de actions dos ViewSets que não são padrão REST
    path("configuracoes/parametros/valores/", ParametroSistemaViewSet.as_view({'get': 'valores'}), name="parametros-valores"),
    path("configuracoes/parametros/atualizar-multiplos/", ParametroSistemaViewSet.as_view({'post': 'atualizar_multiplos'}), name="parametros-atualizar-multiplos"),

    # Dados do usuário autenticado (usado pelo JavaScript)
    path("users/me/", CurrentUserAPIView.as_view(), name="user_me"),

    # --- Documentação da API (Swagger/ReDoc) ---
    path('swagger<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]