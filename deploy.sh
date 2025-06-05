#!/bin/bash
# ===================================
# Script de Deploy - CT-e/MDF-e API
# ===================================

echo "=== Iniciando Deploy da API CT-e/MDF-e ==="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para exibir erros
error_exit() {
    echo -e "${RED}ERRO: $1${NC}" >&2
    exit 1
}

# Função para exibir sucesso
success_msg() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Função para exibir aviso
warning_msg() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Verificar se está rodando como root
if [[ $EUID -eq 0 ]]; then
   error_exit "Este script não deve ser executado como root!"
fi

# Diretório do projeto
PROJECT_DIR="/var/www/cte_mdfe_api"
VENV_DIR="$PROJECT_DIR/venv"

# 1. Criar diretórios necessários
echo "1. Criando estrutura de diretórios..."
sudo mkdir -p $PROJECT_DIR
sudo mkdir -p /var/log/cte_mdfe_api
sudo chown -R $USER:www-data $PROJECT_DIR
sudo chown -R $USER:www-data /var/log/cte_mdfe_api
success_msg "Diretórios criados"

# 2. Copiar arquivos do projeto
echo "2. Copiando arquivos do projeto..."
if [ -d "$PROJECT_DIR/.git" ]; then
    warning_msg "Projeto já existe. Atualizando via git pull..."
    cd $PROJECT_DIR
    git pull origin main || error_exit "Falha ao atualizar projeto via git"
else
    # Se não tem git, assume que os arquivos serão copiados manualmente
    warning_msg "Copie os arquivos do projeto para $PROJECT_DIR"
    read -p "Pressione ENTER quando os arquivos estiverem copiados..."
fi

# 3. Criar e ativar ambiente virtual
echo "3. Configurando ambiente virtual Python..."
cd $PROJECT_DIR
python3 -m venv $VENV_DIR || error_exit "Falha ao criar ambiente virtual"
source $VENV_DIR/bin/activate || error_exit "Falha ao ativar ambiente virtual"
success_msg "Ambiente virtual criado e ativado"

# 4. Atualizar pip e instalar dependências
echo "4. Instalando dependências..."
pip install --upgrade pip
pip install -r requirements-prod.txt || error_exit "Falha ao instalar dependências"
success_msg "Dependências instaladas"

# 5. Configurar arquivo .env
echo "5. Configurando variáveis de ambiente..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp $PROJECT_DIR/.env.example $PROJECT_DIR/.env
    warning_msg "Arquivo .env criado a partir do .env.example"
    warning_msg "IMPORTANTE: Edite o arquivo .env com suas configurações!"
    read -p "Pressione ENTER após editar o arquivo .env..."
else
    success_msg "Arquivo .env já existe"
fi

# 6. Coletar arquivos estáticos
echo "6. Coletando arquivos estáticos..."
python manage.py collectstatic --noinput || error_exit "Falha ao coletar arquivos estáticos"
success_msg "Arquivos estáticos coletados"

# 7. Executar migrações
echo "7. Executando migrações do banco de dados..."
python manage.py migrate || error_exit "Falha ao executar migrações"
success_msg "Migrações executadas"

# 8. Criar superusuário
echo "8. Criar superusuário..."
echo "Deseja criar um superusuário agora? (s/n)"
read -r response
if [[ "$response" =~ ^([sS])$ ]]; then
    python manage.py createsuperuser
fi

# 9. Configurar permissões
echo "9. Ajustando permissões..."
sudo chown -R $USER:www-data $PROJECT_DIR
sudo chmod -R 755 $PROJECT_DIR
sudo chmod -R 775 $PROJECT_DIR/media
sudo chmod -R 775 $PROJECT_DIR/static
sudo chmod 664 $PROJECT_DIR/.env
success_msg "Permissões ajustadas"

# 10. Testar a aplicação
echo "10. Testando a aplicação..."
python manage.py check || warning_msg "Verificação retornou avisos"

# 11. Criar arquivo de serviço systemd
echo "11. Configurando serviço systemd..."
sudo tee /etc/systemd/system/cte_mdfe_api.service > /dev/null <<EOF
[Unit]
Description=CT-e/MDF-e API
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$PROJECT_DIR
Environment="PATH=$VENV_DIR/bin"
ExecStart=$VENV_DIR/bin/gunicorn \
    --workers 3 \
    --bind unix:/run/cte_mdfe_api.sock \
    --access-logfile /var/log/cte_mdfe_api/access.log \
    --error-logfile /var/log/cte_mdfe_api/error.log \
    core.wsgi:application

[Install]
WantedBy=multi-user.target
EOF

# 12. Iniciar e habilitar serviço
echo "12. Iniciando serviço..."
sudo systemctl daemon-reload
sudo systemctl enable cte_mdfe_api
sudo systemctl start cte_mdfe_api
sudo systemctl status cte_mdfe_api --no-pager
success_msg "Serviço configurado e iniciado"

# 13. Configurar Nginx (exemplo)
echo "13. Exemplo de configuração Nginx:"
cat <<EOF

server {
    listen 80;
    server_name your-domain.com;

    location = /favicon.ico { access_log off; log_not_found off; }
    
    location /static/ {
        alias $PROJECT_DIR/static/;
    }
    
    location /media/ {
        alias $PROJECT_DIR/media/;
    }
    
    location / {
        include proxy_params;
        proxy_pass http://unix:/run/cte_mdfe_api.sock;
    }
}

EOF

echo ""
success_msg "Deploy concluído!"
echo ""
echo "Próximos passos:"
echo "1. Configure o Nginx com o exemplo acima"
echo "2. Configure o SSL com Let's Encrypt"
echo "3. Configure o firewall (ufw)"
echo "4. Configure backups automáticos"
echo ""
echo "Comandos úteis:"
echo "- Ver logs: sudo journalctl -u cte_mdfe_api -f"
echo "- Reiniciar: sudo systemctl restart cte_mdfe_api"
echo "- Status: sudo systemctl status cte_mdfe_api"