# Guia Docker - API CT-e/MDF-e

## 🐳 Arquitetura Docker

A aplicação é composta pelos seguintes containers:

- **web**: Aplicação Django com Gunicorn
- **db**: PostgreSQL 15
- **redis**: Cache e broker para Celery
- **nginx**: Servidor web e proxy reverso
- **celery**: Worker para tarefas assíncronas
- **celery-beat**: Agendador de tarefas
- **backup**: Backup automático do banco

## 🚀 Quick Start

### 1. Pré-requisitos

```bash
# Instalar Docker e Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Configuração

```bash
# Clonar o projeto
git clone <seu-repositorio>
cd cte_mdfe_api

# Configurar ambiente
cp .env.docker.example .env
# Editar .env com suas configurações

# Tornar script executável
chmod +x docker-manage.sh
```

### 3. Iniciar Aplicação

```bash
# Iniciar todos os serviços
./docker-manage.sh start

# Aguardar inicialização completa
# A aplicação estará disponível em: http://localhost
```

## 📋 Comandos Disponíveis

### Gerenciamento Básico

```bash
# Iniciar aplicação
./docker-manage.sh start

# Parar aplicação
./docker-manage.sh stop

# Reiniciar aplicação
./docker-manage.sh restart

# Ver status dos containers
./docker-manage.sh status

# Ver logs (web, nginx, db, redis, celery)
./docker-manage.sh logs [serviço]
```

### Desenvolvimento

```bash
# Reconstruir imagens
./docker-manage.sh build

# Reconstruir e reiniciar
./docker-manage.sh rebuild

# Shell Django
./docker-manage.sh shell

# Executar migrações
./docker-manage.sh migrate

# Coletar arquivos estáticos
./docker-manage.sh collectstatic

# Criar superusuário
./docker-manage.sh createsuperuser
```

### Backup e Restore

```bash
# Backup manual
./docker-manage.sh backup

# Restaurar backup
./docker-manage.sh restore backup_file.sql.gz

# Backups automáticos são salvos em ./backups/
```

### Manutenção

```bash
# Atualizar aplicação (git pull + rebuild)
./docker-manage.sh update

# Configurar SSL/HTTPS
./docker-manage.sh ssl meudominio.com.br

# Limpar ambiente (CUIDADO!)
./docker-manage.sh clean
```

## ⚙️ Configurações Importantes

### Arquivo .env

```bash
# Django
DJANGO_SECRET_KEY=sua-chave-secreta-aqui
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=seu-dominio.com,www.seu-dominio.com

# Banco de Dados
POSTGRES_DB=cte_mdfe_db
POSTGRES_USER=cte_mdfe_user
POSTGRES_PASSWORD=senha-muito-segura

# Superusuário (criado automaticamente)
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@seu-dominio.com
DJANGO_SUPERUSER_PASSWORD=senha-admin-segura

# Email (para notificações)
EMAIL_HOST_USER=seu-email@gmail.com
EMAIL_HOST_PASSWORD=senha-app-gmail
```

### Domínio e SSL

Para usar com domínio próprio:

1. Apontar DNS do domínio para seu servidor
2. Atualizar `DJANGO_ALLOWED_HOSTS` no .env
3. Atualizar `server_name` em `nginx/default.conf`
4. Configurar SSL: `./docker-manage.sh ssl meudominio.com.br`

## 📊 Monitoramento

### Logs

```bash
# Logs em tempo real
./docker-manage.sh logs web
./docker-manage.sh logs nginx
./docker-manage.sh logs db

# Logs do sistema
docker-compose logs -f
```

### Recursos

```bash
# Ver uso de CPU/Memória
./docker-manage.sh status

# Estatísticas detalhadas
docker stats

# Espaço em disco
docker system df
```

### Health Checks

Os containers têm health checks configurados:

```bash
# Ver status de saúde
docker-compose ps

# Testar manualmente
curl http://localhost/health/
```

## 🔒 Segurança

### Configurações de Produção

1. **Sempre** usar `DJANGO_DEBUG=False`
2. Definir `DJANGO_SECRET_KEY` única e segura
3. Usar senhas fortes para banco de dados
4. Configurar HTTPS com certificados válidos
5. Limitar `DJANGO_ALLOWED_HOSTS`
6. Configurar firewall adequadamente

### Firewall

```bash
# UFW básico
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Backup

Os backups são executados automaticamente diariamente às 3h da manhã e mantidos por 30 dias.

Localização: `./backups/`

## 🐛 Troubleshooting

### Container não inicia

```bash
# Ver logs de erro
docker-compose logs [serviço]

# Verificar configuração
docker-compose config

# Restart forçado
docker-compose down
docker-compose up -d
```

### Erro de Conexão com Banco

```bash
# Verificar se PostgreSQL está rodando
docker-compose ps db

# Testar conexão
docker-compose exec web python manage.py dbshell
```

### Erro 502 Bad Gateway

```bash
# Verificar se aplicação está rodando
docker-compose ps web

# Ver logs do Nginx
./docker-manage.sh logs nginx

# Restart do Nginx
docker-compose restart nginx
```

### Problemas de Permissão

```bash
# Corrigir permissões dos volumes
sudo chown -R $USER:$USER ./media ./logs ./backups
```

### Limpar Cache

```bash
# Limpar cache Redis
docker-compose exec redis redis-cli FLUSHALL

# Restart da aplicação
docker-compose restart web celery
```

## 🔄 Updates e Migrations

### Atualizar Aplicação

```bash
# Método automático
./docker-manage.sh update

# Método manual
git pull origin main
docker-compose down
docker-compose build --no-cache web
docker-compose up -d
./docker-manage.sh migrate
./docker-manage.sh collectstatic
```

### Migrations

```bash
# Executar migrations
./docker-manage.sh migrate

# Criar migrations (desenvolvimento)
docker-compose exec web python manage.py makemigrations

# Ver status das migrations
docker-compose exec web python manage.py showmigrations
```

## 📱 URLs da Aplicação

- **Frontend**: http://localhost
- **API**: http://localhost/api/
- **Admin**: http://localhost/admin/
- **Health**: http://localhost/health/

## 💡 Dicas

1. **Desenvolvimento**: Use `docker-compose.override.yml` para configurações locais
2. **Logs**: Use `./docker-manage.sh logs` em vez de `docker-compose logs`
3. **Backup**: Configure backup externo para dados críticos
4. **Monitoramento**: Considere usar Grafana + Prometheus para monitoramento avançado
5. **Segurança**: Atualize regularmente as imagens base e dependências