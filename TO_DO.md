# ThatFridge — TO DO (iOS launch + RevenueCat Shipaton 2026)

Consolidates the old `APP_STORE_LAUNCH_PLAN.md` + `SHIPATON_2026.md`.

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native Expo /
React Native — no Capacitor, no WebView. This launch is also our **RevenueCat Shipaton 2026**
entry.

**Hard deadline: Sep 30, 2026, 11:45 pm PDT.** The app must be **fully published and live**
(Apple review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-08-28):** every core screen + most of the web feature set is ported to
`apps/mobile` at visual parity with `apps/web` (see §7). The RevenueCat SDK, entitlement,
`default` offering, and a published AI-designed paywall are done. **The critical path is now the
external accounts (§1) — none started.** Working branch: `mobile-app` (not merged to `main`).

Legend: ✅ done · 🟡 partial · ⬜ not started · 🔒 blocked on external setup

---

## 1. Critical path — external accounts (Member A) 🔒

Everything downstream is blocked on these. They take days to weeks. **Start today.**

- [ ] **Apple Developer Program enrollment — Individual** (Organization needs a D-U-N-S number,
      weeks). #1 schedule risk; if not cleared within a week, escalate to Apple support / check
      if a teammate has an active account.
- [ ] **App Store Connect: Paid Apps Agreement + banking + tax** — needs real tax info; until
      active, IAPs can't be tested and the Shipaton requirement can't be met. Start the **same
      day** as enrollment.
- [ ] Domain for the API host + privacy-policy / terms pages.
- [ ] **Buy the PixelMix commercial licence** ($25, andrewtyler.gumroad.com/l/pixelmix) —
      required before a commercial App Store release. See `assets/fonts/PixelMix-NOTES.md`.
- [ ] Confirm each team member's Shipaton eligibility: age of majority, not a sanctioned
      country, not RevenueCat / sponsor staff.

**Don't:** market ThatFridge as "launched" anywhere (public TestFlight link, ProductHunt,
press) before the store listing is live — risks the Shipaton "brand-new app" disqualification.
Private TestFlight is fine.

---

## 2. Backend / infra (Member A)

- [ ] Deploy Laravel to the VPS: Nginx, PHP 8.2+, `migrate --force`, `config:cache`,
      `route:cache`, HTTPS on `api.thatfridge.<domain>`, `APP_DEBUG=false`, fresh `APP_KEY`,
      rate-limit auth routes.
- [ ] Hosted Postgres + Redis; daily backups; queue worker + scheduler under systemd (freshness
      notifications depend on the scheduler).
- [ ] Seed a stable **reviewer demo account** on prod with realistic data (replace
      `backend/scripts/seed-demo-fridge.sh`).
- [ ] Sentry on the Laravel app.
- [ ] Privacy policy + Terms pages on `apps/web`, deployed, public URLs (content: Member D).
- [x] `DELETE /api/me` endpoint + tests (hard-deletes user + tokens + owned fridges).

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

**Left (Member A, once the Apple account exists):**

- [ ] App Store Connect: create `thatfridge_pro_monthly` + `thatfridge_pro_yearly` subscription
      products (one group), each with a 7-day intro offer.
- [ ] RevenueCat: add a real **App Store app** (`test.thatfridge.app`) alongside the test store;
      App Store shared secret + App Store Connect API key; remap the offering's packages to the
      real products.
- [ ] Swap the test-store key for the real `appl_…` App Store key in `.env` / EAS env.
- [ ] Verify a **sandbox purchase + restore** end-to-end; `thatfridge_pro` gate works both ways.

---

## 4. Mobile app (Members B / C / D)

- [ ] **First `eas build --profile development`** (dev client) so barcode scan, local
      notifications, and RevenueCat can actually be tested. Simulator builds need no paid Apple
      account (`eas.json` dev profile has `ios.simulator: true`).
- [ ] Full **smoke-test on a real device / simulator** — nothing since the parity port has run.
- [ ] Bottom-sheet **grab-to-dismiss** gesture on modal screens (needs
      `react-native-gesture-handler` root wiring).
- [ ] Native-feel pass: haptics, safe-area audit on every screen, keyboard-avoiding views,
      offline banners / sync-error toast.
- [ ] Finish `apps/web/lib/thatfridge` → `packages/core` extraction; point `apps/web` at the
      package. (Most Home + score logic already moved.)
- [ ] **Merge `mobile-app` → `main`** — additive, web app untouched. Don't let it drift further.
- [ ] EAS Update production channel wired.

**Locked decisions — no re-litigation:** NativeWind · Expo Router · pnpm workspaces + turborepo ·
Node 20 · bundle id `test.thatfridge.app` · iOS target 15.1 · Apple enrollment Individual · v1
notifications local/on-device (server push is post-launch) · Android deferred entirely · one
universal UI codebase (`react-native-web` renders `apps/mobile` in a browser; legacy `apps/web`
retired once web output ships — post-launch) · signing keys + Apple assets in a shared password
manager from day one.

---

## 5. Store submission assets (Members A / D)

- [ ] App icon **1024×1024**.
- [ ] iPhone **6.9" + 6.5"** screenshots — **no device frame**, 1179×2556.
- [ ] Store listing: description, subtitle, keywords, support URL.
- [ ] App Privacy ("nutrition labels") form — complete and accurate.
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

`packages/core` gained ~47 API methods + `home.ts` / `progress.ts` (scoring, streak, goals,
badge catalog, shopping recs, `getScoreTrend`, `routeChatAgent`, `suggestItemDetails`, …).

### Still open vs. the web (post-launch, all JS-only OTA)

- **§D "Opened it" item state** — mobile `/fridges` payload has no `opened` field; needs a
  backend Item + resource change.
- **Voice input** in chat — needs a native STT module (no Expo one).
- **AI icon generation** — `GenerateIconRow` / `GeneratedIconLibrary` (`/icons/generate`); the
  full ~165-PNG icon pack (mobile ships ~10 core pixel grids + initials fallback).
- **`MarkRecipeMadeSheet`** — "which ingredients did you actually use" reconciliation (mobile
  calls `mark-made` with none).
- **Recipe photo/video attachments** (`/recipes/attachments`); `AttachmentLightbox`.
- **Scan the printed expiry date** (`/items/expiry-scan`).
- **AgentScoreCard extras** — Chef 5-food-group coverage icons, Organizer completion ring,
  Shopkeeper receipt bar (mobile shows a plainer per-agent row).
- **Score sparkline** (`getScoreSeries`); **richer notification-settings** (agent GIF icons +
  grouped sections).
- **Sheet enter animations** (`pop` / slide-up) · **wide-viewport (≥900px) layouts** on
  Home / Inventory / Chat (bundled with the web-deployment work below).
- Server-driven **push** (APNs auth key + FCM + device-token endpoint + backend sends).
- **Android:** `eas build -p android`; Play Console (register as an organization to skip the
  12-tester / 14-day closed-testing gate); Data Safety form; screenshots; submit.
- **Web deployment** (universal codebase): `expo export -p web` → host the static build; add
  wide-viewport branches; `Platform.OS === "web"` guards; then retire `apps/web` and point the
  domain at the new build. iPad layout pass rides along.

---

## 8. Pre-submission checklist

- [ ] Prod API on HTTPS, `APP_DEBUG=false`, queue + scheduler running, backups on
- [ ] App built against prod `EXPO_PUBLIC_API_URL`; no localhost reachable
- [ ] Account deletion works from a clean install
- [ ] Privacy policy + terms URLs live and linked in-app
- [ ] Camera permission string set; `ITSAppUsesNonExemptEncryption` set
- [ ] Local notifications fire correctly and route on tap
- [ ] RevenueCat: sandbox purchase + restore verified; `thatfridge_pro` gate works both ways
- [ ] 7-day free trial active (doubles as judge access)
- [ ] Icon 1024², splash, iPhone 6.9" + 6.5" screenshots (no device frame — 1179×2556)
- [ ] App Privacy form complete and accurate · Age rating done
- [ ] Demo account + review notes filled in
- [ ] TestFlight build validated by all 4 members on real devices
- [ ] Crash-free session confirmed in Sentry
- [ ] Version 1.0.0, build number set, release set to **manual**
- [ ] EAS Update production channel wired
- [ ] Devpost submission drafted

---

## 9. QA matrix (Member A owns the process; whole team runs it)

| Area | Checks |
|---|---|
| Devices | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device |
| Auth | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session |
| Core loop | add item, barcode scan (camera allow / deny / deny-then-enable), inventory edit/delete, mark recipe made decrements stock |
| Notifications | local alert fires at the right time, taps route to the item, permission denied handled |
| Paywall | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe |
| Network | airplane mode on every screen, slow 3G, API 500s, retry paths |
| Lifecycle | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly |
| Compliance | account deletion from a clean install, privacy-policy link opens, demo account works fresh |

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
