# ThatFridge — TO DO (iOS + Android launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store** and **Google Play**, live and approved.
Native Expo / React Native — no Capacitor, no WebView. Also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia at launch (+~140 storefronts); South Korea is a post-approval
fast-follow (see Deferred). API hosted in Singapore; v1 app UI is English-only.

**Hard deadline: Sep 30, 2026, 11:45pm PDT.** The app must be **fully published and live**
(review passed), not just submitted — review takes days.

---

## Handoff — read this first (context for the next AI / developer)

### The project in 60 seconds

ThatFridge is a household food-inventory app: track what's in the fridge/freezer/pantry, get
pinged before food goes bad, cook from what you have. Mission: "less food ends up in the bin".

| Part                               | Path              | Stack                                                                                                                    |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mobile app (**the product**) | `apps/mobile`   | Expo SDK 57, RN 0.86, Expo Router, NativeWind, Reanimated 4 +`react-native-worklets`, `react-native-gesture-handler` |
| API                                | `backend`       | Laravel (PHP 8.5), Postgres in prod,**in-memory SQLite in tests**, Filament v3 admin panel                         |
| Shared TS                          | `packages/core` | types +`createApi`/`HttpClient` used by mobile                                                                       |
| Legal site                         | `apps/legal`    | static, Cloudflare Workers (privacy, terms, Malay PDPA notice)                                                           |
| Legacy web                         | `apps/web`      | frozen; retired later                                                                                                    |

Key concepts: **crew** of 4 AI agents (Chef, Guardian, Shopkeeper, Organizer); **Quick Chat** with
tool calling (`backend/app/Services/AgentToolbox.php`); **Kitchen Lab "Machines"** — user
automations authored once with AI, then replayed with *zero* AI (`MachineRunner`,
`MachineDraftValidator`, `MachineTriggerService`); **AI credits** metered server-side
(`CreditService`, `ai_credit_ledger`, prices in `CreditCost`); RevenueCat subscriptions; Kitchen
Score; food-group / icon / shelf-life *classifiers* (`FoodGroupClassifier`, `FoodIconMatcher`).
Prod API: `https://api.thatfridge.com` (DigitalOcean, deploys from `main`).

Also read: `apps/mobile/AGENTS.md` (**Expo APIs changed — read the versioned v57 docs before
writing Expo code**), `apps/mobile/RELEASE.md`, `apps/mobile/CONTRIBUTING.md`, `backend/API.md`,
`backend/DEPLOY.md`, and the **Reference** section at the bottom of this file.

### Commands (all must be green before you call anything done)

- Backend: `cd backend && php artisan test` (~770 tests). Style: `vendor/bin/pint --test <files you touched>` — repo-wide Pint has **pre-existing failures in untouched files**; don't "fix" those.
- Mobile: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json && npx jest` (jest-expo +
  `@testing-library/react-native`). Core: `cd packages/core && npx tsc --noEmit`.
- `.githooks/pre-push` runs backend + web + mobile tests; never bypass it (`--no-verify`).
- macOS shell: BSD `sed` needs `-i ''` and has no `\s` — use `perl -pi -e` or python.

### Deploy & release rules

- Push to `main` ⇒ `deploy-api.yml` (backend + migrations). **`eas-update.yml` is DISABLED in
  GitHub** (found 2026-09-26; last auto-OTA was `bbff2c2`), so pushing no longer ships an OTA.
  Publish by hand from `apps/mobile`: `EXPO_PUBLIC_API_URL=https://api.thatfridge.com/api EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<from eas-update.yml> npx eas env:exec production "eas update --branch production --environment production --non-interactive --message '…'"` (local eas-cli
  needs `--environment`), or re-enable the workflow in the Actions tab.
- OTA runtime = `apps/mobile/app.config.ts` `version` (currently `1.3.3`, policy `appVersion`).
  Native changes (new native module, permissions, icon) need a version bump + a `v*` tag build
  (TestFlight/Play), not OTA. Roll back an OTA: `eas update:rollback`.
- **Do not push/deploy without the owner's explicit OK** — they have asked "commit, don't deploy"
  before. A bad OTA (chat attachments) already crashed once: device-test before pushing.
- Commits: **no `Co-Authored-By: Claude` trailer** (owner rule), stage specific files, new commits
  not amends. Backend deploys wait on backend tests; an OTA needs its backend endpoints live.
- Keep this file a lean "what's left" list; narrate work in commit messages. When you hit and fix a
  setup/tooling error, add it to `SETUP_TROUBLESHOOTING.md` (Part 2).

### Gotchas learned the hard way

- **RNTL v14: `render`, `renderHook`, `fireEvent` are async — `await` them** (missing await gives
  "overlapping act() calls" and empty results).
- Mobile jest infra: `apps/mobile/jest.setup.js` = gesture-handler `jestSetup` + `react-native-worklets/src/mock`
  + Reanimated `setUpTests()`; config has `resolver: react-native-worklets/jest/resolver`; `tsconfig`
    needs `types: ["jest"]` (pnpm is hoisted to the repo root). Components importing `{ router }` from
    `expo-router` need `jest.mock("expo-router", …)`; mock `@/lib/theme`'s `useTheme` for isolated tests.
    Pan gestures can't be simulated — test the tap fallback.
- Laravel tests: `User.ai_credits` is **not mass-assignable** — set it via `User::factory()->create([...])`;
  after `create()` DB-default columns (e.g. `ai_credits`, `run_count`) are unhydrated — read with
  `->fresh()`. Pint reformat only files you touched.
- `HttpClient` unwraps `{ data: … }` and drops sibling keys; endpoints returning extra metadata must
  not put the payload under a top-level `data`. Machine validation 422s are `{ errors: [strings] }`
  with **no `message`** → use `describeMachineError` (`apps/mobile/src/lib/machineEdit.ts`).
- `FoodIconMatcher::guess()` matches plain substrings (no word boundaries) and has generic keywords
  ("whole", "oat" in "goat") — that's why `FoodGroupClassifier` checks its own precise layers first
  and the icon-corpus guess *last*. `ItemController::autofill` skips the AI (and the credit) when the
  classifier is confident; a valid AI answer is trusted otherwise; unknown ⇒ **null, never a forced
  `other_extras`**.
- Machines: steps run through `AgentToolbox::run(…, 'machine')`; dry run = `AgentToolbox::preview()`
  (writes nothing, no real notification); undo = per-step `undo` payload + `undoStep()` (only
  add_item/bulk_add_items/add_note/add_to_shopping/mark_items_used_matching). Validator forbids
  `expiry_date` on `add_item` steps (use `shelf_life_days`). Restoring items on undo re-fires
  `ItemObserver::created` (Machine triggers/notifications) — intended.
- Filament pattern to copy for new admin pages: a Report service aggregating in SQL
  (`OnboardingFunnelReport`) + a Widget/Page using `Cache::flexible` and `AdminCacheKeys`;
  resources set `$shouldSkipAuthorization` (panel is gated by `User::canAccessPanel`);
  admin edits are audited via `AdminAuditLog`. `analytics_events` public ingest only accepts
  `app_open` / `onboarding_` / `welcome_` prefixes from anonymous callers.
- Local dev DB: Postgres listens on **5432** but `backend/.env` has `DB_PORT=5433` (so
  `php artisan migrate` fails locally; tests unaffected). Ask which port is intended before changing.
- The mobile `.env` points at **prod** (`api.thatfridge.com`) and there's no local backend by default —
  don't test-drive mutating features against prod with the shared demo account.

### Current state (2026-09-26)

- Backend deployed and feedback collection is **on**: logger + Algorithm insights admin (data
  health, outcome metrics, retention, per-algorithm detail, rule suggestions, unknown barcodes →
  Product, icon requests), unified Remove, opened-item shelf life, privacy wording, and
  server-side signals for alerts, scans, autofill, notification toggles, recipe rank and Kitchen Lab
  authoring.
- **Live OTA (production, runtime 1.3.3, latest group `f9ccc24b-3d9c-48f1-8a1b-fbf050697a7e`, commit
  `7319eb2`)** carries everything since `bbff2c2`. The earlier batch was verified on a device; the
  latest changes have **not** been device-checked yet: scan `parsed_name`, Home tip taps/dismissals
  (`/tip-feedback`), fridge-scoped Home bell dot, Profile → Privacy as list rows, and the bulk-remove
  toast summary + Kitchen Score refresh, and the app following server-side Pro (admin-granted Pro), and the in-app calendar
  (phases 1-2).
  Rollback: `eas update:rollback`.
- **Latest OTA** (group `38644aea-0ad3-4e3a-8b21-452e40816d4a`, commit `1b3c374`, API deployed; earlier groups `5bcdff86`, `ab975687`): calendar delete / filter
  dropdown / Ask Quick Chat, Meal plan Autofill (3 credits), calendar fridge picker, change a Machine's fridge,
  Insights + Crew score + Privacy + Meal plan + Calendar Settings rows, profile avatar icon. Plus Explore Phase 1. Not device-checked yet.
- **Settings audit fixes** (live in the latest OTA): Organizer sweep asks first, is capped at 15 items and only counts answered
  checks (shared by the Organizer screen and the Crew tab); the Crew tab no longer reuses the shared-fridge "Crew activity"
  pref to gate sweeping; Home tips honour the Expiry / Low stock / Recipe switches; the dead Weekly digest switch is
  removed (no digest sender exists - build one before bringing it back); AI Data no longer fakes a successful clear.
  Merged: Settings lost Recipe book / Shopping list / Organizer (the Crew tab already has them; the orphan /recipes and /organizer
  screens are deleted, /shopping stays for Home's tip) and the blurb card; AI Data + Privacy became one "Privacy & data" page.
  Left alone on purpose: Crew score / Insights / Badges, Calendar / Meal plan, the credits + subscription cards.
- **Explore** Phase 1 (search + icon / recipe / Machine / meal-plan libraries, admin-curated, read-only) is live. Phase 2 (user contributions) needs UGC moderation (App Store 1.2) first: see `EXPLORE_PLAN.md`.

### Execution queue (post-launch product work; details in "Product backlog")

1. Device-check the latest OTA (Home tips + bell dot, a receipt scan → save, Profile → Privacy rows,
   inventory multi-select delete). 2. Opened-item alert-timing decision. 3. Credit-scheme audit, then calendar, then multi-Machine.

**Priority over all of the above: the launch items** (Android Play setup, Devpost submission — hard
deadline Sep 30, 2026 11:45pm PDT) and the "Deferred to post-launch — don't work on these before
Sep 30" list is off-limits until then. Don't let the queue above displace a launch blocker, and
don't push risky OTAs close to the deadline without device QA. Open owner decisions: waste in
Waste Saver score, "wasted this month" stat, no-expiry removals.

---

## What's left to do

### iOS — App Store

`v1.3.0` is approved and live.

- [ ] `v1.3.2` — App Store rating (Settings row + native review prompt), swipe-right-to-profile,
  light/dark theme — submitted for review 2026-09-18, awaiting Apple's decision. **Verify status
  in App Store Connect** (can't be checked from the repo): a `v1.3.3` build also reached TestFlight
  on 2026-09-24, so confirm what is live vs in review and whether 1.3.3 needs submitting.

### Android — Play Store

Done: Play Console **Personal** account, app record (`app.thatfridge`), Data Safety / content
rating / declarations, listing assets, `#delete-account`/`#delete-data` policy anchors, first
Internal-testing build, RevenueCat Android key wired into EAS (`a7fea71`), 4 of 5 IAP products
created and attached in RevenueCat (verified 2026-09-26). The `v*` tag already fires
`.github/workflows/google-play.yml`.

- [ ] **EAS→Play publishing service account is NOT set up** — `google-play.yml` failed on the
  `v1.3.1` and `v1.3.2` tags (2026-09-18, "Google Service Account Keys cannot be set up in
  --non-interactive mode") and never ran for `v1.3.3`. Run `eas credentials` (interactive) →
  Android → production → Google Service Account, with a **Release manager**-role service account
  JSON (separate from RevenueCat's, whose own Play credentials are fine). Until then every build
  needs a manual `.aab` upload to Play Console.
- [ ] **Google Play Payments Profile is incomplete** (pay.google.com/business/console) — likely
  root cause of the "unexpected error" failures creating `credits_100`. Needs the banking/payout +
  tax (W-8BEN) form completed first.
- [ ] **`credits_100` not created in Play Console** — blocked on the Payments Profile and on
  **closed testing** clearing (track running since 2026-09-16; check Play Console for the
  tester-count/day requirement — Internal-testing opt-ins don't count, testers need the
  Closed-testing opt-in link). Attach it to RevenueCat like the other 4 once created.
- [ ] **Google Sign-In on Android needs its own OAuth client** (separate from iOS's) — the
  button fails ("sign-in didn't go through") until this exists.
- [ ] **UGC reporting is stricter in wording than Apple's** — Google's policy says "in-app
  functionality for reporting"; the mailto-based report (`FridgeNotes.tsx`, `find-friend.tsx`)
  commonly passes review in practice but is a literal gap vs. the text. Deliberately left as-is;
  revisit with a true in-app report flow only if Android review actually flags it.

### Shipaton / Devpost (same Sep 30, 11:45pm PDT)

- [ ] Devpost project page + feature description.
- [ ] Demo video ≤2:00, public on YouTube/Vimeo, no copyrighted music/footage.
- [ ] Peace Prize impact statement (household food-waste → savings + environmental).
- [ ] App Store URL on the submission.
- [ ] **Submit on Devpost before the deadline.**

- **Don't** market as "launched" anywhere public (TestFlight link, ProductHunt, press) before
  the store listing is live — risks Shipaton's "brand-new app" disqualification.

### Product backlog

- [ ] **Recipe calories — deployed (API `1f95d31`) and in the OTA; not yet verified on a device.** Every recipe gets `calories`
  per serving from `RecipeCalories`/`NutritionTable` (table first; the model only when < 70% of the
  ingredients are recognised). Spot-check a few real recipes against expectations, and run
  `php artisan app:fill-recipe-calories` once on the server so the model refines the stop-gaps
  (the nightly sweep does 50/day). Recipes have no quantities, so it is "one typical
  serving" by design; the table values are estimates.

**Algorithm insights — what's left**

- [ ] Nothing required; extend only if the data shows gaps. Autofill's card is all-or-nothing, so
  "partly accepted" only shows up as `changed` values after "Use these". Later: per-user
  personalisation and automatic rule learning (needs volume). Act on patterns only with ≥5 people
  (`ACT_USERS`); the admin page hides names below 3 (`MIN_USERS`).

**Opened-item shelf life — leftovers**

- [ ] **Flip the alert-timing switch** — `CheckItemFreshness` on the effective date is built but
  gated behind `OPENED_EXPIRY_ALERTS_ENABLED` (default `false`, see `backend/DEPLOY.md`). Enabling it
  means alerts for opened items fire on the (never later than printed) opened date, so opened milk
  alerts earlier and opened items with no printed date start alerting; the first run may send a
  batch for items already opened. Everything else (item screen, Home, recipes, Kitchen Score,
  removal outcomes) already uses the opened date regardless. Owner's call; safe to leave off.
- [ ] Later, only if people actually correct values often: per-name learning store, AI estimate for
  `default` items (piggyback on the autofill call, cached by name like the food-group answers).
- [ ] Open question: which specific items besides eggs looked wrong (become first test cases).

**Larger scope, tackle last**

- [ ] **Recheck the credit scheme** — an audit-first task. The authority is
  `backend/app/Services/CreditService.php` plus `ai_credit_ledger`; prices are centralized in
  `backend/app/Support/CreditCost.php`, grants arrive through `RevenueCatWebhookController`
  and `GrantMonthlyCredits`, and the mobile ledger is displayed by
  `apps/mobile/src/app/credits.tsx`. Audit every metered controller against provider
  input/output cost and the actual UI copy, especially chat image extras, PDF, tool
  surcharge, scans, refunds, webhook idempotency, and monthly top-ups. Then version the
  pricing table, add an endpoint-to-cost test matrix, and change prices only after recording
  the expected user/cost impact.
- [ ] **In-app calendar** — planned, decisions made 2026-09-26; full design in
  [CALENDAR_PLAN.md](CALENDAR_PLAN.md). One screen (opened from a button directly under Home's
  notification bell; every day is tappable and opens that day's detail) showing expiry dates, meal plan / recipe logs, Kitchen Lab runs and item
  activity (180 days). New `meal_entries` table + `GET /api/calendar`; meal plans are shared with
  other members of a Pro-owned fridge without ever saying "household" in the UI; meal slots are
  user-defined with suggested templates; AI weekly planner later (after the credit audit). All
  OTA — no native rebuild, no Apple/Google Calendar. **Phases 1 (read-only calendar) and 2 (meal plan + recipe log) are
  PUBLISHED (OTA `0a92e78c`); a first device pass found the meal form hidden by the keyboard —
  fixed in OTA `b1402ef0` (sheet now rides above the keyboard, name field first, calories on meals).** Since then (published in OTA `f9ccc24b`, not device-checked): Meal plan became its own screen replacing
  What should I eat? (`CALENDAR_PLAN.md` → "Restructure"), and the calendar's Plan a meal button is now a
  general + Add menu. Quick Chat can plan meals too (`plan_meals` / `list_plan` / `remove_meal`, live on the API).
  Still to check on a phone: Home button under the bell,
  tap days incl. empty ones, filters, month arrows, plan / edit / delete / tick a meal, first-time slot
  templates, a reminder time, "Add to plan" on a recipe, and the sharing rule with a second account
  (Pro-owned fridge shares, free-owned stays personal). Phase 3 (AI/automation hooks) not started.
- [ ] **Kitchen Lab multi-Machine generation** — later allow one prompt to propose several
  independent Machines, but return and validate them as separate drafts. Review each trigger
  and action independently, detect duplicates, charge per saved Machine, and save atomically or
  report partial failures clearly. Keep the current one-trigger/up-to-10-step Machine model as
  the default until this review flow exists. Reuse the existing duplicate-trigger detection and dry
  run, applied per draft.

### Deferred to post-launch (don't work on these before Sep 30)

- [ ] **Korea launch** — metadata-only fast-follow, no binary re-review. Real blocker: a
  **Korean privacy policy** at `/privacy/ko/` (currently 404) — ~$200–350 for a KR legal
  translator, or ~$300–600 for a PIPA-compliance consultant who adapts rather than translates
  (keep an "English version prevails" clause). Also needs a _separate, unticked_ cross-border
  consent checkbox on every sign-in path gated on KR locale, KR pricing (₩3,900/₩25,000), KR
  listing metadata + screenshots (captions in `SCREENSHOTS.md` §6), and re-checking the KR
  storefront in ASC → Availability.
- [ ] **Translation sourcing** (KR policy above, later a KR/MS app UI): paid native review beats
  translate-from-scratch — Fiverr/Upwork $30–80 for a review pass, ProZ.com for real legal
  translators. App UI strings (once i18n is wired) via Crowdin/Lokalise/Weblate, ~$150–300 for a
  full KO set.
- [ ] Onboarding polish — personalized payoff copy from stored `preferences` tags + a peak-end
  "you're all set" beat, and contextual coach-marks (crew tabs in `/eat`, drag-to-reorder in
  Inventory, Kitchen Score). Waits on `app:onboarding-funnel` data. See
  `apps/mobile/ONBOARDING.md` → "Still open."
- [ ] Personal-goal feature, done right (old Goal screen removed for v1). If rebuilt: one
  intuitive metric ("items rescued"), a live Home card, an honest timeframe. Backend
  `user_goals`/`UserGoalController`/`progress.ts` still exist, unused by the client.
- [ ] Turn on low-balance email alerts on the OpenRouter + fal.ai dashboards (the spend-ceiling
  system itself is done).
- [ ] Photographic recipe hero image — an optional full-bleed photo (`image_url`, `flux/schnell`
  no-rembg ~$0.003/img) on the card + detail, alongside the existing `icon`/`icon_url`. Web
  parity for the icon picker also unbuilt.
- [ ] **Flip media storage to Cloudflare R2** when the VPS disk hits ~50% or before ~500 active
  users. Runbook: `backend/DEPLOY.md` §13a. ~$0 under R2's free tier, then ~$2–5/mo.
- [ ] Sentry DSN (crash monitoring scaffolded, currently a no-op).
- [ ] `apps/web/lib/thatfridge` → `packages/core` extraction (most already moved).
- [ ] `react-i18next` + `expo-localization` — i18n plumbing so a Korean/Malay UI ships as an
  OTA, no rebuild.
- [ ] Web deployment: `expo export -p web`, wide-viewport (≥900px) layouts, retire legacy
  `apps/web`.
- [ ] PixelMix font: get written confirmation the desktop EULA covers app/web embedding (email
  font@andrewtyler.net), drop the unused unofficial `PixelMix-Bold.ttf`.

  <details>
  <summary>Draft email — font@andrewtyler.net</summary>

  ```
  Subject: PixelMix licence — confirming app/web embedding coverage

  Hi Andrew,

  I purchased the commercial licence for PixelMix via Sellfy on August 28, 2026 (governed by
  PixelMix-EULA.docx). I'm using it as the wordmark/logo font in a mobile app called ThatFridge
  (iOS/Android, built with Expo/React Native) and on its companion website, thatfridge.com.

  The EULA's "Embedding Restrictions" and "No Other Use" sections mention that embedding the
  font into "application programs" and "web pages" needs an additional licence beyond the base
  purchase. Could you confirm in writing whether my purchase already covers:

  1. Embedding the font file in a distributed iOS/Android app (bundled into the app binary via
     expo-font), and
  2. Serving it via @font-face on a public website

  — or whether an additional licence is needed for either, and if so, how to obtain it?

  Happy to provide the Sellfy order confirmation if useful.

  Thanks,
  Muhammad Naufal Kamaruddin
  ```

  </details>
- [ ] Privacy Policy §11 promises material changes get "surfaced in the app" — nothing does
  that yet.
- [ ] **Recipe attachments still on the public media disk** (unlike receipts/photos — see
  Security below — these are actively displayed, so privatizing needs a real data-model change:
  store a disk path instead of a baked URL, regenerate the signed URL fresh on every read).

---

## Reference

### Cost tracker (all USD, approximate)

| Item                                                          | Cost         | Status                                           |
| ------------------------------------------------------------- | ------------ | ------------------------------------------------ |
| Apple Developer Program                                       | $99/yr       | Paid                                             |
| Domain —`thatfridge.com`                                   | ~$10.46/yr   | Paid                                             |
| PixelMix commercial font licence                              | $25 one-time | Paid (embedding confirmation pending, see above) |
| VPS — DigitalOcean SGP1, 2 vCPU/2GB + backups                | $21.60/mo    | Live                                             |
| Legal site hosting (Cloudflare Workers), email routing        | $0           | Live                                             |
| Expo EAS — Starter plan (upgraded from free tier)            | $19/mo       | Live (2026-09-18, hit free iOS build quota)      |
| Sentry, RevenueCat, Devpost                                   | $0           | Free tiers                                       |
| Google Play Console                                           | $25 one-time | Paid                                             |
| OpenRouter wallet (AI chat/vision, prepaid, no auto-recharge) | $10 one-time | Paid                                             |
| fal.ai wallet (icon generation, prepaid, no auto-recharge)    | $10 one-time | Paid                                             |

**Fixed recurring cost: ≈$49.72/mo ($596.66/yr)**, regardless of user count. Apple's commission
is 15% once the Small Business Program application (submitted 2026-09-05) is approved, 30%
until then. US withholding is 30% on US-storefront sales only (Malaysian individual, W-8BEN
filed) — shouldn't bite much given MY/KR are the target markets.

### Business model — bottom line

Break-even is **≈20 paying subscribers** at 15% commission, **≈25** at 30%. Blended contribution
margin per subscriber is **≈$1.24–1.56/mo** (65/35 annual/monthly mix) after Apple's cut and AI
cost (~$0.15–0.40/mo per active Pro subscriber, ~$0.10/mo per free user — bounded by the credit
system, see below). Not captured: paid acquisition (growth is organic/#BuildInPublic), own time,
refunds. Full reasoning: git history (`3a. Business & pricing analysis`, 2026-09-05).

### RevenueCat / subscriptions

Two products, **permanent IDs — never reusable, don't typo**: `thatfridge_pro_monthly`
($2.99/mo) and `thatfridge_pro_yearly` ($19.99/yr), both with a 1-week free intro offer. Pro
grants a **400-credit monthly bundle** (vs 50 free), rolls over up to 800, and unlocks hosting
shared fridges (see AI credits below). iOS paywall = the RevenueCat dashboard paywall
(`RevenueCatUI.Paywall`) — editor at
`app.revenuecat.com/projects/c6c4cdf4/paywalls/pwec1165df9a414243/builder`, published revision
36 (credit-model copy, live in the app). Android app + products are being wired in now (see
Android section above).

<details>
<summary>Canonical paywall content (rebuild reference)</summary>

- Headline: **Get more out of your fridge** (turquoise `#26c6da`, ~22pt bold, centered)
- Subtitle: _Know before you open the door._
- Comparison card — header row `· / Free / Pro`, then:| Feature                                 | Free         | Pro          |
  | --------------------------------------- | ------------ | ------------ |
  | Fridge & pantry tracking, expiry alerts | ✓           | ✓           |
  | Monthly AI credits (chat, scans, icons) | 50           | 400          |
  | Bulk-add from a receipt or fridge photo | Uses credits | Uses credits |
  | Buy more credits anytime                | ✓           | ✓           |
  | Own more than one fridge                | –           | ✓           |
  | Host a shared fridge for your household | –           | ✓           |
- Footer: _Every AI action spends credits. Free gives you 50 a month; Pro gives you 400, rolls
  the unused ones over, and unlocks hosting shared fridges._
- Rules: sentence case, **never the word "unlimited"**, lead with the credit number not a
  weekly cap.
- Trial line: _7-day free trial, then {{ product.price_per_period }}. Renews automatically until
  you cancel._ CTA: **Get Pro access**.

`app_context` for the RC Paywall AI editor (`edit-paywall-ai`):

```
app_identity: name "ThatFridge", category "Food & Drink / kitchen inventory",
  desc "Track what's in your fridge and pantry, get pinged before food goes bad, see what you
  can cook with what you have. AI 'crew' of four agents (Chef, Guardian, Shopkeeper, Organizer)."
brand: mission "Less food ends up in the bin"; values calm/helpful not naggy, pixel-art charm,
  practical household utility.
tone: friendly, plain-spoken, benefit-first, sentence case, NO hype/superlatives, speak to the
  payoff (waste less, cook with what you have, keep the household in sync) not the mechanism.
audience: home cook running a household, tired of throwing away forgotten groceries. Pains:
  food goes bad before use; no idea what's in the fridge at the shop; adding groceries one by
  one is tedious; partner/housemate double-buys or misses things.
premium highlights: 400 AI credits a month vs 50 (credits pay for crew chat, receipt/fridge
  scans, icon generation), unused credits roll over; own more than one fridge; host a shared
  fridge for the household.
visual: primary #26c6da, dark charcoal bg + cyan accent, bold sans headline / regular sans body.
```

</details>

### AI credits (metered, server-authoritative)

Every AI action spends credits from `users.ai_credits`. The backend ledger
(`ai_credit_ledger`, unique on `reason`+`ref`) is authoritative; RevenueCat Virtual Currency
(`AICR`) is a best-effort display mirror.

| Action                             | Cost | Notes (`App\Support\CreditCost`)                       |
| ---------------------------------- | ---- | -------------------------------------------------------- |
| Quick Chat message                 | 1    | `+2` surcharge (best-effort) when the crew used a tool |
| AI icon generation (item + recipe) | 3    | curated pixel picks are free                             |
| Expiry-date photo scan             | 2    | no refund — the vision call runs even on "not found"    |
| Receipt scan                       | 3    | refunded on hard failure                                 |
| Fridge-photo scan                  | 3    | refunded on hard failure                                 |
| Add-item auto-fill                 | 1    | 402 → top-up prompt on the draft card                   |
| Memory extraction                  | 0    | tiny call right after a chat that already paid           |
| Home crew tip cards                | 0    | cached per user+agent per day                            |
| Quick Chat with a photo            | 3    | vision is ~3-5× a text chat; refund matches on failure  |

Grants: free accounts topped up to 50/month; Pro gets 400/month, rolling over up to 800.
`app:grant-monthly-credits` runs `monthlyOn(1, 00:15)`; the RevenueCat webhook also grants the
Pro bundle on a paid `INITIAL_PURCHASE`/`RENEWAL` and pack credits on a consumable
`NON_RENEWING_PURCHASE` — idempotent via the ledger's `reason`+`ref` key.

**Trial-farming guard**: a `period_type: TRIAL` `INITIAL_PURCHASE` grants **nothing** (trial
user keeps their free 50) and sets `pro_trial_until`; the 400 bundle lands only on a paid
`RENEWAL`.

**Signup cap**: 6/min + 20/day per IP on `/register` — full email verification is the real fix,
deferred (needs a mobile verify screen).

**Host a shared fridge** stays a hard Pro gate (not credits) — `FridgeJoinRequestController`
requires `$fridge->user->isPro()`.

Still owed: prod `.env` → `REVENUECAT_SECRET_API_KEY=…` for the credit→VC display mirror
(optional, the ledger is authoritative without it); after both stores' IAPs are fully live,
detach the RC Test Store products (`monthly`, `yearly`) from the packages so the paywall serves
only the real store products.

### Shared icon pack (curated from user generations)

Generated icons can be hand-picked into an app-wide pack shown in both icon pickers. On the prod
box: `php artisan app:generated-icons --html=/tmp/icons.html` (review) →
`php artisan app:promote-icon <id> --label="Tomato"` (live for everyone) →
`app:demote-icon <shared_id>` to pull one. Promotion **copies** the image to `shared-icons/`
with no `user_id`, so it survives the generator deleting their icon or account. Legal cover:
`apps/legal/terms` §4 + `privacy` §3/§5. Only promote generic, non-personal food icons.

### Quick Chat tools (`AgentToolbox`)

30 tools on top of `fetch_url` browsing:

- **Reads:** `list_items`, `list_plan`, `list_notes`, `list_shopping`, `list_recipes`, `list_fridges`,
  `get_recipe`, `get_kitchen_score`, `list_facts`
- **Writes (direct, reversible):** `add_item`, `bulk_add_items`, `update_item`, `move_item`,
  `mark_item_used`, `add_to_shopping`, `check_off_shopping`, `remove_from_shopping`, `add_note`,
  `update_note`, `remove_note`, `remember_fact`, `forget_fact`, `save_recipe`,
  `mark_recipe_made`, `import_recipe_from_link`, `plan_meals` (one or up to 21 meals on the calendar)
- **Deletes (confirm-first):** `remove_item`, `clear_expired_items`, `delete_recipe` (own only), `remove_meal`

The meal tools are chat-only (never offered to a Kitchen Lab Machine) and share `MealPlanService` with the
REST controller, so chat and app follow the same rules (recipe title copy, calories, sharing).

Loop bounded by `MAX_TOOL_ROUNDS = 5` + `MAX_TOOL_CALLS = 10` (`fetch_url` keeps its own
`MAX_FETCHES = 2`). A tool exchange costs the 1-credit message + a best-effort `+2` surcharge
(never hard-fails mid-reply). All agents get all tools; model stays Haiku 4.5.

**Still open:** `add_item`/`save_recipe` icon-guessing only covers a curated-10 keyword map
(port the full `guessFoodIcon` post-launch); a confirm _card_ in the UI (vs. text round-trip) is
deferred; no tools yet for recipe favourite/unfavourite, `suggest_recipes`, user categories, or
shopping→fridge handoff. Buy links (`shop_url`) are opened in-browser only, never fetched
server-side.

### Data retention

`app:prune-stale-data` runs daily (04:00): `analytics_events` >180d, `notification_events`
(done >60d / any >180d), terminal `fridge_join_requests` >90d, `photos/`+`receipts/` scan
images + orphaned `icons/`/`recipe-attachments/` files >7d. Not pruned: `chat_history` (needs a
"kept 12 months" UI message first), and real user data (items, recipes, usage history, memory).
`algo_feedback_events` are pruned at 180d; `algo_stats_daily` is kept (no user id). `--dry-run`
reports without deleting. `photo_scans`/`receipts`/`receipt_line_items` tables are dead schema — the vision services store the file and return it inline, never writing a row.

### Security

Full passes done 2026-09-08 and 2026-09-15 (backend + mobile) — no unresolved High/Medium
findings. Solid: OAuth verification (fails closed), policy-based authz with no IDOR outside the
intentional recipe/profile openness (below), no SQLi, mass-assignment locked, no account
enumeration, webhook `hash_equals` + event-id idempotency + stale-event ordering guard, credit
ledger race-safe (`lockForUpdate`), Keychain-only token storage, server-side enforcement behind
every client paywall/entitlement gate, a global mobile `AuthGuard` covering any future
unauthenticated screen.

**Open, deliberately deferred (post-launch):**

- Recipe/profile data is world-readable to any authed user (`RecipePolicy::view` = true;
  `/users/{username}/profile` exposes owned-fridge names + custom recipes) — deliberate
  "no privacy toggle" design; consider a private flag.
- Recipe attachments still on the public media disk (see Deferred to post-launch above).
- Image-gen (`/icons/generate`) has no content moderation on the prompt.
- Account hygiene (not code): 2FA on GitHub/DigitalOcean/ASC/RevenueCat/registrar/recovery
  email; `gitleaks` scan of history; turn on the Sentry DSN; verify DB backups are off-box.

### Demo / reviewer account

`keira@thatfridge.test` — pre-seeded shared fridge ("Home Fridge") with items across all zones.
Two separate admin flags (Admin → Users → Edit): **Demo** (`is_demo`: isolated from real users in
Find a friend, name/username locked, excluded from stats and monthly credits) and **Pro (granted by
admin)** (`pro_granted`, a comped Pro that a RevenueCat webhook can't overwrite). Demo alone is not
Pro; the seeded demo accounts have both (the `pro_granted` migration backfills existing ones).
`/api/me` reports `isPro`/`proGranted` so the app follows admin grants (it can't see them via RevenueCat);
it takes effect on the user's next app launch, and the Pro credit bundle lands at the next monthly
grant (use Adjust credits for an immediate top-up).
Password is an env var (`DEMO_USER_PASSWORD`), live value in the shared password manager, pasted
into ASC's Sign-In fields. If the demo account is ever deleted again (e.g. while recording an
account-deletion demo), re-seed via `php artisan config:clear && php artisan db:seed --force` on
the server — restores the login but not any hand-built fridge/recipe content, which would need
rebuilding separately.

### Privacy & compliance posture

**App Store availability:** unavailable in the EU-27 + Iceland + Norway (GDPR + DSA trader
declaration), the non-EU Balkans + Moldova + Ukraine, China (PIPL + ICP filing), Russia +
Belarus, and **South Korea** (temporary — re-enable per the Korea fast-follow above). Available
everywhere else (~140 territories incl. MY, US, UK, Switzerland).

Privacy policy + terms are cross-platform (both stores named as payment/push processors, not
Apple-only) and cover the credit model: the AI crew reads _and acts on_ kitchen data, fetches
pasted links; consumable AI-credit packs + the RC credit-balance mirror are disclosed; terms §3
covers credits (consumable, non-refundable, no cash value).

- One English privacy policy (`/privacy/`) + App Privacy labels (both stores) + in-app account
  deletion — the disclosure floor for ~everywhere sold.
- **Cross-border-transfer consent on every sign-up path** (email checkbox; notice + affirmative
  action before Apple/Google; recorded as `users.data_transfer_consented_at`) — satisfies
  MY (PDPA) / UK / Switzerland.
- **Malaysia:** bilingual Section 7 notice at `/privacy/pdpa/`; breach process in
  `INCIDENT_RESPONSE.md`.
- **UK/Switzerland:** policy has region sections + lawful bases; Art. 27 UK rep / Swiss rep
  technically applicable but low-enforcement at this scale.
- **Korea:** storefront unchecked for launch — re-enable only once the Korean policy + stricter
  consent ship (see Deferred).
- Adding the EU later is a much bigger lift (DSA trader info, GDPR lawful basis, tracking
  consent, EU rep) — its own project.

### Locked decisions — no re-litigation

NativeWind · Expo Router · pnpm workspaces + turborepo · bundle id `test.thatfridge.app` (iOS) /
`app.thatfridge` (Android) · iOS target 15.1 · Apple enrollment Individual, Google Play Personal
· v1 notifications local/on-device (server push already built too, for social events) · one
universal UI codebase (`react-native-web` renders `apps/mobile` in a browser; legacy `apps/web`
retired once web output ships) · signing keys + store assets in a shared password manager ·
**v1 app UI is English-only**, localized store listings only.

### Infra & CD

- API: `https://api.thatfridge.com` (DigitalOcean SGP1, `167.172.88.75`, PHP 8.5/Nginx/
  Postgres/Redis). CD: `.github/workflows/deploy-api.yml`, push to `main` → test → deploy
  (runs migrations automatically).
- Legal site: `https://thatfridge.com` (Cloudflare Workers). CD:
  `.github/workflows/deploy-legal.yml`.
- Mobile OTA: `.github/workflows/eas-update.yml` (push to `main` touching `apps/mobile`/
  `packages` → production channel) — **currently disabled**, publish manually (see Deploy rules).
- Mobile native builds: `git tag v*` (or manual dispatch) fires both
  `.github/workflows/testflight.yml` (iOS) and `.github/workflows/google-play.yml` (Android) —
  Android auto-submit needs its service account fixed first (see Android section).
- `main` is the only working branch.

### Architecture

```
thatfridge/                  (monorepo — pnpm workspaces + turborepo)
├── packages/core/           shared logic: HttpClient, createApi, types, domain/home/progress helpers
├── apps/mobile/             Expo + Expo Router — iOS + Android + web from one codebase. THE PRODUCT.
│   └── src/components/      universal UI primitives (brand, ui, food-icon, sheet, tab-bar, tags, home/*)
├── apps/web/                LEGACY Next.js SPA — frozen; retired once web output ships (post-launch)
└── backend/                 Laravel API — deploy + prod hardening
```

### Top risks & mitigations

1. **Guideline 3.1.2 (subscription scrutiny).** Restore button, clear pricing, terms, no dark
   patterns — the published paywall is already built to spec; the code fallback UI (used only
   pre-dashboard-config / Expo Go) got an explicit auto-renewal disclosure line added too.
2. **Guideline 4.2 (thin-wrapper rejection).** Low risk for a real RN app with substantial
   native feature use; a written rebuttal is on hand in `STORE_LISTING.md` §3 if needed.
3. **Shipaton "first public release" timing.** No public TestFlight/Play link or press before
   the store listing is live.
4. **The deadline is a wall.** Sep 30, no extensions; be ready for same-day resubmits if rejected.
5. **Scope creep.** Anything not already in the app is post-launch OTA. The paywall is
   mandatory — don't trade release-track time for a nice-to-have screen.

**Full guideline passes done:** Apple (2026-09-15 — 4.8 Sign in with Apple parity, 3.1.1
restore, 5.1.1 privacy manifest/permission strings/data minimization/account deletion, 5.1.2/ATT
no tracking, 1.2 UGC report+block) and Google Play (2026-09-15/16 — Data Safety, subscription
disclosure, permissions, UGC reporting caveat noted above) — both compliant, same codebase.

### QA matrix

| Area          | Checks                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Devices       | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device; one Android device                                                           |
| Auth          | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session                                        |
| Core loop     | add item, barcode scan (camera allow/deny/deny-then-enable), inventory edit/delete, mark recipe made decrements stock                    |
| Notifications | local alert fires at the right time, taps route to the item, permission denied handled                                                   |
| Paywall       | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow                                                           |
| AI credits    | balance shows on chat + profile, spend decrements it, 0 credits routes to /credits, pack purchase tops up, Pro renewal grants the bundle |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe                                                    |
| Network       | airplane mode on every screen, slow 3G, API 500s, retry paths                                                                            |
| Lifecycle     | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly                                                  |
| Compliance    | account deletion from a clean install, privacy-policy link opens, demo account works fresh                                               |
