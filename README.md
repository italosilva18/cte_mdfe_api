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
3. Copy `.env.example` to `.env` and load the environment variables:
   ```bash
   cp .env.example .env
   export $(grep -v '^#' .env | xargs)
   ```
   These variables must be exported before running any `manage.py` commands.
4. Apply database migrations:
   ```bash
   python manage.py migrate
   ```
5. Run the development server:
   ```bash
   python manage.py runserver
   ```
   The application uses SQLite by default (configured in `core/settings.py`).

## Database Initialization and Sample Data

After applying migrations you can load optional sample data to quickly populate
the application with example records:

```bash
python manage.py loaddata sample_data.json
```

You can generate your own fixture with `python manage.py dumpdata > sample_data.json`
once you have real data in the database.

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
See [docs/api_reference.md](docs/api_reference.md) for panel endpoint details.

Authentication is handled via JWT tokens obtained from `/api/token/` and `/api/token/refresh/`.

**Note:** Before registering a maintenance entry in `/api/manutencoes/` (or the nested `/api/veiculos/<veiculo_pk>/manutencoes/` route), you must first create the corresponding vehicle via `/api/veiculos/`.

## Environment Variables

For a production deployment the application expects certain variables to be present in the environment:

- `DJANGO_SECRET_KEY` – Secret key for cryptographic signing.
- `DJANGO_DEBUG` – Set to `true` or `false`. Use `false` in production.
- `DJANGO_ALLOWED_HOSTS` – Comma separated list of hosts that can serve the app.

A `.env.example` file with these variables is included in the repository. Copy it
to `.env` and update the values for your environment.

## Running Tests

To run the automated tests use:

```bash
python manage.py test
```

If you have `pytest` installed, you can also run:

```bash
pytest
```
