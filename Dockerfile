# Dockerfile para aplicação Django CT-e/MDF-e
FROM python:3.11-slim

# Definir variáveis de ambiente
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV APP_HOME=/app
ENV IS_DOCKER=true

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    # PostgreSQL client
    libpq-dev \
    postgresql-client \
    # Compiladores para algumas libs Python
    gcc \
    python3-dev \
    # Utilitários
    curl \
    netcat-traditional \
    # Limpeza
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR $APP_HOME

# Copiar requirements e instalar dependências Python
COPY requirements-prod.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements-prod.txt

# Copiar script de entrada primeiro
COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

# Copiar o código da aplicação
COPY . .

# Criar diretórios necessários
RUN mkdir -p /app/static /app/media /app/logs

# Verificar se manage.py existe
RUN ls -la manage.py

# Expor porta
EXPOSE 8000

# Usuário não-root para segurança
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser $APP_HOME
USER appuser

# Comando padrão
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "core.wsgi:application"]