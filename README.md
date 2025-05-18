# CT-e / MDF-e Transport API

This project is a Django REST API for managing CT-e and MDF-e documents, vehicles, payments and maintenance.

## Prerequisites

- Python 3.11+
- `pip`

## Setup

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate      # On Windows use `venv\Scripts\activate`
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
4. Run the development server:
   ```bash
   python manage.py runserver
   ```
   The application uses SQLite by default (configured in `core/settings.py`).

## API Endpoints

The main API routes are available under `/api/`.

- `/api/ctes/` – CT-e documents
- `/api/mdfes/` – MDF-e documents
- `/api/veiculos/` – vehicle registry
- `/api/manutencoes/` – maintenance records
- `/api/veiculos/<veiculo_pk>/manutencoes/` – maintenance filtered by vehicle
- `/api/upload/` – file uploads
- `/api/pagamentos/agregados/` and `/api/pagamentos/proprios/` – payment endpoints
- `/api/faixas-km/` – mileage ranges
- `/api/manutencao/painel/` – maintenance dashboard
- `/api/dashboard/` and other `/api/painel/...` endpoints – operational dashboards
- `/api/configuracoes/empresa/` and `/api/configuracoes/parametros/` – configuration
- `/api/backup/` – backups
- `/api/relatorios/` – reports
- `/api/alertas/...` – alert management
- `/api/usuarios/` – user operations (`/api/users/me/` for current user)
- Swagger and ReDoc documentation at `/api/swagger/` and `/api/redoc/`

Authentication is handled via JWT tokens obtained from `/api/token/` and `/api/token/refresh/`.

**Note:** Before registering a maintenance entry in `/api/manutencoes/` (or the nested `/api/veiculos/<veiculo_pk>/manutencoes/` route), you must first create the corresponding vehicle via `/api/veiculos/`.
