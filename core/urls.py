"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from transport.views.simple_auth import simple_login, simple_logout

urlpatterns = [
    # Django Admin
    path("admin/", admin.site.urls),

    # Landing page pública (página principal)
    path("", TemplateView.as_view(template_name="index.html"), name="index"),

    # Autenticação simples
    path("login/", simple_login, name="login"),
    path("logout/", simple_logout, name="logout"),

    # APIs diretamente em /api/
    path("api/", include("transport.api_urls")),
    
    # Sistema interno (dashboard e outras páginas)
    path("app/", include("transport.html_urls")),
]