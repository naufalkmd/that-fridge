# ThatFridge — iOS Launch Plan (Expo / React Native)

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native app
built with **Expo / React Native** — no Capacitor, no WebView.

**Target:** originally a 3-week sprint (15 working days). This launch is also our
**RevenueCat Shipaton 2026** entry ([`SHIPATON_2026.md`](SHIPATON_2026.md)), which sets a hard
outside deadline of **Sep 30, 2026** and adds two requirements: the **RevenueCat SDK powering
≥1 in-app purchase** (a "ThatFridge Pro" subscription + paywall) and the app being **live** by
that date.

**Team:** 4 people — roles in §4. Map them to A/B/C/D.

> **The plan works only if:** (a) the MVP scope in §3 holds — no additions mid-sprint;
> (b) Apple Developer enrollment is submitted immediately (the #1 schedule risk, §7);
> (c) the App Store Connect Paid Apps Agreement is started the same day (blocks all IAP work).

_Last updated: 2026-08-27 · working branch `mobile-app` (not yet merged to `main`)._

---

## 1. Status

Legend: ✅ done · 🟡 partial · ⬜ not started · 🔒 blocked on external setup

### Build — done

| Area                          | Detail                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Monorepo                   | pnpm workspaces + turborepo;`.npmrc` `node-linker=hoisted` for Metro; `frontend/` → `apps/web/` (frozen, untouched)                                                                                                                                                                                         |
| ✅`apps/mobile` scaffold    | Expo SDK 57, Expo Router, NativeWind, TypeScript;`app.config.ts` (bundle id `test.thatfridge.app`, camera string, mic off, `ITSAppUsesNonExemptEncryption=false`); `eas.json` dev/preview/prod profiles                                                                                                      |
| ✅`packages/core`           | platform-agnostic`HttpClient` (injected baseUrl + token store, `{data}` unwrap); `createApi` covering auth, fridge/section/item CRUD, barcode lookup, notifications, shopping, recipes, chat, account deletion; `domain.ts` (freshColor, daysLabel, timeAgo, nutrition/location constants); `flattenItems` |
| ✅ Auth                       | `AuthProvider` — login / signup (validation matches backend rules), token in `expo-secure-store`, session restore on launch, `index.tsx` redirect by status                                                                                                                                                   |
| ✅ Inventory                  | `InventoryProvider` (fetch / refresh / optimistic qty / delete / add / edit); list with sort + category filter, freshness bars, pull-to-refresh, FAB; `item/[id]` detail + full edit (name / location / food group / best-before / note)                                                                         |
| ✅ Add + scan                 | `add` modal (manual entry, auto-creates fridge + section for new accounts); `scan` screen (`expo-camera`, Open Food Facts lookup prefills add) — **needs dev build to run**                                                                                                                             |
| ✅ Home                       | greeting, item / expiring-soon stats, "use it up" list, quick-action grid, notification bell + unread badge, profile avatar, pull-to-refresh                                                                                                                                                                         |
| ✅ Notifications              | in-app feed (`/notification-events`, mark done / undo) + settings (`/notification-prefs` toggles); local `expo-notifications` expiry reminders rescheduled on every inventory sync, gated on pref + OS permission (best-effort, needs dev build to fire on iOS)                                                |
| ✅ Shopping list              | `ShoppingProvider` + screen — add / check / remove / clear-checked, optimistic                                                                                                                                                                                                                                    |
| ✅ What to eat                | `eat` screen — meal + vibe filters, `/recipes/suggest`, exact vs "almost" groups, expandable recipe cards, "I made this" → `mark-made` + inventory refresh                                                                                                                                                   |
| ✅ Chat                       | `chat` screen — agent picker (Chef / Guardian / Shopkeeper / Organizer), thread with history restore, inventory context, inline recipe-suggestion cards                                                                                                                                                           |
| ✅ Profile + account deletion | `profile` screen — user info, settings links, about, sign out, **two-step delete**; **backend `DELETE /api/me`** hard-deletes user + tokens + owned fridges (FK cascade), 2 tests, `AuthControllerTest` green                                                                                     |
| ✅ Dev data                   | `backend/scripts/seed-demo-fridge.sh` — local demo fridge with varied freshness                                                                                                                                                                                                                                   |
| ✅ Verification               | iOS bundle builds clean via Metro after every change; every endpoint above exercised against the live local API                                                                                                                                                                                                      |

### Build — remaining for v1.0

| Item                                            | Owner | Note                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟡**Paywall + RevenueCat**                | B     | code done —`react-native-purchases` + `react-native-purchases-ui`, `usePro()`, `paywall.tsx` (hosted + custom fallback), Customer Center, chat weekly-cap gate. **Needs:** RevenueCat dashboard (entitlement `thatfridge_pro`, offering with `monthly`/`yearly`, a paywall design), App Store Connect products, and a dev build to run |
| 🔒**`eas build --profile development`** | B     | dev client so barcode scan, local notifications, and RevenueCat can actually be tested — needs the Apple account                                                                                                                                                                                                                                           |
| 🟡 Tab bar chrome                               | D     | `(tabs)` group live — Home / Inventory / Eat / Alerts, Ionicons, unread badge; other screens push/modal over it. Bottom-sheet system + toast/undo still ⬜                                                                                                                                                                                            |
| ⬜ Item icon picker                             | C     | items show name initials; port`FoodIcon` + generated-icon library                                                                                                                                                                                                                                                                                         |
| ⬜ ChatHistoryScreen                            | C     | chat restores the latest session only; no session list / switch / delete                                                                                                                                                                                                                                                                                    |
| ⬜ Native-feel pass                             | C/D   | haptics, skeleton loaders, safe-area audit on every screen, offline banners                                                                                                                                                                                                                                                                                 |
| ⬜`lib/thatfridge` full extraction            | B     | ~half done incrementally; finish moving the pure modules + point`apps/web` at `packages/core` (see `packages/core/README.md`)                                                                                                                                                                                                                         |
| ⬜ Merge`mobile-app` → `main`              | —    | additive; web app untouched                                                                                                                                                                                                                                                                                                                                 |

### External setup — not started (long lead time, start now)

| Item                                                                           | Owner |
| ------------------------------------------------------------------------------ | ----- |
| 🔒 Apple Developer Program enrollment (**Individual**)                   | A     |
| 🔒 App Store Connect: Paid Apps Agreement + banking + tax (blocks IAP testing) | A     |
| 🔒 RevenueCat account + project +`pro` entitlement + offering                | A     |
| 🔒`thatfridge_pro_monthly` subscription + 7-day trial in App Store Connect   | A     |
| ⬜ Domain (API host + privacy-policy / terms pages)                            | A     |
| ⬜ Laravel API deployed to the VPS (HTTPS, Postgres, Redis, queue, scheduler)  | A     |
| ⬜ Proper backend demo-data seeder (replace the shell script)                  | A     |
| ⬜ Sentry on the Laravel app                                                   | A     |
| ⬜ Privacy policy + Terms pages on`apps/web`                                 | A/D   |
| ⬜ Devpost draft + start#BuildInPublic thread                                  | D     |
| ⬜ **Buy PixelMix commercial license** ($25, andrewtyler.gumroad.com/l/pixelmix) — required before the App Store (commercial) release; see `assets/fonts/PixelMix-NOTES.md` | A |
| ⬜ Decide Google Play account type (personal vs organization)                  | D     |

> **Where we stand:** the app's core loop is code-complete and runs end-to-end in Expo Go
> against a local API. Everything left is either gated on the external accounts above or is
> polish (chrome, icons, native feel). The build track is well ahead of the original timeline;
> the **release track (§4 Member A) has not started** and is now the critical path.

---

## 2. Approach

`apps/web/lib/thatfridge/` is **~5,850 LOC of portable logic** already separated from
**~9,100 LOC of web UI**. The logic moves into `packages/core` (mostly unchanged); only the UI
is rebuilt in React Native. What transfers: API calls, transforms, domain rules, validation.
What doesn't: every `<div>`/`className`/CSS — that's a hand-translation to `<View>` / `<Text>` /
NativeWind.

**Expo, not bare React Native:** EAS Build (cloud iOS builds), EAS Submit (CLI upload to App
Store Connect), EAS Update (OTA JS fixes, no re-review), maintained native modules. Prebuild /
config plugins are the escape hatch for custom native code.

**Locked decisions — no re-litigation:**

- Styling **NativeWind**; navigation **Expo Router**; **pnpm** workspaces + turborepo; Node 20.
- Bundle id `test.thatfridge.app`; iOS deployment target **15.1**.
- Apple enrollment **Individual** (Organization needs a D-U-N-S number — weeks).
- **v1 notifications are local / on-device** from synced expiry dates. Server push (APNs/FCM)
  is a post-launch fast-follow, off the critical path.
- **Android deferred** entirely to post-launch (same Expo code, separate submission).
- **One universal UI codebase.** `apps/mobile` screens are RN primitives + NativeWind, so
  `react-native-web` renders the same code in a browser. Web output is wired (`app.config.ts`
  `web`, `@expo/metro-runtime`) but **not deployed until post-launch**; the legacy `apps/web`
  Next.js app is retired once web output is live. iOS stays the Sep 30 priority.
- Signing keys + Apple assets in a shared password manager from day one.

### Architecture

```
thatfridge/                  (monorepo — pnpm workspaces + turborepo)
├── packages/core/           shared logic: HttpClient, createApi, types, domain helpers
├── apps/mobile/             Expo + Expo Router — iOS + Android + web from one codebase. THE PRODUCT.
│   └── src/components/      universal UI primitives (brand, ui, food-icon, sheet)
├── apps/web/                LEGACY Next.js SPA — frozen; retired once web output ships
└── backend/                 Laravel API — deploy + a couple of new endpoints
```

---

## 3. MVP scope — v1.0

**IN** (status per §1):

| Screen / feature                                                             | Status                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| Auth — register / login / logout / persistence                              | ✅                                                |
| Inventory + item detail — list / add / edit / delete                        | ✅                                                |
| Add + barcode scanning (`expo-camera`)                                     | ✅ (scan needs dev build)                         |
| Home dashboard                                                               | ✅                                                |
| Notifications feed + settings + local expiry reminders                       | ✅                                                |
| What to eat + recipe view + "I made this"                                    | ✅                                                |
| Chat (AI assistant)                                                          | ✅                                                |
| Shopping list                                                                | ✅                                                |
| Profile / Settings +**account deletion** + **restore purchases** | ✅ deletion · ⬜ restore (with paywall)          |
| **Paywall + "ThatFridge Pro"** (RevenueCat, `pro` entitlement gate)  | 🔒                                                |
| Shared chrome — tab bar, bottom sheets, toasts, offline/error states        | 🟡 error/loading states done; tab bar + polish ⬜ |

**OUT** — fast-follow via EAS Update after launch (all JS-only, no new review):
sticky-notes board · Organizer · Goals · Badges · AI-data screen · RecipeFormSheet ·
FridgeStyleSheet · dedicated Search · ChatHistory session list · item icon picker ·
Android · server-driven push.

A trivial OUT screen may be ported if there's slack, but it never delays an IN item.

---

## 4. Roles & ownership

### Member A — Backend, Infra & Release / Compliance  *(critical path — not started)*

- **Now:** submit Apple Developer enrollment (Individual) **and** start the App Store Connect
  Paid Apps Agreement + banking + tax the same day.
- Deploy Laravel to the VPS: Nginx, PHP 8.2+, `migrate --force`, `config:cache`, `route:cache`,
  HTTPS on `api.thatfridge.<domain>`, `APP_DEBUG=false`, fresh `APP_KEY`, rate-limit auth routes.
- Hosted Postgres + Redis; daily backups; queue worker + scheduler under systemd (freshness
  notifications depend on it).
- Seed a stable **reviewer demo account** on prod with realistic data (replace the shell script).
- Sentry on the Laravel app.
- Privacy policy + Terms pages on `apps/web`, deployed, public URLs.
- Store listing: description, subtitle, keywords, support URL, screenshots (iPhone 6.9" + 6.5"),
  icon 1024².
- App Privacy ("nutrition labels") form, age rating, App Review notes (demo credentials).
- RevenueCat: account, project, iOS app, `pro` entitlement, offering; App Store shared secret +
  App Store Connect API key. Create `thatfridge_pro_monthly` + 7-day trial.
- Devpost submission: writeup, ≤2-min demo video, screenshots.
- Submit to review; own the Resolution Center; turn rejections around within hours.
- ✅ done: `DELETE /api/me` endpoint + tests.

### Member B — Mobile Platform Lead  *(needs a Mac)*

- ✅ done: monorepo, Expo scaffold, `app.config.ts`, `eas.json`, `expo-secure-store` auth,
  `expo-notifications` local scheduling, `expo-camera` barcode module, most of `packages/core`.
- **Next:** `eas init` + first `eas build --profile development`; EAS Update channel.
- **RevenueCat:** `react-native-purchases` (+ `react-native-purchases-ui`) config plugin;
  `Purchases.configure()` on launch with `EXPO_PUBLIC_RC_IOS_KEY`; `usePro()` →
  `entitlements.active.pro`; wire the paywall + restore-purchases.
- Finish the `lib/thatfridge` → `packages/core` extraction; point `apps/web` at the package.
- Cut TestFlight builds; own the release runbook.

### Member C — App UI: core loop

- ✅ done: Auth, Inventory + item detail, Add + scan, Home, Notifications, What-to-eat, Chat.
- **Next:** item **icon picker** (port `FoodIcon` / generated-icon library); ChatHistoryScreen
  (session list / switch / delete); RecipeDetailSheet as a standalone route.
- Native-feel + offline pass on every core screen (with D).

### Member D — App UI: chrome + secondary + compliance-adjacent

- **Now:** the **tab bar** (Home / Inventory / Eat / Notifications) + bottom-sheet system +
  toast/undo + skeleton loaders + safe-area wrapper.
- Privacy policy + Terms page content (with A).
- Native-feel pass: haptics, pull-to-refresh consistency, keyboard-avoiding views.
- ✅ done: account-deletion UI, About content (folded into `profile`).
- Devpost draft + #BuildInPublic thread.

---

## 5. Timeline (original 15-day sprint)

> Kept for reference. §1 is the live status. The build track ran ahead of this grid;
> the Member A column has not started and is now the pacing constraint.

### Week 1 — foundations + core skeleton

| Day | A (Backend/Release)                                                  | B (Platform)                               | C (Core UI)                                                                  | D (Chrome + Secondary)          |
| --- | -------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------- |
| 1   | Apple enrollment + Paid Apps Agreement submitted; VPS deploy started | Monorepo +`core` extraction              | Expo scaffold; dev client on a real iPhone                                   | Nav shell: tabs + stack + sheet |
| 2   | API on HTTPS; CORS; prod migrate+seed; reviewer demo account         | `core` building; one green `eas build` | AuthScreen against prod API                                                  | Tab bar + drawer + toast        |
| 3   | ✅`DELETE /api/me` + tests                                         | `expo-secure-store`; `app.config.ts`   | InventoryScreen + ItemDetailSheet                                            | Bottom-sheet system + skeletons |
| 4   | Verify expiry fields; Sentry; draft privacy policy                   | `expo-camera` scan prototype on device   | Inventory CRUD end-to-end                                                    | HomeScreen                      |
| 5   | Privacy policy + terms deployed                                      | TestFlight build#1 (or ad-hoc)             | **Checkpoint:** register → scan → inventory → home on a real device | Safe-area pass                  |

### Week 2 — full MVP port + native polish

| Day | A                                               | B                                       | C                                       | D                                   |
| --- | ----------------------------------------------- | --------------------------------------- | --------------------------------------- | ----------------------------------- |
| 6   | Store listing copy; screenshot plan             | Local notification scheduling           | Barcode scan production-ready + priming | Notifications feed + settings       |
| 7   | App Privacy form; age rating                    | RevenueCat SDK +`usePro()`            | What-to-eat + recipe view + mark-made   | Shopping list + account-deletion UI |
| 8   | Review notes; finalize screenshots              | Paywall + restore; cold-start pass      | Offline/error states everywhere         | Chat + Profile + About              |
| 9   | — full team: bug bash on TestFlight build#2 — |                                         |                                         |                                     |
| 10  | All store assets final                          | TestFlight build#3 → team + ~5 friends | **MVP feature-freeze**            | **MVP feature-freeze**        |

### Week 3 — harden, submit, review

| Day | Everyone                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------ |
| 11  | Bug triage; polish; performance (list scroll, images, memory)                                                |
| 12  | Release candidate; v1.0.0, manual release;**A submits to App Store review**                            |
| 13  | Respond to metadata rejections same-day; 4.2 rebuttal ready (native camera, notifications, offline, haptics) |
| 14  | Buffer for one review round-trip (~24–48h/cycle); fix + resubmit same day                                   |
| 15  | Approved → manual release; kick off post-launch backlog (§9)                                               |

---

## 6. QA matrix  *(A owns the process; whole team runs it)*

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

## 7. Top risks & mitigations

1. **Apple identity verification is slow (#1 risk).** Submit as an Individual now. Everything
   except TestFlight and submission works without a paid account (Expo dev client on a personal
   iPhone with a free Apple ID, 7-day resign). If not cleared within a week, escalate to Apple
   support; check whether a teammate already has an active account.
2. **App Store Connect financials lead time.** Paid Apps Agreement + banking + tax can take days
   and needs real tax info. Until active, IAPs can't be tested and the RevenueCat requirement
   can't be met. Start it the same day as enrollment.
3. **Guideline 4.2 (thin-wrapper rejection).** Low for a real RN app, but keep native features
   visible — camera, notifications, haptics, native nav. Have a written feature-list rebuttal.
4. **Guideline 3.1.2 (subscription scrutiny).** Restore button, clear pricing, terms, no dark
   patterns. Build the paywall to spec from the start.
5. **"First public release" timing (Shipaton).** No public TestFlight link, ProductHunt, or
   press before the store listing is live, or risk the "not brand-new" disqualification.
6. **Review round-trips eat the buffer.** Submit early (~2 weeks before Sep 30); team on-call
   for same-day resubmits.
7. **Scope creep.** The §3 IN list is the contract. Anything else is post-launch OTA.
8. **Lost signing keys.** Shared password manager, from day one.

---

## 8. Pre-submission checklist

- [ ] Prod API on HTTPS, `APP_DEBUG=false`, queue + scheduler running, backups on
- [ ] App built against prod `EXPO_PUBLIC_API_URL`; no localhost reachable
- [ ] Account deletion works from a clean install
- [ ] Privacy policy + terms URLs live and linked in-app
- [ ] Camera permission string set; `ITSAppUsesNonExemptEncryption` set
- [ ] Local notifications fire correctly and route on tap
- [ ] RevenueCat: sandbox purchase + restore verified; `pro` gate works both ways
- [ ] Icon 1024², splash, iPhone 6.9" + 6.5" screenshots (no device frame — 1179×2556)
- [ ] App Privacy form complete and accurate
- [ ] Age rating done
- [ ] Demo account + review notes filled in
- [ ] TestFlight build validated by all 4 members on real devices
- [ ] Crash-free session confirmed in Sentry
- [ ] Version 1.0.0, build number set, release set to **manual**
- [ ] EAS Update production channel wired
- [ ] Devpost submission drafted (see `SHIPATON_2026.md` §6)

---

## 9. Post-launch backlog

1. EAS Update: sticky notes, organizer, goals, badges, AI-data, recipe form, fridge style,
   search, chat-history session list, item icon picker.
2. Server-driven push: APNs auth key + FCM + device-token endpoint + backend sends.
3. **Android:** `eas build -p android`; Play Console (register as an **organization** to skip the
   12-tester / 14-day closed-testing gate); Data Safety form; Android screenshots; submit.
4. **Web deployment** (universal codebase): `expo export -p web` → host the static build; add
   wide-viewport branches to the screens where the phone layout is too narrow (Inventory
   grid, Home two-column); wire the API `EXPO_PUBLIC_API_URL` for the web origin; add
   `Platform.OS === "web"` guards where native modules are touched. Then **retire `apps/web`**
   (the Next.js SPA) and point the domain at the new build.
5. iPad layout pass (shares the web wide-viewport work).
6. Shipaton: sustained #BuildInPublic cadence + growth experiments through Sep 30.
