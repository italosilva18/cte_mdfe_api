#!/bin/bash
set -e

echo "Iniciando aplicação CT-e/MDF-e..."

# Aguardar PostgreSQL estar pronto
if [ "$DATABASE_HOST" ]; then
    echo "Aguardando PostgreSQL..."
    while ! nc -z $DATABASE_HOST $DATABASE_PORT; do
        sleep 1
    done
    echo "PostgreSQL está pronto!"
fi

# Coletar arquivos estáticos
echo "Coletando arquivos estáticos..."
python manage.py collectstatic --noinput

# Executar migrações
echo "Executando migrações..."
python manage.py migrate --noinput

# Criar superusuário se definido
if [ "$DJANGO_SUPERUSER_USERNAME" ]; then
    echo "Criando superusuário..."
    python manage.py createsuperuser \
        --noinput \
        --username $DJANGO_SUPERUSER_USERNAME \
        --email $DJANGO_SUPERUSER_EMAIL || true
fi

# Executar comando
echo "Iniciando servidor..."
exec "$@"