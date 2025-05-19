# Panel API Reference

This document summarizes the API endpoints consumed by the dashboard panels.

## Dashboard

**URL:** `/api/dashboard/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `periodo` | No | `mes`, `trimestre` or `ano` |
| `data_inicio` | No | start date `YYYY-MM-DD` |
| `data_fim` | No | end date `YYYY-MM-DD` |

**Example Response:**

```json
{
  "filtros": {"periodo": "mes", "data_inicio": "2024-01-01", "data_fim": "2024-01-31"},
  "cards": {"total_ctes": 120, "total_mdfes": 45, "valor_total_fretes": 53200.50},
  "grafico_cif_fob": [ {"data": "01/01/2024", "cif": 1200.0, "fob": 800.0 } ],
  "grafico_metas": [ {"label": "Período", "valor": 2000.0, "meta": 2200.0, "crescimento": 5.0} ],
  "ultimos_lancamentos": {"ctes": [], "mdfes": []}
}
```

## Financeiro Panel

**URL:** `/api/painel/financeiro/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `periodo` | No | `mes`, `trimestre` or `ano` |
| `data_inicio` | No | start date `YYYY-MM-DD` |
| `data_fim` | No | end date `YYYY-MM-DD` |

**Example Response:**

```json
{
  "filtros": {"periodo": "ano"},
  "cards": {"faturamento_total": 500000.0, "total_ctes": 320},
  "grafico_cif_fob": [ {"mes": "01/2024", "faturamento": 20000.0, "cif": 5000.0, "fob": 15000.0} ]
}
```

### Financeiro Mensal

**URL:** `/api/financeiro/mensal/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `mes` | No | month in `YYYY-MM` |
| `data_inicio` | No | start date `YYYY-MM-DD` |
| `data_fim` | No | end date `YYYY-MM-DD` |

**Example Response:**

```json
[
  {"mes": "2024-01", "faturamento": 20000.0, "cif": 5000.0, "fob": 15000.0, "entregas": 20}
]
```

### Financeiro Detalhe

**URL:** `/api/financeiro/detalhe/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `group` | Yes | `cliente`, `veiculo`, `origem` or `destino` |
| `data_inicio` | Yes | start date `YYYY-MM-DD` |
| `data_fim` | Yes | end date `YYYY-MM-DD` |

**Example Response:**

```json
[
  {"id": "12345678901234", "label": "Cliente A", "faturamento_total": 10000.0, "qtd_ctes": 5, "valor_medio": 2000.0}
]
```

## CT-e Panel

**URL:** `/api/painel/cte/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `data_inicio` | No | start date `YYYY-MM-DD` |
| `data_fim` | No | end date `YYYY-MM-DD` |

**Example Response:**

```json
{
  "filtros": {"data_inicio": "2024-01-01", "data_fim": "2024-01-31"},
  "cards": {"total_ctes": 80, "valor_total": 15000.0},
  "grafico_cliente": [],
  "grafico_distribuidor": [],
  "tabela_cliente": []
}
```

## MDF-e Panel

**URL:** `/api/painel/mdfe/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `data_inicio` | No | start date `YYYY-MM-DD` |
| `data_fim` | No | end date `YYYY-MM-DD` |

**Example Response:**

```json
{
  "filtros": {"data_inicio": "2024-01-01", "data_fim": "2024-01-31"},
  "cards": {"total_mdfes": 20, "total_autorizados": 18},
  "grafico_cte_mdfe": [],
  "top_veiculos": [],
  "tabela_mdfe_veiculo": [],
  "eficiencia": 92.5
}
```

## Geográfico Panel

**URL:** `/api/painel/geografico/`

**Method:** `GET`

**Query Parameters:**

| Name | Required | Description |
|------|----------|-------------|
| `data_inicio` | No | start date `YYYY-MM-DD` |
| `data_fim` | No | end date `YYYY-MM-DD` |

**Example Response:**

```json
{
  "filtros": {"data_inicio": "2024-01-01", "data_fim": "2024-01-31"},
  "top_origens": [],
  "top_destinos": [],
  "rotas_frequentes": [],
  "rotas": []
}
```

## Manutenção Panel

Endpoints are provided by `ManutencaoPainelViewSet`:

### Indicadores

**URL:** `/api/manutencao/painel/indicadores/`

**Method:** `GET`

**Query Parameters:** `data_inicio` (optional), `data_fim` (optional)

**Example Response:**

```json
{
  "total_manutencoes": 5,
  "total_pecas": 300.0,
  "total_mao_obra": 150.0,
  "valor_total": 450.0,
  "filtros": {"data_inicio": null, "data_fim": null}
}
```

### Gráficos

**URL:** `/api/manutencao/painel/graficos/`

**Method:** `GET`

**Query Parameters:** `data_inicio` (optional), `data_fim` (optional)

**Example Response:**

```json
{
  "por_status": [],
  "por_veiculo": [],
  "por_periodo": [],
  "filtros": {"data_inicio": null, "data_fim": null}
}
```

### Últimos

**URL:** `/api/manutencao/painel/ultimos/`

**Method:** `GET`

**Query Parameters:** `limit` (optional, default 10)

**Example Response:**

```json
[
  {"id": 1, "veiculo": 3, "veiculo_placa": "AAA1234", "servico_realizado": "Troca de óleo"}
]
```

### Tendências

**URL:** `/api/manutencao/painel/tendencias/`

**Method:** `GET`

**Query Parameters:** `meses` (optional, default 12)

**Example Response:**

```json
{
  "tendencia_valor": {"valor_atual": 500.0, "valor_anterior": 400.0, "variacao_percentual": 25.0, "periodo_meses": 12},
  "frequencia_por_veiculo": []
}
```

## Alertas

### Pagamentos

**URL:** `/api/alertas/pagamentos/`

**Method:** `GET`

**Query Parameters:** `dias` (optional, default 7)

**Example Response:**

```json
{
  "agregados_pendentes": [],
  "proprios_pendentes": [],
  "dias_alerta": 7
}
```

### Alertas do Sistema

- **Listar:** `GET /api/alertas/sistema/`
- **Apagar um:** `DELETE /api/alertas/sistema/<id>/`
- **Limpar todos:** `POST /api/alertas/sistema/limpar_todos/`

**Example Response for list:**

```json
[
  {"id": 1, "mensagem": "Exemplo", "tipo": "INFO"}
]
```

---

These endpoints provide the data used by the front-end panels. For other resources such as CT-es or MDF-es, consult the swagger docs at `/api/swagger/`.

