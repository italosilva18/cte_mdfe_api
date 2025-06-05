# Guia de Deploy - API CT-e/MDF-e

## Requisitos da VPS

### Sistema Operacional
- Ubuntu 22.04 LTS ou superior
- Debian 11 ou superior

### Hardware Mínimo
- 2 GB RAM
- 2 vCPUs
- 20 GB de espaço em disco

### Software Necessário
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y python3-pip python3-venv python3-dev
sudo apt install -y postgresql postgresql-contrib  # ou mysql-server
sudo apt install -y nginx
sudo apt install -y git curl wget
sudo apt install -y build-essential libpq-dev  # para PostgreSQL
```

## Passo a Passo do Deploy

### 1. Preparar o Banco de Dados

#### PostgreSQL (Recomendado)
```bash
# Acessar PostgreSQL
sudo -u postgres psql

# Criar banco e usuário
CREATE DATABASE cte_mdfe_db;
CREATE USER cte_mdfe_user WITH PASSWORD 'sua_senha_segura';
ALTER ROLE cte_mdfe_user SET client_encoding TO 'utf8';
ALTER ROLE cte_mdfe_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE cte_mdfe_user SET timezone TO 'America/Sao_Paulo';
GRANT ALL PRIVILEGES ON DATABASE cte_mdfe_db TO cte_mdfe_user;
\q
```

#### MySQL (Alternativa)
```bash
# Acessar MySQL
sudo mysql

# Criar banco e usuário
CREATE DATABASE cte_mdfe_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cte_mdfe_user'@'localhost' IDENTIFIED BY 'sua_senha_segura';
GRANT ALL PRIVILEGES ON cte_mdfe_db.* TO 'cte_mdfe_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. Clonar ou Copiar o Projeto

```bash
# Via Git (se tiver repositório)
cd /var/www
sudo git clone https://github.com/seu-usuario/cte_mdfe_api.git
sudo chown -R $USER:www-data cte_mdfe_api

# Ou via SCP (copiar da máquina local)
scp -r /caminho/local/cte_mdfe_api user@seu-servidor:/var/www/
```

### 3. Executar Script de Deploy

```bash
cd /var/www/cte_mdfe_api
./deploy.sh
```

### 4. Configurar Nginx

Criar arquivo `/etc/nginx/sites-available/cte_mdfe_api`:

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    client_max_body_size 10M;

    location = /favicon.ico { 
        access_log off; 
        log_not_found off; 
    }
    
    location /static/ {
        alias /var/www/cte_mdfe_api/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    location /media/ {
        alias /var/www/cte_mdfe_api/media/;
        expires 7d;
    }
    
    location / {
        include proxy_params;
        proxy_pass http://unix:/run/cte_mdfe_api.sock;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

Ativar o site:
```bash
sudo ln -s /etc/nginx/sites-available/cte_mdfe_api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Configurar SSL com Let's Encrypt

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d seu-dominio.com.br -d www.seu-dominio.com.br

# Renovação automática já é configurada
sudo certbot renew --dry-run
```

### 6. Configurar Firewall

```bash
# Configurar UFW
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 80/tcp        # HTTP
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
```

### 7. Configurar Backups Automáticos

Criar `/etc/cron.d/cte_mdfe_backup`:

```cron
# Backup diário às 3h da manhã
0 3 * * * www-data /var/www/cte_mdfe_api/scripts/maintenance/backup_automatic.py
```

## Monitoramento

### Logs do Sistema
```bash
# Logs da aplicação
sudo tail -f /var/log/cte_mdfe_api/app.log

# Logs do Gunicorn
sudo journalctl -u cte_mdfe_api -f

# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Status dos Serviços
```bash
# Status da API
sudo systemctl status cte_mdfe_api

# Status do Nginx
sudo systemctl status nginx

# Status do PostgreSQL
sudo systemctl status postgresql
```

## Manutenção

### Atualizar Aplicação
```bash
cd /var/www/cte_mdfe_api
git pull origin main
source venv/bin/activate
pip install -r requirements-prod.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart cte_mdfe_api
```

### Comandos Úteis
```bash
# Reiniciar aplicação
sudo systemctl restart cte_mdfe_api

# Ver logs em tempo real
sudo journalctl -u cte_mdfe_api -f

# Acessar shell Django
cd /var/www/cte_mdfe_api
source venv/bin/activate
python manage.py shell

# Limpar sessões antigas
python manage.py clearsessions
```

## Segurança

### Checklist de Segurança
- [ ] Alterar SECRET_KEY no .env
- [ ] Desabilitar DEBUG em produção
- [ ] Configurar ALLOWED_HOSTS corretamente
- [ ] Usar HTTPS sempre
- [ ] Configurar CORS adequadamente
- [ ] Manter sistema e dependências atualizados
- [ ] Configurar backup automático
- [ ] Monitorar logs regularmente
- [ ] Usar senhas fortes para banco de dados
- [ ] Restringir acesso SSH (usar chaves)

## Troubleshooting

### Erro 502 Bad Gateway
```bash
# Verificar se o serviço está rodando
sudo systemctl status cte_mdfe_api

# Verificar permissões do socket
ls -la /run/cte_mdfe_api.sock

# Reiniciar serviços
sudo systemctl restart cte_mdfe_api
sudo systemctl restart nginx
```

### Erro de Permissão
```bash
# Corrigir permissões
sudo chown -R $USER:www-data /var/www/cte_mdfe_api
sudo chmod -R 755 /var/www/cte_mdfe_api
sudo chmod -R 775 /var/www/cte_mdfe_api/media
```

### Erro de Migração
```bash
# Verificar conexão com banco
cd /var/www/cte_mdfe_api
source venv/bin/activate
python manage.py dbshell

# Forçar migração
python manage.py migrate --run-syncdb
```

## Contato e Suporte

Em caso de problemas:
1. Verifique os logs do sistema
2. Consulte a documentação do Django
3. Verifique as issues do projeto no GitHub