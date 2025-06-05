#!/bin/bash
# Script de backup automático para PostgreSQL no Docker

set -e

# Configurações
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="cte_mdfe_backup_${DATE}.sql"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}

# Criar diretório de backup se não existir
mkdir -p $BACKUP_DIR

echo "Iniciando backup do banco de dados..."

# Fazer backup
pg_dump -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE > "$BACKUP_DIR/$BACKUP_FILE"

# Comprimir backup
gzip "$BACKUP_DIR/$BACKUP_FILE"

echo "Backup criado: ${BACKUP_FILE}.gz"

# Limpar backups antigos
if [ "$RETENTION_DAYS" -gt 0 ]; then
    echo "Removendo backups com mais de $RETENTION_DAYS dias..."
    find $BACKUP_DIR -name "cte_mdfe_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
fi

echo "Backup concluído com sucesso!"