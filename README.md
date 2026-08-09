# ThatFridge

## Stack
- `backend/` — Laravel API
- `frontend/` — Next.js app
- Postgres + Redis via Docker Compose

## Setup

1. Clone repo, start infra:
   ```bash
   docker-compose up -d
   ```

2. Backend:
   ```bash
   cd backend
   cp .env.example .env
   composer install
   php artisan key:generate
   ```
   Edit `.env`, replace existing `DB_CONNECTION` line and set DB to match `docker-compose.yml`:
   ```
   DB_CONNECTION=pgsql
   DB_HOST=127.0.0.1
   DB_PORT=5433
   DB_DATABASE=thatfridge
   DB_USERNAME=devuser
   DB_PASSWORD=devpassword
   ```
   Note: container maps to host port `5433` (not default `5432`) to avoid clashing with a locally installed Postgres.

   Then:
   ```bash
   php artisan migrate --seed
   php artisan serve
   ```
   `--seed` creates 4 test accounts (all password `password123`) so you can log in without registering your own:

   | Email | Password |
   |---|---|
   | keira@thatfridge.test | password123 |
   | hazim@thatfridge.test | password123 |
   | joey@thatfridge.test | password123 |
   | kemed@thatfridge.test | password123 |

   Already migrated without `--seed`? Run `php artisan db:seed` on its own — safe to run anytime, it only adds these 4 users.

3. Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The frontend talks to the backend via `NEXT_PUBLIC_API_URL`, set in `frontend/.env.local` (defaults to `http://127.0.0.1:8000/api` if unset).

## Trying login against the API directly

Before wiring up the frontend, you can confirm the backend works with `curl` (backend must be running via `php artisan serve`, defaults to `http://127.0.0.1:8000`):

```bash
curl -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"email":"keira@thatfridge.test","password":"password123"}'
```

Should return a `user` object and a `token`. Use that token on any authenticated endpoint (`/api/me`, `/api/fridges`, etc.):

```bash
curl http://127.0.0.1:8000/api/me \
  -H "Accept: application/json" -H "Authorization: Bearer <token from above>"
```

## Testing

```bash
cd backend && php artisan test
cd frontend && npm test
```

A tracked pre-push hook runs both suites automatically before every `git push`, so a
regression gets caught locally instead of landing on `main` unnoticed. One-time setup
per machine:

```bash
git config core.hooksPath .githooks
```

Skip it for one push with `git push --no-verify`.

## Requirements
- PHP 8.2+, Composer
- Node 18+
- Docker
