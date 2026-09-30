# ThatFridge

Know what's in your fridge, use it before it expires, and plan meals from it — with your
household. A mobile app (Expo / React Native, iOS-first) backed by a Laravel API.

Everything needed to run it locally is in this repo — source, assets, seed data and setup
instructions below. Licensed under the [MIT License](LICENSE).

## Stack

pnpm + turborepo monorepo:

- `backend/` — Laravel API (npm/composer, not in the pnpm workspace)
- `apps/web/` — Next.js app (still npm-managed; frozen during the iOS sprint — see `TO_DO.md`)
- `apps/mobile/` — Expo / React Native app (iOS-first)
- `packages/core/` — shared logic (API client, types, domain rules)
- Postgres + Redis via Docker Compose

## Getting started

**Full step-by-step onboarding — prerequisites, backend + mobile setup, demo logins, dev
build — is in [`SETUP_TROUBLESHOOTING.md`](SETUP_TROUBLESHOOTING.md)**, which also collects
every error we've hit and the fix.

The quick version below assumes you know the stack.

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

## Optional service keys

The app runs locally with none of these set — core features (fridges, items, crew, notes,
recipes, notifications) work against the seeded database. Each key only switches on the
feature next to it:

| Where                      | Key                                              | Enables                                   |
| -------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `backend/.env`             | `OPENROUTER_API_KEY`                             | AI Chef chat, recipe ideas, photo + receipt scans |
| `backend/.env`             | `FAL_KEY`                                        | AI-generated item/recipe icons            |
| `backend/.env`             | `RESEND_API_KEY`                                 | Real email (otherwise mail goes to the log) |
| `backend/.env`             | `REVENUECAT_WEBHOOK_SECRET`                      | Subscription webhooks                     |
| `apps/mobile/.env`         | `EXPO_PUBLIC_RC_IOS_KEY` / `_ANDROID_KEY`        | Paywall / in-app purchases                |
| `apps/mobile/.env`         | `EXPO_PUBLIC_GOOGLE_*`, `GOOGLE_IOS_URL_SCHEME`  | Google Sign-In (button hides when unset)  |

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

## Deploying

The production API deploy (VPS: Nginx + PHP 8.3 + Postgres + Redis + queue/scheduler + HTTPS on
`api.thatfridge.com`) has a step-by-step runbook: [`backend/DEPLOY.md`](backend/DEPLOY.md). The
public `thatfridge.com` pages (privacy / terms / support) live in [`apps/legal/`](apps/legal/).

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

- PHP 8.4+, Composer
- Node 20+, pnpm 10
- Docker

## License

ThatFridge's source code is released under the [MIT License](LICENSE).

Bundled third-party assets keep their own licences, which sit next to the files:

- **Inter Tight, Instrument Serif** (`apps/legal/assets/fonts/`) — SIL Open Font License 1.1
- **Lenis** (`apps/legal/assets/vendor/`) — MIT
- **PixelMix** by Andrew Tyler (`apps/mobile/assets/fonts/`, `apps/web/app/fonts/pixelmix/`) —
  *not* covered by the MIT License. Included unmodified for building and judging this project;
  see the licence files in those folders. Reuse it elsewhere only under its own terms
  (contact font@andrewtyler.net).
