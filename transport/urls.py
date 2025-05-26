# transport/urls.py
from django.urls import include, path
from django.views.generic import TemplateView
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.auth.decorators import login_required

from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers

# --- Documentação da API (drf-yasg) ---
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

# --- Views ---
# Importar Views dos novos arquivos/módulos
from .views.auth_views import UserViewSet, CurrentUserAPIView
from .views.upload_views import UnifiedUploadViewSet # Unica view de upload necessária aqui
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
      contact=openapi.Contact(email="seu_email_de_contato@exemplo.com"), # Atualize se necessário
      license=openapi.License(name="MIT License"), # Verifique sua licença
   ),
   public=True, # Mantenha False se a documentação não deve ser pública sem login
   permission_classes=(permissions.IsAuthenticated,), # Ajuste as permissões conforme necessário
)

# ------------------------------------------------------------------ #
# DRF routers
# ------------------------------------------------------------------ #
router = DefaultRouter()
# Registros do router
router.register(r"upload", UnifiedUploadViewSet, basename="unified-upload") # View de upload unificado (para /api/upload/)
router.register(r"ctes", CTeDocumentoViewSet, basename="cte-documento")
router.register(r"mdfes", MDFeDocumentoViewSet, basename="mdfe-documento")
router.register(r"veiculos", VeiculoViewSet, basename="veiculo")
router.register(r"pagamentos/agregados", PagamentoAgregadoViewSet, basename="pagamento-agregado")
router.register(r"pagamentos/proprios", PagamentoProprioViewSet, basename="pagamento-proprio")
router.register(r"faixas-km", FaixaKMViewSet, basename="faixa-km")
router.register(r"manutencao/painel", ManutencaoPainelViewSet, basename="manutencao-painel")
# Rota direta para manutenções (além da aninhada em /veiculos/)
router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="manutencao-veiculo")
router.register(r"usuarios", UserViewSet, basename="usuario")
router.register(r"configuracoes/empresa", ConfiguracaoEmpresaViewSet, basename="configuracao-empresa")
router.register(r"configuracoes/parametros", ParametroSistemaViewSet, basename="parametros-sistema")
router.register(r"backup", BackupAPIView, basename="backup")

# Rotas aninhadas para manutenções de veículos
veiculos_router = routers.NestedSimpleRouter(router, r"veiculos", lookup="veiculo")
veiculos_router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="veiculo-manutencao")

# ------------------------------------------------------------------ #
# URL patterns
# ------------------------------------------------------------------ #
urlpatterns = [
    # --- API Endpoints ---
    path("api/", include(router.urls)), # Inclui as rotas do router principal (ex: /api/upload/)
    path("api/", include(veiculos_router.urls)), # Inclui as rotas aninhadas

    # CORREÇÃO: Rota manual para a action batch_upload da UnifiedUploadViewSet
    # A URL agora é /api/upload/batch_upload/ para corresponder ao JavaScript
    path("api/upload/batch_upload/", UnifiedUploadViewSet.as_view({'post': 'batch_upload'}), name="upload-batch-action"),

    # APIViews avulsas (não gerenciadas pelo router)
    path("api/dashboard/", DashboardGeralAPIView.as_view(), name="dashboard-geral"),
    path("api/painel/cte/", CtePainelAPIView.as_view(), name="painel-cte"),
    path("api/painel/mdfe/", MdfePainelAPIView.as_view(), name="painel-mdfe"),
    path("api/painel/financeiro/", FinanceiroPainelAPIView.as_view(), name="painel-financeiro"),
    path("api/financeiro/mensal/", FinanceiroMensalAPIView.as_view(), name="financeiro-mensal"),
    path("api/financeiro/detalhe/", FinanceiroDetalheAPIView.as_view(), name="financeiro-detalhe"),
    path("api/painel/geografico/", GeograficoPainelAPIView.as_view(), name="painel-geografico"),
    path("api/alertas/pagamentos/", AlertasPagamentoAPIView.as_view(), name="alertas-pagamentos"),
    path(
        "api/alertas/sistema/",
        AlertaSistemaViewSet.as_view({"get": "list"}),
        name="alertas-sistema",
    ),
    path(
        "api/alertas/sistema/<int:pk>/",
        AlertaSistemaViewSet.as_view({"delete": "destroy"}),
        name="alertas-sistema-detalhe",
    ),
    path(
        "api/alertas/sistema/limpar_todos/",
        AlertaSistemaViewSet.as_view({"post": "limpar_todos"}),
        name="alertas-sistema-limpar-todos",
    ),

    # Endpoint de Relatórios (APIView)
    path("api/relatorios/", RelatorioAPIView.as_view(), name="relatorios"),

    # Endpoints específicos de actions dos ViewSets que não são padrão REST
    path("api/configuracoes/parametros/valores/", ParametroSistemaViewSet.as_view({'get': 'valores'}), name="parametros-valores"),
    path("api/configuracoes/parametros/atualizar-multiplos/", ParametroSistemaViewSet.as_view({'post': 'atualizar_multiplos'}), name="parametros-atualizar-multiplos"),

    # Dados do usuário autenticado (usado pelo auth.js)
    path("api/users/me/", CurrentUserAPIView.as_view(), name="user_me"),

    # --- Documentação da API (Swagger/ReDoc) ---
    path('api/swagger<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('api/swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('api/redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),

    # --- Autenticação e Páginas HTML ---
    path("login/", LoginView.as_view(template_name="login.html"), name="login"),
    path("logout/", LogoutView.as_view(next_page="/login/"), name="logout"), # Ajustado para redirecionar para a tela de login da app

    # Páginas HTML (requerem login via @login_required)
    path("dashboard/", login_required(TemplateView.as_view(template_name="dashboard.html")), name="dashboard"),
    path("cte/", login_required(TemplateView.as_view(template_name="cte_panel.html")), name="cte_panel"),
    path("mdfe/", login_required(TemplateView.as_view(template_name="mdfe_panel.html")), name="mdfe_panel"),
    path("upload/", login_required(TemplateView.as_view(template_name="upload.html")), name="upload"),
    path("financeiro/", login_required(TemplateView.as_view(template_name="financeiro.html")), name="financeiro"),
    path("geografico/", login_required(TemplateView.as_view(template_name="geografico.html")), name="geografico"),
    path("manutencao/", login_required(TemplateView.as_view(template_name="manutencao.html")), name="manutencao"),
    path("configuracoes/", login_required(TemplateView.as_view(template_name="configuracoes.html")), name="configuracoes"),
    path("backup/", login_required(TemplateView.as_view(template_name="backup.html")), name="backup_page"),
    path("relatorios/", login_required(TemplateView.as_view(template_name="relatorios.html")), name="relatorios_page"),
    path("alertas/", login_required(TemplateView.as_view(template_name="alertas.html")), name="alertas_page"), # Adicionada rota para alertas.html
    path("pagamentos/", login_required(TemplateView.as_view(template_name="pagamentos.html")), name="pagamentos_page"),

    # Rota raiz redireciona para o dashboard se logado
    path('', login_required(TemplateView.as_view(template_name="dashboard.html")), name="home"),
]