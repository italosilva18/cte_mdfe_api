# transport/html_urls.py
from django.urls import path
from django.views.generic import TemplateView
from django.contrib.auth.decorators import login_required

# ------------------------------------------------------------------ #
# URL patterns - APENAS páginas HTML
# ------------------------------------------------------------------ #
urlpatterns = [
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
    path("alertas/", login_required(TemplateView.as_view(template_name="alertas.html")), name="alertas_page"),
    path("pagamentos/", login_required(TemplateView.as_view(template_name="pagamentos.html")), name="pagamentos_page"),

    # Rota principal do app redireciona para o dashboard se logado
    path('', login_required(TemplateView.as_view(template_name="dashboard.html")), name="app_home"),
]