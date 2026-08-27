# ThatFridge

## Stack

pnpm + turborepo monorepo:

- `backend/` — Laravel API (npm/composer, not in the pnpm workspace)
- `apps/web/` — Next.js app (still npm-managed; frozen during the iOS sprint — see `APP_STORE_LAUNCH_PLAN.md`)
- `apps/mobile/` — Expo / React Native app (iOS-first)
- `packages/core/` — shared logic (API client, types, domain rules)
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

   In a second terminal, run the scheduler so expiry/low-stock notifications actually get
   generated (`app:check-item-freshness` is registered in `routes/console.php` but nothing
   fires it otherwise — there's no cron/supervisor process in this repo's Docker setup):

   ```bash
   php artisan schedule:work
   ```

   To populate notifications immediately instead of waiting for the schedule, run
   `php artisan app:check-item-freshness` directly at any time.

   `--seed` creates 4 test accounts (all password `password123`) so you can log in without registering your own:

   | Email                 | Password    |
   | --------------------- | ----------- |
   | keira@thatfridge.test | password123 |
   | hazim@thatfridge.test | password123 |
   | joey@thatfridge.test  | password123 |
   | kemed@thatfridge.test | password123 |

   Already migrated without `--seed`? Run `php artisan db:seed` on its own — safe to run anytime, it only adds these 4 users.
3. Web app:

   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

   The web app talks to the backend via `NEXT_PUBLIC_API_URL`, set in `apps/web/.env.local` (defaults to `http://127.0.0.1:8000/api` if unset).

4. Mobile app:

   ```bash
   pnpm install          # from the repo root
   pnpm mobile           # or: cd apps/mobile && pnpm start
   ```

   The mobile app talks to the backend via `EXPO_PUBLIC_API_URL`, set in `apps/mobile/.env` (defaults to `http://127.0.0.1:8000/api` if unset). On a physical device, point it at your machine's LAN IP, not `127.0.0.1`.

## Trying login against the API directly

Before wiring up a frontend, you can confirm the backend works with `curl` (backend must be running via `php artisan serve`, defaults to `http://127.0.0.1:8000`):

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
cd apps/web && npm test
cd apps/mobile && pnpm test
```

A tracked pre-push hook runs these suites automatically before every `git push`, so a
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
