# transport/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Certifique-se de instalar: pip install drf-nested-routers
from rest_framework_nested import routers

# Importar todas as ViewSets e APIViews do views.py
from .views import (
    # Views/ViewSets Existentes (Consulta/CRUD)
    CTeDocumentoViewSet,
    MDFeDocumentoViewSet,
    VeiculoViewSet,
    ManutencaoVeiculoViewSet,
    
    # ViewSet Unificada de Upload
    UnifiedUploadViewSet,
    
    # Novas APIViews/ViewSets para Painéis e Funcionalidades
    DashboardGeralAPIView,
    CtePainelAPIView,
    MdfePainelAPIView,
    FinanceiroPainelAPIView,
    FinanceiroMensalAPIView,
    FinanceiroDetalheAPIView,
    GeograficoPainelAPIView,
    ManutencaoPainelViewSet,
    
    # Pagamentos
    FaixaKMViewSet,
    PagamentoProprioViewSet,
    PagamentoAgregadoViewSet,
    
    # Alertas
    AlertasPagamentoAPIView,
)

# --- Roteador Principal (para ViewSets) ---
router = DefaultRouter()

# --- Registro das ViewSets no Roteador Principal ---

# Endpoint Unificado de Upload
router.register(r'upload', UnifiedUploadViewSet, basename='unified-upload')

# Consulta CT-e / MDF-e
router.register(r'ctes', CTeDocumentoViewSet, basename='cte-documento')
router.register(r'mdfes', MDFeDocumentoViewSet, basename='mdfe-documento')

# CRUD Veículos
router.register(r'veiculos', VeiculoViewSet, basename='veiculo')

# CRUD e Ações Pagamentos Agregados
router.register(r'pagamentos/agregados', PagamentoAgregadoViewSet, basename='pagamento-agregado')

# CRUD e Ações Pagamentos Próprios
router.register(r'pagamentos/proprios', PagamentoProprioViewSet, basename='pagamento-proprio')

# CRUD Faixas de KM (Parametrização)
router.register(r'faixas-km', FaixaKMViewSet, basename='faixa-km')

# Ações do Painel de Manutenção (Indicadores, Gráficos, Últimos)
router.register(r'manutencao', ManutencaoPainelViewSet, basename='manutencao-painel')

# --- Roteador Aninhado para CRUD de Manutenções ---
# Cria um roteador aninhado para as manutenções dentro de veículos.
# Ex: /api/veiculos/{veiculo_pk}/manutencoes/
veiculos_router = routers.NestedSimpleRouter(router, r'veiculos', lookup='veiculo')

# Registra a ViewSet de CRUD de Manutenções no roteador aninhado.
veiculos_router.register(
    r'manutencoes', ManutencaoVeiculoViewSet, basename='veiculo-manutencao'
)

# --- Definição das URLs ---
# A lista urlpatterns define as URLs raiz da aplicação 'transport'.
urlpatterns = [
    # 1. Inclui todas as URLs geradas pelo roteador principal (ViewSets)
    path('api/', include(router.urls)),
    
    # 2. Inclui todas as URLs geradas pelo roteador aninhado (Manutenções por Veículo)
    path('api/', include(veiculos_router.urls)),
    
    # 3. Define Paths específicos para as APIViews (que não usam roteador)
    path('api/dashboard/', DashboardGeralAPIView.as_view(), name='dashboard-geral'),
    path('api/cte/', CtePainelAPIView.as_view(), name='painel-cte'),
    path('api/mdfe/', MdfePainelAPIView.as_view(), name='painel-mdfe'),
    path('api/financeiro/', FinanceiroPainelAPIView.as_view(), name='painel-financeiro'),
    path('api/financeiro/mensal/', FinanceiroMensalAPIView.as_view(), name='financeiro-mensal'),
    path('api/financeiro/detalhe/', FinanceiroDetalheAPIView.as_view(), name='financeiro-detalhe'),
    path('api/geografico/', GeograficoPainelAPIView.as_view(), name='painel-geografico'),
    path('api/alertas/pagamentos/', AlertasPagamentoAPIView.as_view(), name='alertas-pagamentos'),
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
"""