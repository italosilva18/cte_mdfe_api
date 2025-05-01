# transport/urls.py
from django.urls import include, path
from django.views.generic import TemplateView
from django.contrib.auth.views import LoginView, LogoutView
from django.contrib.auth.decorators import login_required

from rest_framework.routers import DefaultRouter
from rest_framework_nested import routers
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

# --- Views ---
from .views import (
    # ViewSets (CRUD / consultas)
    CTeDocumentoViewSet, MDFeDocumentoViewSet,
    VeiculoViewSet, ManutencaoVeiculoViewSet,
    UnifiedUploadViewSet, ManutencaoPainelViewSet,
    FaixaKMViewSet, PagamentoAgregadoViewSet, PagamentoProprioViewSet,
    UserViewSet, # <-- Adicionado

    # APIViews (painéis / extras)
    DashboardGeralAPIView, CtePainelAPIView, MdfePainelAPIView,
    FinanceiroPainelAPIView, FinanceiroMensalAPIView, FinanceiroDetalheAPIView,
    GeograficoPainelAPIView, AlertasPagamentoAPIView,
    RelatorioAPIView,
    BackupAPIView, # <-- Adicionado

    # Dados do usuário autenticado
    CurrentUserAPIView,
)

# --- Documentação da API (drf-yasg) ---
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

schema_view = get_schema_view(
   openapi.Info(
      title="API Sistema Transporte",
      default_version='v1',
      description="Documentação da API para o sistema de gestão de CT-e e MDF-e",
      # terms_of_service="URL_DOS_TERMOS_DE_SERVICO", # Descomente e ajuste se tiver
      contact=openapi.Contact(email="seu_email_de_contato@exemplo.com"), # Ajuste o email
      # license=openapi.License(name="Sua Licença"), # Ajuste se tiver licença
   ),
   public=True, # Mude para False se quiser acesso restrito à documentação
   permission_classes=(permissions.AllowAny,), # Ou permissions.IsAdminUser, etc.
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
router.register(r"usuarios",             UserViewSet,          basename="usuario") # <-- Adicionado

# rotas aninhadas: /veiculos/{veiculo_pk}/manutencoes/
veiculos_router = routers.NestedSimpleRouter(router, r"veiculos", lookup="veiculo")
veiculos_router.register(r"manutencoes", ManutencaoVeiculoViewSet, basename="veiculo-manutencao")

# ------------------------------------------------------------------ #
# URL patterns
# ------------------------------------------------------------------ #
urlpatterns = [
    # --- API Endpoints ---
    path("api/", include(router.urls)),
    path("api/", include(veiculos_router.urls)),

    # Autenticação JWT
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    
    # APIViews avulsas
    path("api/dashboard/",            DashboardGeralAPIView.as_view(),    name="dashboard-geral"),
    path("api/cte/",                  CtePainelAPIView.as_view(),         name="painel-cte"),
    path("api/mdfe/",                 MdfePainelAPIView.as_view(),        name="painel-mdfe"),
    path("api/financeiro/",           FinanceiroPainelAPIView.as_view(),  name="painel-financeiro"),
    path("api/financeiro/mensal/",    FinanceiroMensalAPIView.as_view(),  name="financeiro-mensal"),
    path("api/financeiro/detalhe/",   FinanceiroDetalheAPIView.as_view(), name="financeiro-detalhe"),
    path("api/geografico/",           GeograficoPainelAPIView.as_view(),  name="painel-geografico"),
    path("api/alertas/pagamentos/",   AlertasPagamentoAPIView.as_view(),  name="alertas-pagamentos"),
    path("api/relatorios/",           RelatorioAPIView.as_view(),         name="relatorios"), # <-- Adicionado
    path("api/backup/gerar/",         BackupAPIView.as_view(),            name="gerar-backup"), # <-- Adicionado

    # Dados do usuário autenticado (usado pelo auth.js)
    path("api/users/me/", CurrentUserAPIView.as_view(), name="user_me"), # Permite GET e PATCH

    # --- Documentação da API (Swagger/ReDoc) ---
    path('api/swagger<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
    path('api/swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('api/redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),

    # --- Autenticação e Páginas HTML ---
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

    # Página Inicial (Raiz) - Deve estar no urls.py principal (core/urls.py)
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
]

# =============================================
# ===      Mapa de URLs Geradas (ATUALIZADO) ===
# =============================================
"""
Autenticação JWT:
  POST /api/token/                    (Obtém token JWT)
  POST /api/token/refresh/            (Atualiza token JWT)

Upload:
  POST /api/upload/

CT-e:
  GET /api/ctes/
  GET /api/ctes/{uuid}/
  GET /api/ctes/{uuid}/xml/
  GET /api/ctes/{uuid}/dacte/
  GET /api/cte/

MDF-e:
  GET /api/mdfes/
  GET /api/mdfes/{uuid}/
  GET /api/mdfes/{uuid}/xml/
  GET /api/mdfes/{uuid}/damdfe/
  GET /api/mdfe/

Veículos e Manutenção:
  GET, POST /api/veiculos/
  GET, PUT, PATCH, DELETE /api/veiculos/{pk}/
  GET /api/veiculos/{pk}/estatisticas/
  GET, POST /api/veiculos/{veiculo_pk}/manutencoes/
  GET, PUT, PATCH, DELETE /api/veiculos/{veiculo_pk}/manutencoes/{pk}/
  GET /api/manutencao/indicadores/
  GET /api/manutencao/graficos/
  GET /api/manutencao/ultimos/
  GET /api/manutencao/tendencias/

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

Usuários:
  GET, PATCH /api/users/me/              (Usuário logado)
  GET, POST /api/usuarios/             (Lista/Cria usuários - Admin)
  GET, PUT, PATCH, DELETE /api/usuarios/{pk}/ (Detalhe/Atualiza/Deleta usuário - Admin)

Painéis, Alertas e Outros (APIViews):
  GET /api/dashboard/
  GET /api/financeiro/
  GET /api/financeiro/mensal/
  GET /api/financeiro/detalhe/
  GET /api/geografico/
  GET /api/alertas/pagamentos/
  GET /api/relatorios/
  POST /api/backup/gerar/

Documentação API:
  GET /api/swagger/
  GET /api/redoc/
  GET /api/swagger.json
  GET /api/swagger.yaml

Frontend:
  /login/
  /logout/
  /dashboard/
  /cte/
  /mdfe/
  /upload/
  /financeiro/
  /geografico/
  /manutencao/
  /configuracoes/
  / (Raiz)
"""