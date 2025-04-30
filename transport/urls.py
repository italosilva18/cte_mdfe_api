# transport/urls.py
from django.urls import include, path
from django.views.generic import TemplateView
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.auth.decorators import login_required

from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers

from .views import (
    # ViewSets (CRUD / consultas)
    CTeDocumentoViewSet, MDFeDocumentoViewSet,
    VeiculoViewSet, ManutencaoVeiculoViewSet,
    UnifiedUploadViewSet, ManutencaoPainelViewSet,
    FaixaKMViewSet, PagamentoAgregadoViewSet, PagamentoProprioViewSet,

    # APIViews (painéis / extras)
    DashboardGeralAPIView, CtePainelAPIView, MdfePainelAPIView,
    FinanceiroPainelAPIView, FinanceiroMensalAPIView, FinanceiroDetalheAPIView,
    GeograficoPainelAPIView, AlertasPagamentoAPIView,

    # Dados do usuário autenticado
    CurrentUserAPIView,
)

# ------------------------------------------------------------------ #
# DRF routers
# ------------------------------------------------------------------ #
router = DefaultRouter()
router.register(r"upload",               UnifiedUploadViewSet, basename="unified-upload")
router.register(r"ctes",                 CTeDocumentoViewSet,  basename="cte-documento")
router.register(r"mdfes",                MDFeDocumentoViewSet, basename="mdfe-documento")
router.register(r"veiculos",             VeiculoViewSet,       basename="veiculo")
router.register(r"pagamentos/agregados", PagamentoAgregadoViewSet, basename="pagamento-agregado")
router.register(r"pagamentos/proprios",  PagamentoProprioViewSet,  basename="pagamento-proprio")
router.register(r"faixas-km",            FaixaKMViewSet,       basename="faixa-km")
router.register(r"manutencao",           ManutencaoPainelViewSet, basename="manutencao-painel")

# rotas aninhadas: /veiculos/{veiculo_pk}/manutencoes/
veiculos_router = routers.NestedSimpleRouter(router, r"veiculos", lookup="veiculo")
veiculos_router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="veiculo-manutencao")

# ------------------------------------------------------------------ #
# URL patterns
# ------------------------------------------------------------------ #
urlpatterns = [
    # API (ViewSets)
    path("api/", include(router.urls)),
    path("api/", include(veiculos_router.urls)),

    # APIViews avulsas
    path("api/dashboard/",            DashboardGeralAPIView.as_view(),    name="dashboard-geral"),
    path("api/cte/",                  CtePainelAPIView.as_view(),         name="painel-cte"),
    path("api/mdfe/",                 MdfePainelAPIView.as_view(),        name="painel-mdfe"),
    path("api/financeiro/",           FinanceiroPainelAPIView.as_view(),  name="painel-financeiro"),
    path("api/financeiro/mensal/",    FinanceiroMensalAPIView.as_view(),  name="financeiro-mensal"),
    path("api/financeiro/detalhe/",   FinanceiroDetalheAPIView.as_view(), name="financeiro-detalhe"),
    path("api/geografico/",           GeograficoPainelAPIView.as_view(),  name="painel-geografico"),
    path("api/alertas/pagamentos/",   AlertasPagamentoAPIView.as_view(),  name="alertas-pagamentos"),

    # Dados do usuário autenticado (utilizado pelo auth.js)
    path("api/users/me/", CurrentUserAPIView.as_view(), name="user_me"),

    # Autenticação baseada em sessão (templates)
    path("login/",  LoginView.as_view(template_name="login.html"),              name="login"),
    path("logout/", LogoutView.as_view(next_page="/login/"),                    name="logout"),

    # Páginas HTML (requerem login)
    path("dashboard/",    login_required(TemplateView.as_view(template_name="dashboard.html")),   name="dashboard"),
    path("cte/",          login_required(TemplateView.as_view(template_name="cte_panel.html")),   name="cte_panel"),
    path("mdfe/",         login_required(TemplateView.as_view(template_name="mdfe_panel.html")),  name="mdfe_panel"),
    path("upload/",       login_required(TemplateView.as_view(template_name="upload.html")),      name="upload"),
    path("financeiro/",   login_required(TemplateView.as_view(template_name="financeiro.html")),  name="financeiro"),
    path("geografico/",   login_required(TemplateView.as_view(template_name="geografico.html")),  name="geografico"),
    path("manutencao/",   login_required(TemplateView.as_view(template_name="manutencao.html")),  name="manutencao"),
    path("configuracoes/",login_required(TemplateView.as_view(template_name="configuracoes.html")),name="configuracoes"),
]

# =============================================
# ===      Mapa de URLs Geradas            ===
# =============================================
"""
Upload:
  POST /api/upload/
  
CT-e:
  GET /api/ctes/                     (Lista com filtros de data)
  GET /api/ctes/{uuid}/              (Detalhe CT-e)
  GET /api/ctes/{uuid}/xml/          (XML do CT-e)
  GET /api/cte/                      (Painel CT-e)
  
MDF-e:
  GET /api/mdfes/                    (Lista com filtros de data)
  GET /api/mdfes/{uuid}/             (Detalhe MDF-e)
  GET /api/mdfes/{uuid}/xml/         (XML do MDF-e)
  GET /api/mdfe/                     (Painel MDF-e)
  
Veículos e Manutenção:
  GET, POST /api/veiculos/
  GET, PUT, PATCH, DELETE /api/veiculos/{pk}/
  GET, POST /api/veiculos/{veiculo_pk}/manutencoes/
  GET, PUT, PATCH, DELETE /api/veiculos/{veiculo_pk}/manutencoes/{pk}/
  GET /api/manutencao/indicadores/    (Painel Manutenção)
  GET /api/manutencao/graficos/       (Painel Manutenção)
  GET /api/manutencao/ultimos/        (Painel Manutenção)
  
Pagamentos:
  GET, POST /api/pagamentos/agregados/
  GET, PUT, PATCH, DELETE /api/pagamentos/agregados/{pk}/
  POST /api/pagamentos/agregados/gerar/
  GET, POST /api/pagamentos/proprios/
  GET, PUT, PATCH, DELETE /api/pagamentos/proprios/{pk}/
  POST /api/pagamentos/proprios/gerar/
  
Parametrização:
  GET, POST /api/faixas-km/
  GET, PUT, PATCH, DELETE /api/faixas-km/{pk}/
  
Painéis e Alertas (APIViews):
  GET /api/dashboard/                (Dashboard Geral)
  GET /api/financeiro/               (Painel Financeiro Principal)
  GET /api/financeiro/mensal/        (Painel Financeiro Mensal)
  GET /api/financeiro/detalhe/       (Painel Financeiro Detalhe)
  GET /api/geografico/               (Painel Geográfico)
  GET /api/alertas/pagamentos/       (Alertas de Pagamentos)
  
Frontend:
  GET /                              (Página inicial)
  GET /dashboard/                    (Dashboard)
  GET /cte/                          (Painel CT-e)
  GET /mdfe/                         (Painel MDF-e)
  GET /upload/                       (Upload XML)
  GET /financeiro/                   (Painel Financeiro)
  GET /geografico/                   (Painel Geográfico)
  GET /manutencao/                   (Painel Manutenção)
  GET /configuracoes/                (Configurações)
"""