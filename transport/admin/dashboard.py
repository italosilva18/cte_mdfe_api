from .common import *

class TransporteDashboardAdmin(admin.AdminSite):
    """Site de admin personalizado para o dashboard de Transporte."""
    site_header = 'Sistema de Gestão de Transporte'
    site_title = 'TMS Dashboard'
    index_title = 'Painel de Controle'
    
    def get_app_list(self, request):
        """Personaliza a lista de apps no painel lateral."""
        # Get the original app_list
        app_list = super().get_app_list(request)
        
        # Adiciona estatísticas no topo da lista de apps
        from django.db.models import Count, Sum
        
        # Obtém contagens
        ctes_count = CTeDocumento.objects.filter(processado=True).count()
        mdfes_count = MDFeDocumento.objects.filter(processado=True).count()
        veiculos_count = Veiculo.objects.filter(ativo=True).count()
        manutencoes_pendentes = ManutencaoVeiculo.objects.filter(status='PENDENTE').count()
        pagamentos_pendentes = PagamentoAgregado.objects.filter(status='pendente').count() + PagamentoProprio.objects.filter(status='pendente').count()
        
        # Adiciona uma nova seção no topo
        app_list.insert(0, {
            'name': 'Dashboard',
            'app_label': 'dashboard',
            'app_url': '/admin/',
            'has_module_perms': True,
            'models': [
                {
                    'name': f'CT-es: {ctes_count}',
                    'object_name': 'CTeCount',
                    'admin_url': reverse('admin:transport_ctedocumento_changelist'),
                    'perms': {'view': True}
                },
                {
                    'name': f'MDF-es: {mdfes_count}',
                    'object_name': 'MDFeCount',
                    'admin_url': reverse('admin:transport_mdfedocumento_changelist'),
                    'perms': {'view': True}
                },
                {
                    'name': f'Veículos Ativos: {veiculos_count}',
                    'object_name': 'VeiculoCount',
                    'admin_url': reverse('admin:transport_veiculo_changelist'),
                    'perms': {'view': True}
                },
                {
                    'name': f'Manutenções Pendentes: {manutencoes_pendentes}',
                    'object_name': 'ManutencaoPendente',
                    'admin_url': reverse('admin:transport_manutencaoveiculo_changelist') + '?status__exact=PENDENTE',
                    'perms': {'view': True}
                },
                {
                    'name': f'Pagamentos Pendentes: {pagamentos_pendentes}',
                    'object_name': 'PagamentoPendente',
                    'admin_url': reverse('admin:transport_pagamentoagregado_changelist') + '?status__exact=pendente',
                    'perms': {'view': True}
                },
            ]
        })
        
        return app_list
