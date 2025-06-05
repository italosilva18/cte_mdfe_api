#!/bin/bash
# Script de gerenciamento Docker para CT-e/MDF-e API

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções utilitárias
log_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Verificar se Docker está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker não está instalado!"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose não está instalado!"
        exit 1
    fi
}

# Verificar se arquivo .env existe
check_env() {
    if [ ! -f ".env" ]; then
        log_warning "Arquivo .env não encontrado. Criando a partir do .env.docker.example..."
        cp .env.docker.example .env
        log_warning "IMPORTANTE: Edite o arquivo .env com suas configurações antes de continuar!"
        read -p "Pressione ENTER após editar o arquivo .env..."
    fi
}

# Comandos disponíveis
case "$1" in
    "start")
        log_info "Iniciando aplicação CT-e/MDF-e..."
        check_docker
        check_env
        docker-compose up -d
        log_success "Aplicação iniciada! Acesse: http://localhost"
        ;;
        
    "simple")
        log_info "Iniciando aplicação CT-e/MDF-e (versão simples)..."
        check_docker
        check_env
        docker-compose -f docker-compose.simple.yml up -d
        log_success "Aplicação iniciada! Acesse: http://localhost"
        ;;
        
    "minimal")
        log_info "Iniciando aplicação CT-e/MDF-e (versão mínima - só Django + PostgreSQL)..."
        check_docker
        docker-compose -f docker-compose.minimal.yml up -d
        log_success "Aplicação iniciada! Acesse: http://localhost:8000"
        ;;
        
    "debug")
        log_info "Iniciando aplicação em modo debug..."
        check_docker
        docker-compose -f docker-compose.debug.yml up --build
        ;;
        
    "stop")
        log_info "Parando aplicação..."
        docker-compose down
        log_success "Aplicação parada!"
        ;;
        
    "restart")
        log_info "Reiniciando aplicação..."
        docker-compose restart
        log_success "Aplicação reiniciada!"
        ;;
        
    "build")
        log_info "Construindo imagens..."
        docker-compose build --no-cache
        log_success "Imagens construídas!"
        ;;
        
    "rebuild")
        log_info "Reconstruindo e reiniciando aplicação..."
        check_docker
        check_env
        docker-compose down
        docker-compose build --no-cache
        docker-compose up -d
        log_success "Aplicação reconstruída e iniciada!"
        ;;
        
    "logs")
        SERVICE=${2:-web}
        log_info "Exibindo logs do serviço: $SERVICE"
        docker-compose logs -f $SERVICE
        ;;
        
    "shell")
        log_info "Abrindo shell no container web..."
        docker-compose exec web python manage.py shell
        ;;
        
    "migrate")
        log_info "Executando migrações..."
        docker-compose exec web python manage.py migrate
        log_success "Migrações executadas!"
        ;;
        
    "collectstatic")
        log_info "Coletando arquivos estáticos..."
        docker-compose exec web python manage.py collectstatic --noinput
        log_success "Arquivos estáticos coletados!"
        ;;
        
    "createsuperuser")
        log_info "Criando superusuário..."
        docker-compose exec web python manage.py createsuperuser
        ;;
        
    "backup")
        log_info "Executando backup manual..."
        docker-compose exec backup /backup.sh
        log_success "Backup concluído! Verifique a pasta ./backups"
        ;;
        
    "restore")
        if [ -z "$2" ]; then
            log_error "Uso: $0 restore <arquivo_backup.sql.gz>"
            exit 1
        fi
        log_info "Restaurando backup: $2"
        zcat "./backups/$2" | docker-compose exec -T db psql -U ${POSTGRES_USER:-cte_mdfe_user} -d ${POSTGRES_DB:-cte_mdfe_db}
        log_success "Backup restaurado!"
        ;;
        
    "clean")
        log_warning "Isso irá remover todos os containers, volumes e imagens relacionados!"
        read -p "Tem certeza? (s/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Ss]$ ]]; then
            log_info "Limpando ambiente Docker..."
            docker-compose down -v --rmi all
            docker system prune -f
            log_success "Ambiente limpo!"
        else
            log_info "Operação cancelada."
        fi
        ;;
        
    "status")
        log_info "Status dos containers:"
        docker-compose ps
        echo ""
        log_info "Uso de recursos:"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
        ;;
        
    "update")
        log_info "Atualizando aplicação..."
        git pull origin main
        docker-compose down
        docker-compose build --no-cache web
        docker-compose up -d
        docker-compose exec web python manage.py migrate
        docker-compose exec web python manage.py collectstatic --noinput
        log_success "Aplicação atualizada!"
        ;;
        
    "ssl")
        DOMAIN=${2:-localhost}
        log_info "Configurando SSL para: $DOMAIN"
        log_warning "Certifique-se de que o domínio aponta para este servidor!"
        
        # Parar nginx temporariamente
        docker-compose stop nginx
        
        # Executar certbot
        docker run --rm -it \
            -v ./ssl:/etc/letsencrypt \
            -v ./ssl-challenge:/tmp/acme-challenge \
            -p 80:80 \
            certbot/certbot certonly \
            --standalone \
            --email admin@$DOMAIN \
            --agree-tos \
            --no-eff-email \
            -d $DOMAIN
            
        # Reiniciar nginx
        docker-compose start nginx
        log_success "SSL configurado! Atualize a configuração do Nginx para usar HTTPS."
        ;;
        
    *)
        echo "Script de gerenciamento Docker - CT-e/MDF-e API"
        echo ""
        echo "Uso: $0 [comando]"
        echo ""
        echo "Comandos disponíveis:"
        echo "  start           - Iniciar aplicação"
        echo "  stop            - Parar aplicação"
        echo "  restart         - Reiniciar aplicação"
        echo "  build           - Construir imagens"
        echo "  rebuild         - Reconstruir e reiniciar"
        echo "  logs [serviço]  - Ver logs (padrão: web)"
        echo "  shell           - Abrir shell Django"
        echo "  migrate         - Executar migrações"
        echo "  collectstatic   - Coletar arquivos estáticos"
        echo "  createsuperuser - Criar superusuário"
        echo "  backup          - Fazer backup manual"
        echo "  restore <file>  - Restaurar backup"
        echo "  clean           - Limpar ambiente Docker"
        echo "  status          - Ver status e recursos"
        echo "  update          - Atualizar aplicação (git pull + rebuild)"
        echo "  ssl <domain>    - Configurar SSL com Let's Encrypt"
        echo ""
        echo "Exemplos:"
        echo "  $0 start"
        echo "  $0 logs nginx"
        echo "  $0 restore cte_mdfe_backup_20231205_120000.sql.gz"
        echo "  $0 ssl meudominio.com.br"
        ;;
esac