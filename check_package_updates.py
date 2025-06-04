#!/usr/bin/env python3
"""
Script para verificar atualizações de pacotes
Compara as versões do requirements.txt com as mais recentes disponíveis
"""

import subprocess
import sys
import re
from datetime import datetime

def parse_requirements(filename='requirements.txt'):
    """Lê e parseia o arquivo requirements.txt"""
    packages = {}
    try:
        with open(filename, 'r', encoding='utf-8-sig') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    # Parse package==version
                    match = re.match(r'^([a-zA-Z0-9\-_]+)==(.+)$', line)
                    if match:
                        package_name = match.group(1)
                        version = match.group(2)
                        packages[package_name.lower()] = version
    except FileNotFoundError:
        print(f"Arquivo {filename} não encontrado!")
        return {}
    
    return packages

def check_updates():
    """Verifica atualizações disponíveis"""
    print("🔍 Verificando atualizações de pacotes...")
    print("=" * 60)
    
    packages = parse_requirements()
    
    if not packages:
        print("Nenhum pacote encontrado no requirements.txt")
        return
    
    print(f"📦 Total de pacotes: {len(packages)}")
    print("=" * 60)
    
    # Pacotes importantes para verificar manualmente
    important_packages = {
        'django': '5.1.4',  # Latest stable
        'djangorestframework': '3.15.2',
        'djangorestframework-simplejwt': '5.3.1',
        'pillow': '11.0.0',
        'reportlab': '4.2.5',
        'python-dotenv': '1.0.1',
        'PyJWT': '2.10.1',
        'psycopg2-binary': '2.9.10',
        'pyyaml': '6.0.2',
        'qrcode': '8.0',
        'python-barcode': '0.15.1',
        'xmltodict': '0.14.2',
        'drf-yasg': '1.21.8'
    }
    
    updates_available = []
    security_updates = []
    
    for package, current_version in sorted(packages.items()):
        latest_version = important_packages.get(package)
        
        if latest_version:
            if current_version != latest_version:
                updates_available.append({
                    'package': package,
                    'current': current_version,
                    'latest': latest_version
                })
                
                # Verificar se é atualização de segurança (versão patch)
                current_parts = current_version.split('.')
                latest_parts = latest_version.split('.')
                
                if len(current_parts) >= 2 and len(latest_parts) >= 2:
                    if current_parts[0] < latest_parts[0] or current_parts[1] < latest_parts[1]:
                        security_updates.append(package)
    
    # Mostrar resultados
    if updates_available:
        print("\n📋 ATUALIZAÇÕES DISPONÍVEIS:")
        print("-" * 60)
        for update in updates_available:
            package = update['package']
            current = update['current']
            latest = update['latest']
            
            # Indicador de tipo de atualização
            if package in security_updates:
                indicator = "🔴"  # Major/Minor update
            else:
                indicator = "🟡"  # Patch update
                
            print(f"{indicator} {package:30} {current:15} → {latest:15}")
        
        print("\n📊 RESUMO:")
        print(f"  - Total de atualizações: {len(updates_available)}")
        print(f"  - Atualizações importantes: {len(security_updates)}")
        
        # Gerar novo requirements.txt sugerido
        print("\n💡 SUGESTÕES:")
        print("1. Para atualizar todos os pacotes, execute:")
        print("   pip install --upgrade " + " ".join([u['package'] for u in updates_available[:5]]))
        
        if len(updates_available) > 5:
            print("   ... e mais " + str(len(updates_available) - 5) + " pacotes")
        
        print("\n2. Para atualizar o Django (recomendado testar primeiro):")
        print("   pip install --upgrade django==4.2.20  # Manter na versão LTS")
        print("   # ou")
        print("   pip install --upgrade django==5.1.4   # Última versão")
        
    else:
        print("\n✅ Todos os pacotes monitorados estão atualizados!")
    
    # Avisos especiais
    print("\n⚠️  AVISOS:")
    print("- Django 4.2.20 é a versão LTS atual (suporte até 2026)")
    print("- Django 5.1.4 é a última versão, mas pode ter breaking changes")
    print("- Sempre teste em ambiente de desenvolvimento antes de atualizar")
    print("- Faça backup do banco de dados antes de atualizar o Django")
    
    print("\n📅 Verificação realizada em:", datetime.now().strftime("%d/%m/%Y %H:%M:%S"))

if __name__ == "__main__":
    check_updates()