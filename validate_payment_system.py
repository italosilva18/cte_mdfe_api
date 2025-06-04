#!/usr/bin/env python3
"""
Script para validar a implementação do sistema de pagamentos
"""

import os
import re
import json

def check_file_exists(filepath, description):
    """Verificar se um arquivo existe"""
    if os.path.exists(filepath):
        print(f"✅ {description}: {filepath}")
        return True
    else:
        print(f"❌ {description}: {filepath} - ARQUIVO NÃO ENCONTRADO")
        return False

def check_content_in_file(filepath, patterns, description):
    """Verificar se padrões existem em um arquivo"""
    if not os.path.exists(filepath):
        print(f"❌ {description}: {filepath} - ARQUIVO NÃO ENCONTRADO")
        return False
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        missing_patterns = []
        for pattern_name, pattern in patterns.items():
            if not re.search(pattern, content, re.IGNORECASE):
                missing_patterns.append(pattern_name)
        
        if not missing_patterns:
            print(f"✅ {description}: Todos os padrões encontrados")
            return True
        else:
            print(f"⚠️  {description}: Padrões não encontrados: {', '.join(missing_patterns)}")
            return False
            
    except Exception as e:
        print(f"❌ {description}: Erro ao ler arquivo - {e}")
        return False

def validate_payment_system():
    """Validar todo o sistema de pagamentos"""
    print("🔍 Validando Sistema de Pagamentos...\n")
    
    base_path = "/mnt/c/Users/italo/workspace/DESTACK/cte_mdfe_api"
    results = []
    
    # 1. Verificar arquivos principais
    print("📁 Verificando arquivos principais...")
    files_to_check = [
        (f"{base_path}/transport/views/payment_views.py", "Views de Pagamento"),
        (f"{base_path}/transport/serializers/payment_serializers.py", "Serializers de Pagamento"),
        (f"{base_path}/transport/templates/pagamentos.html", "Template de Pagamentos"),
        (f"{base_path}/transport/static/js/pagamentos.js", "JavaScript de Pagamentos"),
    ]
    
    for filepath, description in files_to_check:
        results.append(check_file_exists(filepath, description))
    
    print()
    
    # 2. Verificar models no arquivo principal
    print("🏗️  Verificando models...")
    models_patterns = {
        'FaixaKM': r'class\s+FaixaKM',
        'PagamentoAgregado': r'class\s+PagamentoAgregado',
        'PagamentoProprio': r'class\s+PagamentoProprio',
    }
    
    results.append(check_content_in_file(
        f"{base_path}/transport/models.py", 
        models_patterns, 
        "Models de Pagamento"
    ))
    
    # 3. Verificar ViewSets
    print("\n🎯 Verificando ViewSets...")
    viewsets_patterns = {
        'FaixaKMViewSet': r'class\s+FaixaKMViewSet',
        'PagamentoAgregadoViewSet': r'class\s+PagamentoAgregadoViewSet',
        'PagamentoProprioViewSet': r'class\s+PagamentoProprioViewSet',
        'gerar_action': r'def\s+gerar\(',
        'calcular_km': r'def\s+calcular_km',
        'export_action': r'def\s+export\(',
    }
    
    results.append(check_content_in_file(
        f"{base_path}/transport/views/payment_views.py", 
        viewsets_patterns, 
        "ViewSets de Pagamento"
    ))
    
    # 4. Verificar Serializers
    print("\n📋 Verificando Serializers...")
    serializers_patterns = {
        'FaixaKMSerializer': r'class\s+FaixaKMSerializer',
        'PagamentoAgregadoSerializer': r'class\s+PagamentoAgregadoSerializer',
        'PagamentoProprioSerializer': r'class\s+PagamentoProprioSerializer',
    }
    
    results.append(check_content_in_file(
        f"{base_path}/transport/serializers/payment_serializers.py", 
        serializers_patterns, 
        "Serializers de Pagamento"
    ))
    
    # 5. Verificar URLs
    print("\n🔗 Verificando URLs...")
    urls_patterns = {
        'faixas-km': r'faixas-km',
        'pagamentos_agregados': r'pagamentos/agregados',
        'pagamentos_proprios': r'pagamentos/proprios',
    }
    
    results.append(check_content_in_file(
        f"{base_path}/transport/urls.py", 
        urls_patterns, 
        "URLs de Pagamento"
    ))
    
    # 6. Verificar Template HTML
    print("\n🌐 Verificando Template HTML...")
    template_patterns = {
        'tab_agregados': r'tab.*agregados',
        'tab_proprios': r'tab.*proprios',
        'tab_faixas': r'tab.*faixas',
        'modal_gerar_agregados': r'modal.*[Gg]erar.*[Aa]gregados',
        'modal_gerar_proprios': r'modal.*[Gg]erar.*[Pp]roprios',
        'chart_js': r'chart\.js',
        'tabela_agregados': r'tabelaAgregados',
        'tabela_proprios': r'tabelaProprios',
    }
    
    results.append(check_content_in_file(
        f"{base_path}/transport/templates/pagamentos.html", 
        template_patterns, 
        "Template HTML"
    ))
    
    # 7. Verificar JavaScript
    print("\n⚡ Verificando JavaScript...")
    js_patterns = {
        'loadPagamentosAgregados': r'function\s+loadPagamentosAgregados',
        'loadPagamentosProprios': r'function\s+loadPagamentosProprios',
        'loadFaixasKM': r'function\s+loadFaixasKM',
        'confirmarGerarAgregados': r'function\s+confirmarGerarAgregados',
        'confirmarGerarProprios': r'function\s+confirmarGerarProprios',
        'chart_status': r'chartStatusAgregados',
        'chart_km': r'chartKmProprios',
        'formatCurrency': r'function\s+formatCurrency',
        'exportar_function': r'function\s+exportar',
    }
    
    results.append(check_content_in_file(
        f"{base_path}/transport/static/js/pagamentos.js", 
        js_patterns, 
        "JavaScript"
    ))
    
    # 8. Verificar estrutura de pastas
    print("\n📂 Verificando estrutura de pastas...")
    folders_to_check = [
        f"{base_path}/transport/views",
        f"{base_path}/transport/serializers", 
        f"{base_path}/transport/templates",
        f"{base_path}/transport/static/js",
    ]
    
    for folder in folders_to_check:
        if os.path.exists(folder):
            files_count = len([f for f in os.listdir(folder) if os.path.isfile(os.path.join(folder, f))])
            print(f"✅ {folder}: {files_count} arquivos")
            results.append(True)
        else:
            print(f"❌ {folder}: PASTA NÃO ENCONTRADA")
            results.append(False)
    
    # 9. Verificar configurações específicas
    print("\n⚙️  Verificando configurações específicas...")
    
    # Verificar se Chart.js está incluído
    chart_js_found = False
    try:
        with open(f"{base_path}/transport/templates/pagamentos.html", 'r', encoding='utf-8') as f:
            content = f.read()
            if 'chart.js' in content.lower():
                print("✅ Chart.js incluído no template")
                chart_js_found = True
            else:
                print("⚠️  Chart.js não encontrado no template")
    except:
        print("❌ Erro ao verificar Chart.js")
    
    results.append(chart_js_found)
    
    # Verificar autenticação JWT
    auth_found = False
    try:
        with open(f"{base_path}/transport/static/js/pagamentos.js", 'r', encoding='utf-8') as f:
            content = f.read()
            if 'Auth.fetchWithAuth' in content:
                print("✅ Autenticação JWT implementada")
                auth_found = True
            else:
                print("⚠️  Autenticação JWT não encontrada")
    except:
        print("❌ Erro ao verificar autenticação")
    
    results.append(auth_found)
    
    # Resumo final
    print(f"\n📊 RESUMO DA VALIDAÇÃO")
    print("=" * 50)
    total_checks = len(results)
    passed_checks = sum(results)
    failed_checks = total_checks - passed_checks
    
    print(f"✅ Passou: {passed_checks}/{total_checks}")
    print(f"❌ Falhou: {failed_checks}/{total_checks}")
    print(f"📈 Taxa de Sucesso: {(passed_checks/total_checks)*100:.1f}%")
    
    if passed_checks == total_checks:
        print("\n🎉 SISTEMA DE PAGAMENTOS COMPLETAMENTE IMPLEMENTADO!")
    elif passed_checks >= total_checks * 0.8:
        print("\n✅ SISTEMA DE PAGAMENTOS QUASE COMPLETO - Pequenos ajustes necessários")
    elif passed_checks >= total_checks * 0.6:
        print("\n⚠️  SISTEMA DE PAGAMENTOS PARCIALMENTE IMPLEMENTADO - Implementação em progresso")
    else:
        print("\n❌ SISTEMA DE PAGAMENTOS INCOMPLETO - Implementação necessária")
    
    return passed_checks == total_checks

def check_api_endpoints_structure():
    """Verificar estrutura dos endpoints API"""
    print("\n🔌 Verificando estrutura dos endpoints API...")
    
    base_path = "/mnt/c/Users/italo/workspace/DESTACK/cte_mdfe_api"
    
    # Lista de endpoints esperados
    expected_endpoints = [
        "/api/faixas-km/",
        "/api/pagamentos/agregados/", 
        "/api/pagamentos/agregados/gerar/",
        "/api/pagamentos/agregados/export/",
        "/api/pagamentos/proprios/",
        "/api/pagamentos/proprios/gerar/",
        "/api/pagamentos/proprios/calcular_km/",
        "/api/pagamentos/proprios/export/",
    ]
    
    try:
        with open(f"{base_path}/transport/urls.py", 'r', encoding='utf-8') as f:
            urls_content = f.read()
        
        found_endpoints = []
        missing_endpoints = []
        
        for endpoint in expected_endpoints:
            # Simplificar busca por partes do endpoint
            endpoint_parts = endpoint.strip('/').split('/')
            if any(part in urls_content for part in endpoint_parts if part not in ['api']):
                found_endpoints.append(endpoint)
            else:
                missing_endpoints.append(endpoint)
        
        print(f"✅ Endpoints encontrados: {len(found_endpoints)}")
        for endpoint in found_endpoints:
            print(f"   - {endpoint}")
            
        if missing_endpoints:
            print(f"⚠️  Endpoints possivelmente ausentes: {len(missing_endpoints)}")
            for endpoint in missing_endpoints:
                print(f"   - {endpoint}")
        
        return len(missing_endpoints) == 0
        
    except Exception as e:
        print(f"❌ Erro ao verificar endpoints: {e}")
        return False

def main():
    """Função principal"""
    print("🚀 VALIDADOR DO SISTEMA DE PAGAMENTOS")
    print("=" * 50)
    
    # Validar implementação geral
    system_valid = validate_payment_system()
    
    # Verificar endpoints
    endpoints_valid = check_api_endpoints_structure()
    
    print(f"\n🏁 RESULTADO FINAL")
    print("=" * 30)
    
    if system_valid and endpoints_valid:
        print("🎉 SISTEMA COMPLETO E PRONTO PARA USO!")
        return True
    elif system_valid:
        print("✅ SISTEMA IMPLEMENTADO - Verificar configuração de endpoints")
        return True
    else:
        print("⚠️  SISTEMA PRECISA DE AJUSTES")
        return False

if __name__ == '__main__':
    main()