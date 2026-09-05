# ThatFridge — TO DO (iOS launch + RevenueCat Shipaton 2026)

Consolidates the old `APP_STORE_LAUNCH_PLAN.md` + `SHIPATON_2026.md`.

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native Expo /
React Native — no Capacitor, no WebView. This launch is also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia + South Korea. API hosted in Singapore; v1 app UI English-only,
localized store listings + Korean UI fast-follow — see §4a.

**Hard deadline: Sep 30, 2026, 11:45 pm PDT.** The app must be **fully published and live**
(Apple review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-08-28):** every core screen + most of the web feature set is ported to
`apps/mobile` at visual parity with `apps/web` (see §7). RevenueCat SDK, entitlement, `default`
offering, and a published AI-designed paywall are done. **Backend infra is done:** the API is
live at `https://api.thatfridge.com` with GitHub Actions CD (test → auto-deploy), TLS, backups,
queue + scheduler; the legal site is live at `https://thatfridge.com`; email routing works.
**`main` is the only working branch** (the `mobile-app` feature branch was retired 2026-08-30).
**Apple Developer enrollment approved, first TestFlight build (v1.0.0) submitted.** CD:
merge to `main` → OTA `eas update` to the `production` channel (JS); `git tag v1.0.x` →
`eas build` + TestFlight submit (native). See `apps/mobile/CONTRIBUTING.md`.

Legend: ✅ done · 🟡 partial · ⬜ not started · 🔒 blocked on external setup

---

## 1. Critical path — external accounts (Member A)

- [X] **Apple Developer Program enrollment — Individual** — approved 2026-08-28, Team ID issued.
- [🟡] **App Store Connect: Paid Apps Agreement + banking + tax** — W-8BEN submitted (Malaysian
  individual, no US treaty → 30% withholding on US sales only; FTIN = LHDN tax number).
  **Confirm the Paid Applications agreement shows "Active"** (bank + tax rows green) — processing
  takes ~1–2 days. IAPs can't be tested until it's Active.
- [X] Domain + privacy/terms/support pages (2026-08-28). `apps/legal/` deployed as a
  Git-connected Cloudflare Worker (static assets); **live at `https://thatfridge.com`** +
  `www` with TLS, auto-redeploy on push to `main`. Placeholders filled (operator *Muhammad
  Naufal Kamaruddin*, Malaysian law). `api.thatfridge.com` → `167.172.88.75` (§2).
  `support@` + `privacy@thatfridge.com` route via Cloudflare Email Routing to
  `naufalkmd00@gmail.com` — test mail to both confirmed received. (Receive-only; to *send*
  as `support@` later, add it in Gmail "Send mail as" with an SMTP provider.)
- [X] **Buy the PixelMix commercial licence** — bought via Sellfy ($25, 2026-08-28). EULA saved
  at `apps/mobile/assets/fonts/PixelMix-EULA.docx`. **Two follow-ups** (see
  `PixelMix-NOTES.md`): (a) the desktop EULA doesn't clearly grant app/web *embedding* — email
  font@andrewtyler.net for written confirmation and keep it with the receipt; (b) drop the
  unofficial `PixelMix-Bold.ttf` (unused; EULA forbids DIY weights).
- [X] Confirm each team member's Shipaton eligibility: age of majority, not a sanctioned
  country, not RevenueCat / sponsor staff.
- [X] **Sign in with Apple / Google.** Both flows built (`POST /auth/apple` + `/auth/google`
  with JWKS verification; mobile buttons that hide themselves until configured) and now fully
  configured — 2026-09-05.
  - [X] **Apple** — "Sign In with Apple" capability enabled on App ID `test.thatfridge.app`.
  - [X] **Google** — Cloud project + OAuth consent (Google Auth Platform) created, iOS + Web
    OAuth clients created. `GOOGLE_IOS_URL_SCHEME` + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` set on
    EAS `production` + local `.env`; `GOOGLE_CLIENT_IDS` set + `config:cache`d on the server
    (confirmed via `php artisan config:show services.google.client_ids`). New native build
    shipped with both. Google's sign-in button also restyled to match Apple's exact button
    metrics (fixed height 48, pure white, same corner radius — was visibly mismatched before).
  - Details: `apps/mobile/RELEASE.md` → "Sign in with Apple / Google".

**Don't:** market ThatFridge as "launched" anywhere (public TestFlight link, ProductHunt,
press) before the store listing is live — risks the Shipaton "brand-new app" disqualification.
Private TestFlight is fine.

---

## 1a. Cost tracker

All USD, approximate. "Recurring" = keep paying to keep the app live.

| Item                                    | Cost         | Type      | Status   | Notes                                                                        |
| --------------------------------------- | ------------ | --------- | -------- | ---------------------------------------------------------------------------- |
| Apple Developer Program                 | $99 / yr     | Recurring | ✅ Paid  | Individual enrollment                                                        |
| Domain —`thatfridge.com`             | ~$10.46 / yr | Recurring | ✅ Paid  | API host + privacy/terms/support pages                                       |
| PixelMix commercial font licence        | $25          | One-time  | ✅ Paid  | via Sellfy 2026-08-28; embedding confirmation still pending (§1)            |
| VPS — Laravel API + Postgres + Redis   | $21.60 / mo  | Recurring | ✅ Live  | DigitalOcean **SGP1**, 2 vCPU / 2 GB ($18) + weekly backups ($3.60). `api.thatfridge.com` → `167.172.88.75`. Deployed 2026-08-28. |
| Privacy / terms / support pages hosting | $0           | —        | ✅ Live | Cloudflare Workers static assets (free), `thatfridge.com`                     |
| Cloudflare Email Routing                 | $0           | —        | ✅ Live | `support@` / `privacy@thatfridge.com` → Gmail                                 |
| Sentry (crash monitoring)               | $0           | —        | ⬜       | Free developer tier (§2)                                                    |
| RevenueCat                              | $0           | —        | ✅       | Free under $2.5k tracked revenue / mo                                        |
| Expo EAS builds                         | $0           | —        | ✅       | Free tier covers launch build cadence                                        |
| Devpost / Shipaton entry                | $0           | —        | —       | Free                                                                         |
| Google Play Console                     | $25          | One-time  | ⬜ Later | Post-launch — Android deferred                                              |

**Paid to date: ~$135** (Apple $99 + domain ~$10.46 + PixelMix $25), plus the VPS now running
at **$21.60/mo**. Possibly still due: a transactional-email plan (most have a free tier).
Ongoing after launch: ~$99/yr (Apple) + ~$10/yr (domain) + $21.60/mo (VPS) ≈ **$370 / yr**.

---

## 2. Backend / infra (Member A)

- [X] Deploy Laravel to the VPS (2026-08-28) — live at `https://api.thatfridge.com` (HTTP 200 on
  `/up`, auth + `/api/fridges` verified). Ubuntu 24.04, **PHP 8.5** (ondrej PPA — lock needs
  Symfony 8), Nginx, Postgres 16, Redis 7, Certbot (auto-renew, expires Nov 26), `APP_DEBUG=false`,
  queue + scheduler systemd units, daily pg_dump + storage backup. **CD:** `.github/workflows/deploy-api.yml`
  (push to `main` → PHPUnit → SSH `backend/scripts/deploy.sh`); runbook `backend/DEPLOY.md`.
- [X] GitHub Actions CD secrets (`DEPLOY_HOST` `DEPLOY_USER` `DEPLOY_SSH_KEY`) added — full
  pipeline verified green (manual `workflow_dispatch` run deployed `6dbc889` to the box).
- [X] Rate-limit `/api/login` + `/api/register` (`throttle:6,1`, same limiter as
  forgot/reset-password) — 2026-09-05.
- [ ] Copy backups off-box (DO weekly droplet snapshot is on — add pg_dump → object storage).
- [X] Seed a stable **reviewer demo account** on prod — `keira@thatfridge.test` / `password123`
  with a seeded fridge + 7 curated recipes. **⚠ Change the password before submitting.**
- [🟡] Sentry on the Laravel app — `sentry/sentry-laravel` installed, wired into
  `bootstrap/app.php`, no-ops until `SENTRY_LARAVEL_DSN` is set (2026-09-05). Left: create a
  Sentry project, paste the DSN into the server `.env`, redeploy.
- [X] **Transactional email — mailer wired up and verified live** (2026-09-05). Went with
  **Resend**, not SMTP via `support@thatfridge.com` — that address is Cloudflare Email Routing
  (receive-only forwarding to Gmail), not an actual sendable mailbox, so the SMTP option in this
  TO_DO's old wording wasn't really "ready" the way it sounded. Domain verified (DKIM +
  SPF/MX on the `send` subdomain — doesn't touch the root domain's existing mail routing).
  `MAIL_MAILER=resend` + `RESEND_API_KEY` + `MAIL_FROM_ADDRESS=support@thatfridge.com` set on
  the server, `config:cache`d. Confirmed end-to-end: real `POST /forgot-password` calls against
  prod, reset-code emails actually landed in two different real inboxes (iCloud + Gmail).
  (Hit one snag along the way: first API key pasted wasn't actually a Resend key — 36 chars, no
  `re_` prefix, likely a domain/project ID copied by mistake — caught via
  `Resend\Exceptions\ErrorException: API key is invalid` in `storage/logs/laravel.log`, fixed by
  regenerating the real key.)
- [X] `config/cors.php` already restricted — `allowed_origins` is empty, only a
  localhost/127.0.0.1 pattern is allowed (checked 2026-09-05). This line was stale; nothing
  needed for now since `apps/web` is the frozen legacy SPA and never deployed — revisit
  `allowed_origins` once a real browser-facing origin ships (react-native-web build, per §7).
- [X] Privacy / Terms / Support pages — live at `https://thatfridge.com` (see §1; `apps/legal/`,
  Git-connected Cloudflare Worker, auto-redeploy on `main`).
- [X] `DELETE /api/me` endpoint + tests (hard-deletes user + tokens + owned fridges).

---

## 3. RevenueCat / IAP

**Done (Member B):** `react-native-purchases` + `-ui` v10 wired · `Purchases.configure()` on
launch with `EXPO_PUBLIC_RC_IOS_KEY` · `usePro()` → `entitlements.active.thatfridge_pro` ·
`paywall.tsx` (hosted `RevenueCatUI.Paywall` + custom fallback) · Customer Center from Profile ·
`Purchases.logIn(user.id)` · restore on Profile + paywall · free-tier gate: 5 AI-chat
messages/week (`src/lib/chatQuota.ts`, client-side ISO-week counter → move server-side
post-launch) + receipt/photo add Pro-gated.

**Done (dashboard):** RevenueCat project `ThatFridge`, `thatfridge_pro` entitlement, `default`
offering (`$rc_monthly` + `$rc_annual` on test-store `monthly`/`yearly` products), and a
**published AI-designed paywall** on the offering — App-Store-compliant (visible restore link,
auto-renew terms).

**Monetization design:** two auto-renewing subs — `thatfridge_pro_monthly` +
`thatfridge_pro_yearly` — both with a **7-day free trial** (the trial doubles as judge access,
so no promo codes). Pro unlocks: unlimited AI chat / what-to-eat, receipt & photo bulk-add,
multiple / shared fridges, advanced notification tuning.

**Left (Member A — Apple account is now approved, Team ID issued 2026-08-28):**

- [🟡] **App Store Connect → Subscriptions.** One group ("ThatFridge Pro"), created. Two
  products, **permanent IDs** (never reusable — don't typo):
  - [X] `thatfridge_pro_monthly` — 1 month, price **$2.99**, 7-day free trial, English
    localization, review screenshot — status **Ready to Submit** (2026-09-05).
  - [X] `thatfridge_pro_yearly` — 1 year, price **$19.99**, 7-day free trial, English
    localization, review screenshot — status **Ready to Submit** (2026-09-05).
  - Both show Apple's "first subscription must be submitted with a new app version" notice —
    expected; they ride along with the real App Store version submission later (§5), not
    submitted standalone.
  - [ ] **Per-storefront price points** still not set: Malaysia `RM12.90` / `RM89`; South
    Korea `₩3,900` / `₩25,000` (round the ugly auto-conversions).
  - [ ] Korean + Malay localizations — skippable for v1, add later as a metadata update (§4a).
- [X] RevenueCat: real **App Store app** added (`test.thatfridge.app`) alongside the test
  store — In-App Purchase key configured + validated (2026-09-05). `thatfridge_pro_monthly` /
  `thatfridge_pro_yearly` registered as RC products, attached to the `thatfridge_pro`
  entitlement and to the existing `$rc_monthly` / `$rc_annual` packages (so the published
  paywall serves both test-store and real App Store products with no paywall changes needed).
- [X] RC paywall editor already used **variables** (`{{ product.price_per_period_abbreviated }}`)
  for price text, not a hardcoded price — confirmed, no change needed.
- [X] Real `appl_…` App Store key set as `EXPO_PUBLIC_RC_IOS_KEY` on the EAS **production**
  environment (2026-09-05) — previously **completely unset**, meaning no TestFlight build to
  date had ever initialized `Purchases.configure()`. Local `.env` still has the test-store key
  (fine for local/simulator dev). New TestFlight build shipped with the real key same day.
- [X] Verified a **sandbox purchase + restore** end-to-end (2026-09-05) — bought
  `thatfridge_pro` on the fixed TestFlight build via a sandbox tester Apple ID, entitlement
  unlocked. Reinstalled the app fresh and Pro was active immediately (RevenueCat auto-syncs
  with StoreKit on `Purchases.configure()` — no manual restore needed, which is itself the
  strongest possible proof the full pipeline works). §3 is now fully done except per-storefront
  MY/KR pricing and Korean/Malay localization (both deferred, see above).

---

## 4. Mobile app (Members B / C / D)

- [X] **`eas build`** — dev-client simulator build (`development-prod`) verified against the
  live API; **production build 1 submitted to TestFlight 2026-08-28** (`eas build/submit`,
  automated in `.github/workflows/testflight.yml`).
- [X] **Cut v1.2.0** — tag exists, and today's TestFlight builds (§3) already shipped multiple
  `1.2.0` builds via CI, including Apple sign-in, voice dictation (now genuinely on-device), and
  push entitlement. Sandbox purchase + restore verified on-device (§3).
- [ ] Full **smoke-test on a real device / simulator** against the live API — today's testing
  covered the paywall/purchase flow; the rest of the app (inventory, chat, notifications, social)
  hasn't had a dedicated pass since the parity port.
- [X] Bottom-sheet **grab-to-dismiss** gesture — 2026-09-05. Scope turned out narrower than it
  sounded: the ~12 `presentation: "modal"` navigation *screens* already had native
  swipe-to-dismiss for free (that's standard iOS behavior via `@react-navigation/native-stack`,
  nothing to build). The real gap was two custom in-screen `<Modal>`-based sheets
  (`MoveToSheet` in `inventory.tsx`, the date picker in `add.tsx`) that had a decorative drag
  handle bar with no actual gesture behind it, and `GestureHandlerRootView` was missing from
  the root layout entirely (needed for gestures to work inside a `<Modal>`, which portals
  outside the normal view tree). Built a shared `@/components/bottom-sheet.tsx` (drag lives on
  the handle only, so a `ScrollView` in the sheet body still scrolls normally) and wired
  `GestureHandlerRootView` into `_layout.tsx`; both existing sheets now use it.
- [ ] Native-feel pass: haptics, safe-area audit on every screen, keyboard-avoiding views,
  offline banners / sync-error toast.
- [ ] Finish `apps/web/lib/thatfridge` → `packages/core` extraction; point `apps/web` at the
  package. (Most Home + score logic already moved.)
- [X] **`mobile-app` → `main`** merged 2026-08-28; feature branch retired 2026-08-30 —
  `main` is now the working branch (see `apps/mobile/CONTRIBUTING.md`).
- [X] **Mobile CD, two lanes:**
  - `.github/workflows/eas-update.yml` — merge to `main` touching `apps/mobile/**` /
    `packages/**` → typecheck → `eas update --branch production` (OTA, testers get it on
    next launch).
  - `.github/workflows/testflight.yml` — `git tag v*` or manual → `eas build -p ios
    --profile production --auto-submit` to TestFlight.
  - One-time setup in `apps/mobile/RELEASE.md` (ASC API key → `eas credentials`, `EXPO_TOKEN`
    secret, `ascAppId` — **done**). Workflow: `apps/mobile/CONTRIBUTING.md`.

**Locked decisions — no re-litigation:** NativeWind · Expo Router · pnpm workspaces + turborepo ·
Node 20 · bundle id `test.thatfridge.app` · iOS target 15.1 · Apple enrollment Individual · v1
notifications local/on-device (server push is post-launch) · Android deferred entirely · one
universal UI codebase (`react-native-web` renders `apps/mobile` in a browser; legacy `apps/web`
retired once web output ships — post-launch) · signing keys + Apple assets in a shared password
manager from day one · **v1 app UI is English-only** (see §4a).

---

## 4a. Localization & regional compliance — target markets 🇲🇾 🇰🇷

**Markets:** Malaysia + South Korea. API hosted in **Singapore** (best latency for both — see
`backend/DEPLOY.md`). Malaysians are comfortable in English; Korean users expect a Korean UI.

**Decision (2026-08-28): English-only app UI for v1; localized store listings; Korean UI as a
post-launch OTA fast-follow.**

- [ ] **App Store Connect — localized metadata** for `en`, `ko`, `ms`: name/subtitle, description,
  keywords, and **localized screenshots** (at minimum `ko`). Korean downloads depend on this.
- [ ] Set App Store **availability** to include Malaysia + South Korea (and pick the wider
  region set — no reason to geo-restrict).
- [ ] **Pricing:** create the sub price points; App Store + RevenueCat auto-localize to MYR /
  KRW. Confirm the KRW price reads as a clean number and is VAT-inclusive (Apple handles VAT).
- [🟡] **Korea PIPA:** privacy contact already named (`apps/legal/privacy/index.html` §10 —
  Muhammad Naufal Kamaruddin, privacy@thatfridge.com), checked 2026-09-05. Still genuinely open:
  - [ ] **Korean-language privacy policy** — `/privacy/ko/` is still a 404 (confirmed live,
    2026-09-05), just a promise-to-publish in the English page. Needs an actual Korean
    translation — not something to machine-translate unsupervised for a legal document; get a
    native/professional pass.
  - [X] **Separate consent for cross-border transfer** at sign-up — a real checkbox on
    `sign-in.tsx` (2026-09-05), distinct from the general Terms/Privacy notice, gating
    submission (`validate()` rejects an unchecked box). Backend requires and records it:
    `dataTransferConsent` is a required+accepted field on `POST /register`,
    `users.data_transfer_consented_at` set server-side (never client-suppliable as a
    timestamp, only a boolean triggers `now()`, so it can't be backdated). 3 new backend tests.
    **Known gap:** only covers email/password sign-up — `AuthController::apple()`/`google()`
    create users too (social sign-in) and don't go through this consent gate. Fixing that needs
    a pre-OAuth consent interstitial for new users, a bigger UX task not done here.
- [X] **Malaysia PDPA (2010, amended 2024):** already covered — consent-at-sign-up language,
  breach-notification commitment, and a named contact (privacy@thatfridge.com) all already in
  `apps/legal/privacy/index.html` §10. Checked 2026-09-05, nothing to add.
- [X] **Minimum sign-up age 14+** — Terms already had it (§2); added the same statement + a
  Terms/Privacy link to the signup screen itself (`sign-in.tsx`, 2026-09-05), which had neither
  before.
- [X] **Guideline 1.2 (UGC safety):** fridge sharing + username search + join-requests are
  invite-only (low risk), but added a **"block user"** action + a **report** path (mailto,
  as the TO_DO said email is acceptable) — 2026-09-05. New `blocks` table; blocking hides both
  users from each other's search and blocks future join-requests/invites either direction
  (existing memberships/pending requests aren't touched — out of scope, either side can
  decline/leave normally). UI: `find-friend.tsx`'s profile view, "⋯" menu → Block/Report. 12 new
  backend tests, all passing (269 total).
- [ ] Post-launch OTA: wire `react-i18next` + `expo-localization`, externalize strings, ship
  `ko` (and optionally `ms`) translations. No rebuild needed if done as an EAS Update.

---

## 5. Store submission assets (Members A / D)

- [X] App icon **1024×1024** — already existed (`assets/images/icon.png`), but had an alpha
  channel (fully opaque, no visible transparency, but App Store Connect's icon validator
  rejects *any* alpha channel on the 1024² upload regardless). Flattened to RGB 2026-09-05 —
  same art, ready to upload as-is. Corners are already square (Apple applies its own mask).
- [ ] iPhone **6.9" + 6.5"** screenshots — **no device frame**, 1179×2556.
- [🟡] Store listing: description, subtitle, keywords, support URL — **drafted** in
  `apps/mobile/STORE_LISTING.md` (2026-09-05), needs a review pass before pasting into ASC.
- [🟡] App Privacy ("nutrition labels") form — **drafted** in `apps/mobile/STORE_LISTING.md`,
  grounded in the actual data the app/backend collect. Caught and fixed one real gap while
  drafting: voice dictation wasn't actually on-device (RELEASE.md's claim didn't match
  `voice.ts`) — `requiresOnDeviceRecognition: true` added 2026-09-05, now true.
- [ ] Age rating.
- [ ] App Review notes with demo credentials.
- [ ] Guideline 4.2 rebuttal ready (native camera, notifications, haptics, native nav) in case
  of a thin-wrapper rejection.
- [ ] Decide Google Play account type (personal vs organization) — for the post-launch Android
  submission.

---

## 6. Shipaton / Devpost (Member D)

- [ ] Devpost project page: feature description.
- [ ] Demo video **≤ 2:00**, public on YouTube/Vimeo, **no copyrighted music/footage**.
- [ ] #BuildInPublic: a public thread / dev log, updated 2–3×/week (the plan, the parity port,
  the published paywall, clean git history are good posts).
- [ ] Peace Prize: short impact statement (household food-waste → savings + environmental).
- [ ] App Store URL on the submission.
- [ ] **Submit on Devpost before Sep 30, 2026, 11:45 pm PDT.**

**Prize targets — commit to Peace Prize + #BuildInPublic + Design Award.** (Grand Prize needs
sustained MRR/growth an app ~2 weeks live can't show; skip Catvertising — off-thesis for a paid
utility. Consider OneSignal ($25k, retention/push) only if push goes server-driven anyway.)

**Design Award angle:** "dark neon pixel tech" system, PixelMix font, the AI-crew concept — the
native port now matches the web app screen-for-screen.

---

## 7. Screen / feature parity status

Every core screen is at **visual parity with `apps/web`** (the bar since 2026-08-28). Built and
in the app: Auth · Home (Kitchen-Score SVG gauge wired to `usage-history` / `organizer-tally` /
`score-snapshots`, animated CrewScene, fridge hero carousel + palette button, swipe-dismiss crew
tips, read-only note squares) · Inventory + item detail (sort, category filter, section
reassignment) · Search · Add (method picker; barcode + manual + **receipt/photo AI bulk-add** +
**auto-fill**, receipt/photo Pro-gated) · **Crew / FoodHub** (Recipes library + what-to-eat FAB
/ Shopping / Guardian risk bands / Organizer per-location move + sweep) · Chat (auto-routed
agent, greeting, history icon, animated typing, photo attach, add-to-recipe-book, memory
extract) · Notifications (feed + pending social rows + settings) · Shopping list (+
recommendations) · Profile (+ Your fridges, links to Goals/Badges/AI-Data/About) · Recipe book +
`recipe/[id]` + `recipe-form` (import-from-link) · Goals · Badges (unlock via
`postBadgeProgress`) · AI Data & Memory · Chat History · About · **multi-fridge & social**
(`find-friend`, `fridge/[id]` manage: rename / style photo / custom upload / members / invites /
join requests / leave-delete) · fridge sticky notes · floating-pill tab bar (Home · Inventory ·
＋ · Chat · Crew) · skeleton loaders.

`packages/core` gained ~55 API methods + `home.ts` / `progress.ts` / `food-icons.ts` (scoring,
streak, goals, badge catalog, shopping recs, `getScoreTrend` / `getScoreSeries` /
`getFoodGroupCoverage`, `routeChatAgent`, `suggestItemDetails`, `scanExpiryPhoto`,
`generateIcon`, `guessFoodIcon`, …).

### Done 2026-08-28 (parity pass, all JS-only OTA except the "opened" column)

Kitchen Score sparkline (`getScoreSeries`) · per-agent visuals — Chef food-group icons /
Organizer ring / Shopkeeper bar (`getFoodGroupCoverage`) · grouped notification settings with
agent GIF badges · `MarkRecipeMadeSheet` (`recipe/mark-made`, ingredient↔item reconcile) ·
scan the printed expiry date (`core.scanExpiryPhoto`) · recipe photo/video attachments (upload
in `recipe-form` + image lightbox `recipe/attachment`) · AI icon generation (`icon-picker`) ·
the **full 164-icon pixel-art pack** + `core.guessFoodIcon` (items show real icons, not
initials) · pre-scaled all pixel assets nearest-neighbor (no more upscale blur) · **"Opened
it" item state** persisted (`items.opened` column, freshness capped when opened) · CategoryTag
→ icon. Sheet-enter animation = n/a (native modal slide-up already; grab-to-dismiss is §4).

### Still open vs. the web

- **Real-device pass** for the receipt/photo scan review's full pick-photo → OCR → confirm
  cycle (UI itself already verified on the simulator).
- **wide-viewport (≥900px) layouts** on Home / Inventory / Chat — bundled with Web deployment
  below.
- **Android:** `eas build -p android`; Play Console (register as an organization to skip the
  12-tester / 14-day closed-testing gate); Data Safety form; screenshots; submit.
- **Web deployment** (universal codebase): `expo export -p web` → host the static build; add
  wide-viewport branches; `Platform.OS === "web"` guards; then retire `apps/web` and point the
  domain at the new build. iPad layout pass rides along.

Everything else audited at parity: all 21 web screens exist; fridge-notes CRUD, Customer
Center (mobile is richer here), what-to-eat (shuffle/vibes/meal-type/food-focus/exact+similar),
chat photo-attach + memory extract + add-to-recipe-book, shopping recommendations, hero
carousel + swipe-dismiss agent insights, undo toasts, skeleton loaders, voice dictation (mic
button in chat composer), server-driven push (`Notifier` + APNs), icon generation in the
manual Add form (shared `ItemCard`, same as scan review), Organizer per-move dismiss — all
present, shipped in v1.2.0. (Last two confirmed 2026-09-05 — TO_DO had them listed as still
open; code already had both.)

---

## 8. Pre-submission checklist

- [X] Prod API on HTTPS, `APP_DEBUG=false`, queue + scheduler running, backups on (2026-08-28)
- [ ] App built against prod `EXPO_PUBLIC_API_URL`; no localhost reachable (`eas.json`
  preview/production done; verify at build time)
- [ ] Account deletion works from a clean install (against the live API)
- [X] Privacy / terms / support URLs live (`thatfridge.com`) — [ ] still confirm they're linked in-app
- [X] Transactional email working (password reset) — Resend wired up, verified end-to-end
  against prod 2026-09-05 (§2)
- [X] Camera permission string set (`app.config.ts`'s `expo-camera` plugin config); `ITSAppUsesNonExemptEncryption: false` already set — both confirmed already present, checked 2026-09-05
- [ ] Local notifications fire correctly and route on tap
- [ ] RevenueCat: sandbox purchase + restore verified; `thatfridge_pro` gate works both ways
- [ ] 7-day free trial active (doubles as judge access)
- [ ] Icon 1024², splash, iPhone 6.9" + 6.5" screenshots (no device frame — 1179×2556)
- [ ] App Privacy form complete and accurate · Age rating done
- [ ] Demo account + review notes filled in
- [🟡] TestFlight build validated by all 4 members on real devices — **build 1 (v1.0.0) submitted 2026-08-28** via `eas build/submit`; processing at App Store Connect. Add internal testers + a "What to Test" note.
- [ ] Crash-free session confirmed in Sentry
- [ ] Version 1.0.0, build number set, release set to **manual**
- [X] EAS Update production channel wired · TestFlight CI (`.github/workflows/testflight.yml`)
- [ ] Devpost submission drafted

---

## 9. QA matrix (Member A owns the process; whole team runs it)

| Area          | Checks                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Devices       | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device                                                                |
| Auth          | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session                         |
| Core loop     | add item, barcode scan (camera allow / deny / deny-then-enable), inventory edit/delete, mark recipe made decrements stock |
| Notifications | local alert fires at the right time, taps route to the item, permission denied handled                                    |
| Paywall       | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow                                            |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe                                     |
| Network       | airplane mode on every screen, slow 3G, API 500s, retry paths                                                             |
| Lifecycle     | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly                                   |
| Compliance    | account deletion from a clean install, privacy-policy link opens, demo account works fresh                                |

---

## 10. Top risks & mitigations

1. **Apple identity verification is slow (#1 risk).** Submit as an Individual now. Everything
   except TestFlight and submission works without a paid account (Expo dev client / simulator
   build). If not cleared within a week, escalate to Apple support.
2. **App Store Connect financials lead time.** Paid Apps Agreement + banking + tax take days and
   need real tax info. Until active, IAPs can't be tested and the Shipaton requirement can't be
   met. Start the same day as enrollment.
3. **Guideline 3.1.2 (subscription scrutiny).** Restore button, clear pricing, terms, no dark
   patterns — the published paywall is built to spec; keep it that way.
4. **Guideline 4.2 (thin-wrapper rejection).** Low for a real RN app, but keep native features
   visible; have a written feature-list rebuttal.
5. **"First public release" timing (Shipaton).** No public TestFlight link / press before the
   store listing is live, or risk the "not brand-new" disqualification.
6. **The deadline is a wall.** Sep 30, no extensions. A rejection on Sep 28 could end the run.
   Submit ~2 weeks early; team on-call for same-day resubmits.
7. **Scope creep.** Anything not already in the app is post-launch OTA. The paywall is
   mandatory — don't trade paywall / release-track time for a nice-to-have screen.
8. **Lost signing keys.** Shared password manager, from day one.

---

## 11. Architecture

```
thatfridge/                  (monorepo — pnpm workspaces + turborepo)
├── packages/core/           shared logic: HttpClient, createApi, types, domain/home/progress helpers
├── apps/mobile/             Expo + Expo Router — iOS + Android + web from one codebase. THE PRODUCT.
│   └── src/components/      universal UI primitives (brand, ui, food-icon, sheet, tab-bar, tags, home/*)
├── apps/web/                LEGACY Next.js SPA — frozen; retired once web output ships (post-launch)
└── backend/                 Laravel API — deploy + prod hardening
```
