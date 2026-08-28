# Setup & Troubleshooting

Get ThatFridge running locally, plus every wall we've actually hit and the fix that worked.

_Last updated: 2026-08-28._

---

# Part 1 — Setup

## What you need

| Tool | Version | Notes |
|---|---|---|
| **Node** | 20–22 | This repo's `engines` says ≥20. EAS CLI officially supports ≤22 — if you're on 24/25, `nvm install 22 && nvm use 22` for anything EAS. |
| **pnpm** | 10.x | `corepack enable` then `corepack prepare pnpm@10.32.1 --activate`, or `npm i -g pnpm`. |
| **PHP** | 8.2+ | + Composer. |
| **Docker Desktop** | any | For Postgres + Redis. (Or bring your own Postgres 15/16 — see the Docker note.) |
| **Xcode** | latest | macOS only, for the iOS Simulator. Not needed for Expo Go. |

Backend and mobile talk over your LAN, so **your phone/simulator and your Mac must be on the
same Wi-Fi**.

## 1. Clone + install

```bash
git clone <repo> ThatFridge && cd ThatFridge
pnpm install                     # installs apps/mobile + packages/core (backend/web are separate)
git config core.hooksPath .githooks   # one-time: run test suites before every push
```

## 2. Backend (Laravel API)

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
```

Start the database (Docker):

```bash
cd ..                            # repo root
docker compose up -d             # postgres:16 on host port 5433, redis on 6379
```

Check `backend/.env` matches `docker-compose.yml`:

```
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5433                      # container maps 5433→5432 to dodge a local Postgres
DB_DATABASE=thatfridge
DB_USERNAME=devuser
DB_PASSWORD=devpassword
```

Migrate + seed, then serve **on all interfaces** so the LAN can reach it:

```bash
cd backend
php artisan migrate --seed
php artisan serve --host 0.0.0.0 --port 8000
```

In a **second terminal**, run the scheduler so expiry / low-stock notifications get generated
(nothing else fires `app:check-item-freshness`):

```bash
cd backend && php artisan schedule:work
# or, to populate notifications right now:
php artisan app:check-item-freshness
```

**Demo accounts** (`--seed` creates 4, all password `password123`):

| Email | Has a demo fridge? |
|---|---|
| `keira@thatfridge.test` | ✅ (seed script runs for keira by default) |
| `hazim@thatfridge.test` | ⬜ |
| `joey@thatfridge.test` | ⬜ |
| `kemed@thatfridge.test` | ⬜ |

Seed a fridge with varied freshness for any account:

```bash
EMAIL=joey@thatfridge.test PASS=password123 sh backend/scripts/seed-demo-fridge.sh
```

**Sanity check** — before touching a frontend:

```bash
curl -X POST http://127.0.0.1:8000/api/login \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d '{"email":"keira@thatfridge.test","password":"password123"}'
# → { "user": {...}, "token": "..." }
```

## 3. Mobile app (Expo / React Native — the product)

```bash
cd apps/mobile
cp .env.example .env
```

Edit `apps/mobile/.env`:

```
# Simulator: 127.0.0.1 is fine. Physical device: your Mac's LAN IP (`ipconfig getifaddr en0`).
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api
# Publishable RevenueCat key — ask the account owner for the current test-store key.
EXPO_PUBLIC_RC_IOS_KEY=test_...
```

Then, easiest first:

```bash
pnpm mobile                      # from repo root — `expo start`, then press i / a / w or scan the QR
```

- **Expo Go** works for most of the app. `expo-camera` (barcode scan), `expo-notifications`,
  and `react-native-purchases` (paywall) **do not** — those need a dev build.
- **iOS Simulator without a paid Apple account:** the `eas.json` `development` profile is a
  `ios.simulator: true` build.

  ```bash
  cd apps/mobile
  pnpm exec eas login                                   # first time; needs access to the `avocacode` org
  pnpm exec eas build --profile development --platform ios
  pnpm exec eas build:run -p ios                        # installs the finished build to a booted simulator
  pnpm exec expo start --dev-client                     # serve JS to it
  ```

## 4. Legacy web app (`apps/web`) — optional, frozen

Only needed to compare against the design; it's frozen during the iOS sprint.

```bash
cd apps/web
npm install
npm run dev                      # NEXT_PUBLIC_API_URL in apps/web/.env.local, defaults to :8000/api
```

## Tests

```bash
cd backend    && php artisan test
cd apps/mobile && pnpm exec tsc --noEmit -p tsconfig.json    # typecheck (no test suite yet)
pnpm --filter @thatfridge/core typecheck
cd apps/web   && npm test
```

The pre-push hook runs these; skip once with `git push --no-verify`.

---

# Part 2 — Troubleshooting

Problems we've actually hit, and the fix that worked. Newest entries at the top of each
section. When you hit and solve something new, add it here.

---

## Local backend / infra

### Login shows `SQLSTATE[08006] ... connection to server at "127.0.0.1", port 5433 failed`

The Laravel API is up but can't reach Postgres — the **Docker container is down**, usually
because Docker Desktop quit (reboot, or after a disk-full episode).

```bash
pkill -9 -f Docker && open -a Docker     # wait ~10s for "Engine running"
docker compose up -d                      # from repo root
cd backend && php artisan serve --host 0.0.0.0
# verify:
curl -X POST http://127.0.0.1:8000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"kemed@thatfridge.test","password":"password123"}'
```

If `docker` commands **hang** (no output, timeout): Docker Desktop's daemon is wedged —
force-kill it and reopen, don't wait on the stuck CLI.

> The app renders the raw SQL error only because `APP_DEBUG=true` locally. Production returns a
> generic 500.

### Phone can't reach the API / requests hang

Two causes, usually together:

1. `apps/mobile/.env` points at `127.0.0.1` — on a device that's the phone itself. Set it to
   your Mac's LAN IP: `ipconfig getifaddr en0` → `EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api`,
   then restart Expo with `--clear` (the value is inlined at bundle time).
2. `php artisan serve` **binds `127.0.0.1` only** by default. Always start it with
   `php artisan serve --host 0.0.0.0` so the LAN can reach it.

Phone and Mac must be on the same Wi-Fi.

### `php artisan migrate --seed` fails with a unique-constraint violation

The DB was already seeded (the Postgres container has a persistent volume). Harmless — the
schema migrated fine, the seeder just re-ran. Use `php artisan db:seed` alone if you only want
the 4 test users, or the demo-fridge script below.

### No fridge data on a seed account

Only `keira@` and `hazim@` (and now `kemed@`) get demo fridges. Seed any account:

```bash
EMAIL=joey@thatfridge.test sh backend/scripts/seed-demo-fridge.sh
```

Freshness bars need **both** `expiry_date` and `shelf_life_days` on an item (see
`ItemResource.php`) — the script sends both.

### Notification feed is empty

Events are generated by a scheduled command, not on the fly. Run it once:

```bash
cd backend && php artisan app:check-item-freshness
```

---

## Mobile app / Expo

### `Project is incompatible with this version of Expo Go`

The project is on SDK 57; the store's Expo Go is behind. Options, easiest first:

1. Update Expo Go from the App Store.
2. iOS Simulator: press `i` in the `expo start` terminal (needs full Xcode).
3. **Development build** (the real answer — see EAS section). `expo-camera`,
   `expo-notifications`, and `react-native-purchases` don't work in Expo Go regardless.

### `Unable to resolve module @expo/metro-runtime` (or other transitive deps)

pnpm's nested `node_modules` layout breaks Metro's resolver. Fixed by the root
`.npmrc` → `node-linker=hoisted`. If it recurs after a dependency change:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### Barcode scan / local notifications / paywall do nothing in Expo Go

Expected. All three are native modules. In Expo Go:
- `scan.tsx` shows a "needs a development build" screen
- local notifications silently no-op
- the paywall shows "not available in Expo Go"

Make a dev build (EAS section).

### Metro serving stale code / weird bundle errors after a big change

```bash
cd apps/mobile && pnpm exec expo start --clear
```

Restructures (moving screens into route groups, changing `app.config.ts`) always want `--clear`.

### `command not found: timeout` in scripts

macOS has no `timeout`. Use `gtimeout` (`brew install coreutils`) or a background job +
`sleep` + check.

---

## EAS (builds & updates)

### `npx eas ...` → `npm error could not determine executable to run`

The package is `eas-cli`, not `eas`. It's a pinned dev dependency now:

```bash
cd apps/mobile && pnpm exec eas <command>
```

### `eas init` → `Cannot automatically write to dynamic config at: app.config.ts`

Expected — we use `app.config.ts` (dynamic), which `eas init` can't edit. The project id +
owner are already written in there manually:

```ts
owner: "avocacode",
extra: { eas: { projectId: "9d32771d-73bf-4ee1-9a24-fbd96b2a3ddc" } },
```

If EAS ever recreates the project with a new id, update those two lines (and the `updates.url`).

### `eas build` → `Installed expo-updates ... Command must be re-run`

Not an error. `eas build` saw the `updates` block in `app.config.ts` and installed
`expo-updates`. Commit the `package.json` change and run the same build command again.

### `eas build` "unable to install" during the dependency phase

Suspect: pnpm monorepo detection, or Node version. Checks:
- EAS should archive from the repo root (it detects `pnpm-workspace.yaml`). Confirm
  `packages/core` is reachable — `pnpm-workspace.yaml` lists `apps/mobile` + `packages/*`.
- Pin Node in `eas.json` under the profile if the build image's Node disagrees:
  `"node": "22.16.0"`.
- Local machine is on **Node 25**; EAS CLI officially supports ≤22. If a local `eas` command
  misbehaves: `nvm install 22 && nvm use 22`.

### `development` profile builds

`eas.json`'s `development` profile has `ios.simulator: true` → an **unsigned simulator build**,
no Apple account needed. Install it with:

```bash
pnpm exec eas build:run -p ios      # picks the latest, installs to a booted simulator
pnpm exec expo start --dev-client
```

---

## Disk space (macOS, this machine)

`ENOSPC` / `No space left on device` during `pnpm install`, `eas build`, or Metro bundling.
The startup disk runs near 100%.

```bash
df -h /System/Volumes/Data                       # check
rm -rf ~/Library/Developer/Xcode/DerivedData/*
xcrun simctl delete unavailable                   # dead simulators
pnpm store prune
rm -rf ~/Library/Developer/CoreSimulator/Caches/*
```

`~/Library/Developer/CoreSimulator` alone was ~3.5 GB. Keep a few GB free before any build.
Do **not** run `pnpm install --force` when low on disk — it re-downloads everything.

---

## RevenueCat

### Paywall / purchases don't work

Needs, in order: (1) a dev build (not Expo Go); (2) `EXPO_PUBLIC_RC_IOS_KEY` in
`apps/mobile/.env`; (3) an **offering with packages** configured in the RevenueCat dashboard;
(4) a published **Paywall** design on that offering (otherwise the custom fallback list shows).
Entitlement id is `thatfridge_pro`. See `TO_DO.md` §3 for the full dashboard checklist.

### `new NativeEventEmitter() requires a non-null argument`

You hot-reloaded after installing `react-native-purchases`. Stop Metro, rebuild the dev
client, restart.

---

## How to keep this file current

When you hit an error that costs more than ~10 minutes, add an entry: the **exact symptom**
(error text or observed behaviour), the **cause**, and the **commands that fixed it**. Bump the
date at the top. Keep entries short.
