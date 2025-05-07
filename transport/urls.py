# transport/urls.py
from django.urls import include, path
from django.views.generic import TemplateView
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.auth.decorators import login_required

from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers

# --- ViewSets / APIViews ---
from .views import (
    # Upload
    UnifiedUploadViewSet,

    # CRUD / consultas
    CTeDocumentoViewSet, MDFeDocumentoViewSet,
    VeiculoViewSet, ManutencaoVeiculoViewSet,
    ManutencaoPainelViewSet, FaixaKMViewSet,
    PagamentoAgregadoViewSet, PagamentoProprioViewSet,
    UserViewSet, ConfiguracaoEmpresaViewSet, ParametroSistemaViewSet,
    BackupAPIView,

    # Painéis
    DashboardGeralAPIView, CtePainelAPIView, MdfePainelAPIView,
    FinanceiroPainelAPIView, FinanceiroMensalAPIView, FinanceiroDetalheAPIView,
    GeograficoPainelAPIView, AlertasPagamentoAPIView, RelatorioAPIView,

    # Usuário autenticado
    CurrentUserAPIView,
)

# --- Documentação drf-yasg ---
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

schema_view = get_schema_view(
    openapi.Info(
        title="API Sistema de Transporte",
        default_version="v1",
        description="Documentação da API para o sistema de gestão de CT-e e MDF-e",
        contact=openapi.Contact(email="contato@exemplo.com"),
        license=openapi.License(name="MIT"),
    ),
    public=True,
    permission_classes=(permissions.IsAuthenticated,),
)

# ------------------------------------------------------------------ #
# DRF routers
# ------------------------------------------------------------------ #
router = DefaultRouter()
# (mantém todos os outros ViewSets)
router.register(r"ctes", CTeDocumentoViewSet, basename="cte-documento")
router.register(r"mdfes", MDFeDocumentoViewSet, basename="mdfe-documento")
router.register(r"veiculos", VeiculoViewSet, basename="veiculo")
router.register(r"pagamentos/agregados", PagamentoAgregadoViewSet, basename="pagamento-agregado")
router.register(r"pagamentos/proprios", PagamentoProprioViewSet, basename="pagamento-proprio")
router.register(r"faixas-km", FaixaKMViewSet, basename="faixa-km")
router.register(r"manutencao", ManutencaoPainelViewSet, basename="manutencao-painel")
router.register(r"usuarios", UserViewSet, basename="usuario")
router.register(r"configuracoes/empresa", ConfiguracaoEmpresaViewSet, basename="configuracao-empresa")
router.register(r"configuracoes/parametros", ParametroSistemaViewSet, basename="parametros-sistema")
router.register(r"backup", BackupAPIView, basename="backup")

# rotas aninhadas: /veiculos/{veiculo_pk}/manutencoes/
veiculos_router = routers.NestedSimpleRouter(router, r"veiculos", lookup="veiculo")
veiculos_router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="veiculo-manutencao")

# ------------------------------------------------------------------ #
# URL patterns
# ------------------------------------------------------------------ #
urlpatterns = [
    # ---- API ----
    path("api/", include(router.urls)),
    path("api/", include(veiculos_router.urls)),

    # Upload (POST apenas)
    path(
        "api/upload/",
        UnifiedUploadViewSet.as_view({"post": "create"}),
        name="unified-upload",
    ),

    # APIViews avulsas
    path("api/dashboard/",       DashboardGeralAPIView.as_view(),  name="dashboard-geral"),
    path("api/cte/",             CtePainelAPIView.as_view(),       name="painel-cte"),
    path("api/mdfe/",            MdfePainelAPIView.as_view(),      name="painel-mdfe"),
    path("api/financeiro/",      FinanceiroPainelAPIView.as_view(), name="painel-financeiro"),
    path("api/financeiro/mensal/", FinanceiroMensalAPIView.as_view(), name="financeiro-mensal"),
    path("api/financeiro/detalhe/", FinanceiroDetalheAPIView.as_view(), name="financeiro-detalhe"),
    path("api/geografico/",      GeograficoPainelAPIView.as_view(), name="painel-geografico"),
    path("api/alertas/pagamentos/", AlertasPagamentoAPIView.as_view(), name="alertas-pagamentos"),
    path("api/relatorios/",      RelatorioAPIView.as_view(),       name="relatorios"),

    # Configurações extras
    path(
        "api/configuracoes/parametros/valores/",
        ParametroSistemaViewSet.as_view({"get": "valores"}),
        name="parametros-valores",
    ),
    path(
        "api/configuracoes/parametros/atualizar-multiplos/",
        ParametroSistemaViewSet.as_view({"post": "atualizar_multiplos"}),
        name="parametros-atualizar-multiplos",
    ),

    # Dados do usuário autenticado
    path("api/users/me/", CurrentUserAPIView.as_view(), name="user_me"),

    # ---- Documentação Swagger/ReDoc ----
    path("api/swagger<format>/", schema_view.without_ui(cache_timeout=0), name="schema-json"),
    path("api/swagger/",         schema_view.with_ui("swagger", cache_timeout=0), name="schema-swagger-ui"),
    path("api/redoc/",           schema_view.with_ui("redoc",   cache_timeout=0), name="schema-redoc"),

    # ---- Autenticação / páginas HTML ----
    path("login/",  LoginView.as_view(template_name="login.html"),  name="login"),
    path("logout/", LogoutView.as_view(next_page="/login/"),         name="logout"),

    # Páginas protegidas
    path("dashboard/",  login_required(TemplateView.as_view(template_name="dashboard.html")), name="dashboard"),
    path("cte/",        login_required(TemplateView.as_view(template_name="cte_panel.html")),  name="cte_panel"),
    path("mdfe/",       login_required(TemplateView.as_view(template_name="mdfe_panel.html")), name="mdfe_panel"),
    path("upload/",     login_required(TemplateView.as_view(template_name="upload.html")),     name="upload"),
    path("financeiro/", login_required(TemplateView.as_view(template_name="financeiro.html")), name="financeiro"),
    path("geografico/", login_required(TemplateView.as_view(template_name="geografico.html")), name="geografico"),
    path("manutencao/", login_required(TemplateView.as_view(template_name="manutencao.html")), name="manutencao"),
    path("configuracoes/", login_required(TemplateView.as_view(template_name="configuracoes.html")), name="configuracoes"),
    path("backup/",     login_required(TemplateView.as_view(template_name="backup.html")),     name="backup_page"),
    path("relatorios/", login_required(TemplateView.as_view(template_name="relatorios.html")), name="relatorios_page"),

    # Home
    path("", login_required(TemplateView.as_view(template_name="dashboard.html")), name="home"),
]
