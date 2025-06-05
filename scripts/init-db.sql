-- Script de inicialização do banco PostgreSQL
-- Executado automaticamente na criação do container

-- Criar extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Configurar timezone
SET timezone = 'America/Sao_Paulo';

-- Criar índices úteis (serão aplicados após as migrações)
-- As migrações do Django criarão as tabelas, então não precisamos defini-las aqui