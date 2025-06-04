#!/usr/bin/env python3
"""
Script para testar todos os endpoints de pagamento
"""

import os
import sys
import django
import requests
import json
from datetime import date, datetime
from decimal import Decimal

# Configurar Django
sys.path.append('/mnt/c/Users/italo/workspace/DESTACK/cte_mdfe_api')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from transport.models import (
    FaixaKM, PagamentoAgregado, PagamentoProprio, 
    Veiculo, CTeDocumento
)

BASE_URL = 'http://localhost:8000'

class PaymentAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        
    def authenticate(self, username='admin', password='admin'):
        """Autenticar na API"""
        try:
            response = self.session.post(f'{BASE_URL}/api/token/', {
                'username': username,
                'password': password
            })
            if response.status_code == 200:
                data = response.json()
                self.token = data['access']
                self.session.headers.update({
                    'Authorization': f'Bearer {self.token}'
                })
                print("✅ Autenticação realizada com sucesso")
                return True
            else:
                print(f"❌ Erro na autenticação: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Erro na autenticação: {e}")
            return False
    
    def test_endpoint(self, method, endpoint, data=None, expected_status=200):
        """Testar um endpoint específico"""
        try:
            url = f'{BASE_URL}{endpoint}'
            
            if method.upper() == 'GET':
                response = self.session.get(url)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'PATCH':
                response = self.session.patch(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                print(f"❌ Método {method} não suportado")
                return False
                
            if response.status_code == expected_status:
                print(f"✅ {method} {endpoint} - Status: {response.status_code}")
                try:
                    data = response.json()
                    if isinstance(data, dict) and 'results' in data:
                        print(f"   📊 {len(data['results'])} registros retornados")
                    elif isinstance(data, list):
                        print(f"   📊 {len(data)} registros retornados")
                    elif isinstance(data, dict) and any(key in data for key in ['id', 'criados', 'message']):
                        if 'criados' in data:
                            print(f"   📝 {data.get('criados', 0)} criados, {data.get('erros', 0)} erros")
                        elif 'id' in data:
                            print(f"   🆔 ID: {data['id']}")
                except:
                    pass
                return True
            else:
                print(f"❌ {method} {endpoint} - Status: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   📄 Erro: {error_data}")
                except:
                    print(f"   📄 Erro: {response.text[:200]}")
                return False
                
        except Exception as e:
            print(f"❌ Erro ao testar {method} {endpoint}: {e}")
            return False
    
    def setup_test_data(self):
        """Criar dados de teste"""
        print("\n🔧 Configurando dados de teste...")
        
        # Criar faixas KM de teste
        FaixaKM.objects.all().delete()
        
        faixas = [
            {'min_km': 0, 'max_km': 5000, 'valor_pago': Decimal('1500.00')},
            {'min_km': 5001, 'max_km': 10000, 'valor_pago': Decimal('2000.00')},
            {'min_km': 10001, 'max_km': None, 'valor_pago': Decimal('2500.00')},
        ]
        
        for faixa_data in faixas:
            FaixaKM.objects.create(**faixa_data)
            
        # Verificar se há veículos
        veiculos_count = Veiculo.objects.count()
        ctes_count = CTeDocumento.objects.count()
        
        print(f"   📊 {len(faixas)} faixas KM criadas")
        print(f"   🚗 {veiculos_count} veículos disponíveis")
        print(f"   📜 {ctes_count} CT-es disponíveis")
        
        return True
    
    def test_faixas_km(self):
        """Testar endpoints de faixas KM"""
        print("\n🛣️  Testando Faixas KM...")
        
        # Listar faixas
        self.test_endpoint('GET', '/api/faixas-km/')
        
        # Criar nova faixa
        nova_faixa = {
            'min_km': 15000,
            'max_km': 20000,
            'valor_pago': 3000.00
        }
        
        response = self.session.post(f'{BASE_URL}/api/faixas-km/', json=nova_faixa)
        if response.status_code == 201:
            faixa_id = response.json()['id']
            print(f"✅ POST /api/faixas-km/ - Faixa criada com ID: {faixa_id}")
            
            # Testar edição
            self.test_endpoint('PUT', f'/api/faixas-km/{faixa_id}/', {
                'min_km': 15000,
                'max_km': 25000,
                'valor_pago': 3500.00
            })
            
            # Testar exclusão
            self.test_endpoint('DELETE', f'/api/faixas-km/{faixa_id}/', expected_status=204)
        else:
            print(f"❌ POST /api/faixas-km/ - Status: {response.status_code}")
    
    def test_pagamentos_agregados(self):
        """Testar endpoints de pagamentos agregados"""
        print("\n🚛 Testando Pagamentos Agregados...")
        
        # Listar pagamentos
        self.test_endpoint('GET', '/api/pagamentos/agregados/')
        
        # Testar filtros
        self.test_endpoint('GET', '/api/pagamentos/agregados/?status=pendente')
        
        # Testar geração em lote
        hoje = date.today()
        mes_passado = date(hoje.year, hoje.month - 1 if hoje.month > 1 else 12, 1)
        
        payload_gerar = {
            'data_inicio': mes_passado.isoformat(),
            'data_fim': hoje.isoformat(),
            'percentual': 25.0,
            'data_prevista': hoje.isoformat()
        }
        
        self.test_endpoint('POST', '/api/pagamentos/agregados/gerar/', payload_gerar, 201)
        
        # Testar exportação
        self.test_endpoint('GET', '/api/pagamentos/agregados/export/')
    
    def test_pagamentos_proprios(self):
        """Testar endpoints de pagamentos próprios"""
        print("\n👥 Testando Pagamentos Próprios...")
        
        # Listar pagamentos
        self.test_endpoint('GET', '/api/pagamentos/proprios/')
        
        # Testar cálculo de KM
        if Veiculo.objects.filter(tipo_proprietario='00', ativo=True).exists():
            veiculo = Veiculo.objects.filter(tipo_proprietario='00', ativo=True).first()
            
            payload_calcular = {
                'veiculo_id': veiculo.id,
                'periodo': '2024-12',
                'km_total': 8000
            }
            
            self.test_endpoint('POST', '/api/pagamentos/proprios/calcular_km/', payload_calcular)
        
        # Testar geração em lote
        payload_gerar = {
            'periodo': '2024-12',
            'veiculos': 'todos'
        }
        
        self.test_endpoint('POST', '/api/pagamentos/proprios/gerar/', payload_gerar, 201)
        
        # Testar exportação
        self.test_endpoint('GET', '/api/pagamentos/proprios/export/')
    
    def test_veiculos_integration(self):
        """Testar integração com veículos"""
        print("\n🚗 Testando Integração com Veículos...")
        
        # Listar veículos
        self.test_endpoint('GET', '/api/veiculos/')
        
        # Filtrar veículos próprios
        self.test_endpoint('GET', '/api/veiculos/?tipo_proprietario=00&ativo=true')
        
        # Filtrar veículos agregados
        self.test_endpoint('GET', '/api/veiculos/?tipo_proprietario=02&ativo=true')
    
    def test_crud_operations(self):
        """Testar operações CRUD completas"""
        print("\n🔄 Testando Operações CRUD...")
        
        # Testar CRUD em pagamentos agregados se existirem
        response = self.session.get(f'{BASE_URL}/api/pagamentos/agregados/')
        if response.status_code == 200:
            data = response.json()
            agregados = data.get('results', data) if isinstance(data, dict) and 'results' in data else data
            
            if agregados and len(agregados) > 0:
                pagamento_id = agregados[0]['id']
                
                # Testar GET individual
                self.test_endpoint('GET', f'/api/pagamentos/agregados/{pagamento_id}/')
                
                # Testar PATCH
                self.test_endpoint('PATCH', f'/api/pagamentos/agregados/{pagamento_id}/', {
                    'obs': 'Teste de atualização via API'
                })
        
        # Testar CRUD em pagamentos próprios se existirem
        response = self.session.get(f'{BASE_URL}/api/pagamentos/proprios/')
        if response.status_code == 200:
            data = response.json()
            proprios = data.get('results', data) if isinstance(data, dict) and 'results' in data else data
            
            if proprios and len(proprios) > 0:
                pagamento_id = proprios[0]['id']
                
                # Testar GET individual
                self.test_endpoint('GET', f'/api/pagamentos/proprios/{pagamento_id}/')
                
                # Testar PATCH
                self.test_endpoint('PATCH', f'/api/pagamentos/proprios/{pagamento_id}/', {
                    'ajustes': 100.00,
                    'obs': 'Ajuste de teste'
                })
    
    def run_all_tests(self):
        """Executar todos os testes"""
        print("🚀 Iniciando testes dos endpoints de pagamento...\n")
        
        if not self.authenticate():
            print("❌ Falha na autenticação. Verifique se o servidor está rodando.")
            return False
        
        self.setup_test_data()
        self.test_faixas_km()
        self.test_pagamentos_agregados()
        self.test_pagamentos_proprios()
        self.test_veiculos_integration()
        self.test_crud_operations()
        
        print("\n✅ Testes concluídos!")
        return True

def main():
    tester = PaymentAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()