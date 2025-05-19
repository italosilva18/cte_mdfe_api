# API Reference

This document summarizes the main API endpoints used by the front‑end panels. For authentication details see the README.

## Manutenção

### Painel de Manutenção

| Endpoint | Método | Parâmetros | Exemplo de Resposta |
|----------|--------|-------------|--------------------|
| `/api/manutencao/painel/indicadores/` | GET | `data_inicio`, `data_fim` (opcionais) | `{ "total_manutencoes": 5, "total_pecas": 1000.0, "total_mao_obra": 500.0, "valor_total": 1500.0, "filtros": {"data_inicio": "2023-01-01", "data_fim": "2023-12-31"} }` |
| `/api/manutencao/painel/graficos/` | GET | `data_inicio`, `data_fim` (opcionais) | `{ "por_status": [...], "por_veiculo": [...], "por_periodo": [...], "filtros": {"data_inicio": "2023-01-01", "data_fim": "2023-12-31"} }` |
| `/api/manutencao/painel/ultimos/` | GET | `limit` (opcional, padrão 10) | Lista de manutenções serializadas |
| `/api/manutencao/painel/tendencias/` | GET | `meses` (opcional, padrão 12) | `{ "tendencia_valor": { ... }, "frequencia_por_veiculo": [...] }` |

### CRUD de Manutenções

| Endpoint | Método | Parâmetros | Descrição |
|----------|--------|-------------|-----------|
| `/api/manutencoes/` | GET | `veiculo`, `placa`, `status`, `data_inicio`, `data_fim`, `q` | Lista manutenções com filtros opcionais |
| `/api/manutencoes/` | POST | JSON do cadastro | Cria uma manutenção |
| `/api/manutencoes/{id}/` | PATCH | JSON com campos a atualizar | Edita manutenção existente |
| `/api/veiculos/{veiculo_pk}/manutencoes/` | GET/POST | Mesmo que acima, filtrado pelo veículo | Rotas aninhadas por veículo |

## Alertas

| Endpoint | Método | Parâmetros | Exemplo de Resposta |
|----------|--------|-------------|--------------------|
| `/api/alertas/pagamentos/` | GET | `dias` (opcional, padrão 7) | `{ "agregados_pendentes": [...], "proprios_pendentes": [...], "dias_alerta": 7 }` |
| `/api/alertas/sistema/` | GET | - | Lista de alertas do sistema |
| `/api/alertas/sistema/{id}/` | DELETE | - | Remove o alerta indicado |
| `/api/alertas/sistema/limpar_todos/` | POST | - | Remove todos os alertas |

## Relatórios

| Endpoint | Método | Parâmetros | Descrição |
|----------|--------|-------------|-----------|
| `/api/relatorios/` | GET | `tipo` (obrigatório), `formato` (opcional, padrão csv), `filtros` (JSON URL encoded) | Gera relatórios em CSV ou JSON |

## Configurações

| Endpoint | Método | Parâmetros | Exemplo de Resposta |
|----------|--------|-------------|--------------------|
| `/api/configuracoes/parametros/` | GET | `grupo`, `editavel` (opcionais) | Lista de parâmetros |
| `/api/configuracoes/parametros/valores/` | GET | `grupo` (opcional) | `{ "NOME_PARAM": "valor" }` |
| `/api/configuracoes/parametros/atualizar-multiplos/` | POST | `{ "parametros": { "NOME": "valor", ... } }` | Atualiza parâmetros em lote |
| `/api/configuracoes/empresa/` | GET/POST | - | Obtém ou atualiza dados da empresa |
| `/api/backup/` | GET | - | Lista backups |
| `/api/backup/gerar/` | POST | - | Gera um novo backup |
| `/api/backup/{id}/download/` | GET | - | Baixa o backup |
| `/api/backup/restaurar/` | POST | `arquivo_backup` (arquivo) | Restaura a partir de um backup |


