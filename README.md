<p align="center">
  <img src="apps/mobile/assets/images/thatfridge/guardian.gif" width="96" alt="Guardian" />
  <img src="apps/mobile/assets/images/thatfridge/chef.gif" width="96" alt="Chef" />
  <img src="apps/mobile/assets/images/thatfridge/organizer.gif" width="96" alt="Organizer" />
  <img src="apps/mobile/assets/images/thatfridge/shopkeeper.gif" width="96" alt="Shopkeeper" />
</p>

<h1 align="center">ThatFridge</h1>

<p align="center">
  Know what's in your fridge, use it before it expires, and plan meals from it — with your household.
</p>

<p align="center">
  <a href="https://apps.apple.com/app/thatfridge/id6806239306">App Store</a> ·
  <a href="https://thatfridge.com">Website</a> ·
  <a href="LICENSE">MIT License</a>
</p>

ThatFridge is a shared household food app, built for RevenueCat Shipaton 2026. A crew of four
pixel-art AI agents keeps track of what you have, warns you before it goes off, suggests what to
cook and builds the shopping list, so the fridge stays up to date without anyone typing in 40
items by hand.

Everything needed to run it is in this repo: source, assets, seed data and the setup steps below.

## Try it

- **Fastest:** install it from the [App Store](https://apps.apple.com/app/thatfridge/id6806239306).
  Pro has a **7-day free trial**, so every premium feature can be unlocked from the paywall.
- **From source:** follow [Run it locally](#run-it-locally). The seeded database comes with demo
  accounts, so there's nothing to register.

## What it does

- **Add a whole shop at once.** Scan a receipt or a photo of your fridge, scan a barcode, or type
  it in. Every item gets a food group, storage spot, shelf life and pixel icon from our own
  rule-based classifiers, instantly and at no AI cost. AI only steps in for foods the rules
  don't recognise.
- **The crew.** Four agents, each with one job: **Guardian** watches expiry dates, **Chef**
  suggests meals from what's there (using what's about to expire first), **Organizer** keeps
  items in the right place, and **Shopkeeper** tracks what's running low.
- **Quick Chat.** Ask "what can I cook tonight?" or say "I finished the milk". It has 35 tools that
  read and edit your real inventory, shopping list, meal plan and recipes. Anything destructive
  asks first.
- **One household, one fridge.** Everyone shares the same inventory, notes and shopping list,
  with push notifications when something changes.
- **Kitchen Lab.** Describe a routine in plain words ("every Sunday, add anything running low to
  the shopping list"). AI writes it once as a set of steps, then it runs on a schedule or a
  trigger with **no further AI calls**.
- **Meal plans, recipes and insights,** plus a Kitchen Score that rewards using food up.

## How it uses RevenueCat

ThatFridge is freemium: **Free** gets 50 AI credits a month and one fridge. **Pro** ($2.99/month
or $19.99/year, 7-day free trial) gets 400 credits a month, more fridges and household hosting.
Tracking, reminders and joining a shared household never cost credits.

| Piece | What it does | Code |
| --- | --- | --- |
| Entitlement | Everything Pro checks the `thatfridge_pro` entitlement from `CustomerInfo`. | [`apps/mobile/src/lib/pro.tsx`](apps/mobile/src/lib/pro.tsx) |
| Paywall | A RevenueCat Paywall (`react-native-purchases-ui`), so pricing and copy change without an app release. | [`apps/mobile/src/app/paywall.tsx`](apps/mobile/src/app/paywall.tsx) |
| Webhooks | RevenueCat events update Pro status on the server, which is the single source of truth. The shared secret is checked in constant time. | [`RevenueCatWebhookController.php`](backend/app/Http/Controllers/RevenueCatWebhookController.php) |
| Credit ledger | Every grant and spend is a ledger row, taken under a row lock. A re-delivered webhook can't grant twice. | [`CreditService.php`](backend/app/Services/CreditService.php) |
| Trial guard | A trial start grants no credits; the 400 arrive with the first paid period, so the trial can't be farmed. | [`RevenueCatWebhookController.php`](backend/app/Http/Controllers/RevenueCatWebhookController.php) |
| Refunds | A failed AI call gives its credits back automatically. | [`AgentController.php`](backend/app/Http/Controllers/AgentController.php) |
| Virtual Currency | The balance is mirrored to RevenueCat Virtual Currency, so the dashboard and SDK show the same number. | [`RevenueCatVirtualCurrency.php`](backend/app/Services/RevenueCatVirtualCurrency.php) |

## Under the hood

| Part | Path | Stack |
| --- | --- | --- |
| Mobile app (the product) | [`apps/mobile/`](apps/mobile/) | Expo SDK 57, React Native, Expo Router, NativeWind, Reanimated |
| API | [`backend/`](backend/) | Laravel, PostgreSQL, Redis, Filament admin panel |
| Shared TypeScript | [`packages/core/`](packages/core/) | API client, types, domain rules |
| Website | [`apps/legal/`](apps/legal/) | Static site on Cloudflare Workers (privacy, terms, support) |
| Legacy web app | [`apps/web/`](apps/web/) | Next.js; frozen, kept only for reference |
| Planning notes | [`docs/`](docs/) | Launch checklist, feature plans, App Store drafts; not needed to run anything |

Some of the more interesting pieces:

- **Quick Chat tools**: [`AgentToolbox.php`](backend/app/Services/AgentToolbox.php). Controlled tool
  calling with a hard budget of tool rounds per reply.
- **Kitchen Lab**: [`MachineRunner.php`](backend/app/Services/MachineRunner.php) replays a routine
  that AI wrote once, with zero AI at run time.
- **Classifiers**: [`FoodGroupClassifier.php`](backend/app/Support/FoodGroupClassifier.php) and
  [`FoodIconMatcher.php`](backend/app/Support/FoodIconMatcher.php) handle most items without an AI call.
- **Credit prices**: [`CreditCost.php`](backend/app/Support/CreditCost.php).

## Run it locally

Requirements: PHP 8.4+ with Composer, Node 20+ with pnpm 10, Docker, and Xcode for the iOS app.

The full walkthrough, including every error we've hit and its fix, is in
[`SETUP_TROUBLESHOOTING.md`](SETUP_TROUBLESHOOTING.md). The short version:

1. **Start Postgres and Redis**

   ```bash
   docker-compose up -d
   ```

2. **Backend**

   ```bash
   cd backend
   cp .env.example .env
   composer install
   php artisan key:generate
   ```

   In `.env`, replace the existing `DB_CONNECTION` line with the settings from
   `docker-compose.yml`:

   ```
   DB_CONNECTION=pgsql
   DB_HOST=127.0.0.1
   DB_PORT=5433
   DB_DATABASE=thatfridge
   DB_USERNAME=devuser
   DB_PASSWORD=devpassword
   ```

   The container uses host port `5433`, not `5432`, so it doesn't clash with a local Postgres.
   Then:

   ```bash
   php artisan migrate --seed
   php artisan serve
   ```

   In a second terminal, run the scheduler so expiry and low-stock notifications get generated
   (or run `php artisan app:check-item-freshness` once to generate them immediately):

   ```bash
   php artisan schedule:work
   ```

   `--seed` creates four demo accounts, all with the password `password123`:

   | Email |
   | --- |
   | keira@thatfridge.test |
   | hazim@thatfridge.test |
   | joey@thatfridge.test |
   | kemed@thatfridge.test |

   Already migrated without `--seed`? `php artisan db:seed` is safe to run any time.

3. **Mobile app**

   ```bash
   pnpm install                      # from the repo root
   cd apps/mobile
   cp .env.example .env              # EXPO_PUBLIC_API_URL defaults to http://127.0.0.1:8000/api
   npx expo run:ios                  # builds and opens the app in the iOS Simulator
   ```

   Use a **development build** like this, not Expo Go: the app loads RevenueCat, the camera and
   notifications on launch, and Expo Go can't. On a physical device, set `EXPO_PUBLIC_API_URL`
   to your machine's LAN IP instead of `127.0.0.1`. After the first build, `pnpm start` is
   enough until a native dependency changes.

   The legacy web app isn't needed. If you want it anyway: `cd apps/web && npm install && npm run dev`.

### Optional service keys

The app runs with none of these set. Fridges, items, the crew, notes, recipes and notifications
all work against the seeded database. Each key only switches on the feature next to it:

| Where | Key | Enables |
| --- | --- | --- |
| `backend/.env` | `OPENROUTER_API_KEY` | AI Chef chat, recipe ideas, photo and receipt scans |
| `backend/.env` | `FAL_KEY` | AI-generated item and recipe icons |
| `backend/.env` | `RESEND_API_KEY` | Real email (otherwise mail goes to the log) |
| `backend/.env` | `REVENUECAT_WEBHOOK_SECRET` | Subscription webhooks |
| `apps/mobile/.env` | `EXPO_PUBLIC_RC_IOS_KEY` / `EXPO_PUBLIC_RC_ANDROID_KEY` | Paywall and in-app purchases |
| `apps/mobile/.env` | `EXPO_PUBLIC_GOOGLE_*`, `GOOGLE_IOS_URL_SCHEME` | Google Sign-In (the button hides when unset) |

### Check the API directly

With `php artisan serve` running:

```bash
curl -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"email":"keira@thatfridge.test","password":"password123"}'
```

That returns a `user` and a `token`. Use the token on any authenticated endpoint, such as
`/api/me` or `/api/fridges`:

```bash
curl http://127.0.0.1:8000/api/me \
  -H "Accept: application/json" -H "Authorization: Bearer <token>"
```

The full API reference is in [`backend/API.md`](backend/API.md).

## Testing

```bash
cd backend && php artisan test
cd apps/web && npm test
cd apps/mobile && pnpm test
```

A tracked pre-push hook runs all three suites before every `git push`. Turn it on once per
machine with `git config core.hooksPath .githooks`.

## Deploying

- **API:** a DigitalOcean VPS (Nginx, PHP 8.5, PostgreSQL, Redis, queue worker and scheduler)
  at `api.thatfridge.com`. GitHub Actions runs the tests and deploys every merge to `main` that
  touches `backend/`. Runbook: [`backend/DEPLOY.md`](backend/DEPLOY.md).
- **Mobile:** EAS Build and Submit, triggered by a `v*` tag. See
  [`apps/mobile/RELEASE.md`](apps/mobile/RELEASE.md).
- **Website:** [`apps/legal/`](apps/legal/) deploys to Cloudflare Workers on merge.

## Team

Built by undergraduate students for RevenueCat Shipaton 2026.

## License

ThatFridge's source code is released under the [MIT License](LICENSE).

Bundled third-party assets keep their own licences, which sit next to the files:

- **Inter Tight, Instrument Serif** (`apps/legal/assets/fonts/`): SIL Open Font License 1.1
- **Lenis** (`apps/legal/assets/vendor/`): MIT
- **PixelMix** by Andrew Tyler (`apps/mobile/assets/fonts/`, `apps/web/app/fonts/pixelmix/`):
  *not* covered by the MIT License. Included unmodified for building and judging this project;
  see the licence files in those folders. Reuse it elsewhere only under its own terms
  (contact font@andrewtyler.net).
