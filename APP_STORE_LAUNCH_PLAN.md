# ThatFridge — iOS Launch Plan (Expo / React Native)

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native app
built with **Expo / React Native** — no Capacitor, no WebView.

**Target:** originally a 3-week sprint (15 working days). This launch is also our
**RevenueCat Shipaton 2026** entry ([`SHIPATON_2026.md`](SHIPATON_2026.md)), which sets a hard
outside deadline of **Sep 30, 2026** and adds two requirements: the **RevenueCat SDK powering
≥1 in-app purchase** (a "ThatFridge Pro" subscription + paywall) and the app being **live** by
that date.

**Team:** 4 people — roles in §4. Map them to A/B/C/D.

> **The plan works only if:** (a) the §3 scope holds — every core screen is now ported to web
> parity; further additions are post-launch OTA;
> (b) Apple Developer enrollment is submitted immediately (the #1 schedule risk, §7);
> (c) the App Store Connect Paid Apps Agreement is started the same day (blocks all IAP work).

_Last updated: 2026-08-28 · working branch `mobile-app` (not yet merged to `main`)._

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

| Item                                            | Owner | Note                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅**Paywall + RevenueCat**                | B     | client code done; RevenueCat dashboard configured (project,`thatfridge_pro` entitlement, `default` offering with `monthly`/`yearly`); **AI paywall designed + published** on the `default` offering (test store). **Still needs:** a real App Store app in RevenueCat + `appl_` key + real trial products, and a dev build to run |
| 🔒**`eas build --profile development`** | B     | dev client so barcode scan, local notifications, and RevenueCat can actually be tested — needs the Apple account                                                                                                                                                                                                                                         |
| 🟡 Tab bar chrome                               | D     | floating-pill nav matching the web — Home · Inventory ·**[＋]** · Chat · Eat, active tab expands to its label, raised amber add-FAB; toast/undo done; bottom-sheet **grab-to-dismiss** gesture still ⬜                                                                                                                                  |
| ⬜ Item icon picker                             | C     | items show name initials + core pixel grids; port the generated-icon library                                                                                                                                                                                                                                                                              |
| ⬜ ChatHistoryScreen                            | C     | chat restores the latest session only; "new chat" clears it; no session list / switch / delete                                                                                                                                                                                                                                                            |
| ⬜ Native-feel pass                             | C/D   | haptics, skeleton loaders, safe-area audit on every screen, offline banners                                                                                                                                                                                                                                                                               |
| ⬜`lib/thatfridge` full extraction            | B     | most Home logic now in`packages/core` (`home.ts`, score endpoints); finish moving the rest + point`apps/web` at `packages/core`                                                                                                                                                                                                                   |
| ⬜ Merge`mobile-app` → `main`              | —    | additive; web app untouched                                                                                                                                                                                                                                                                                                                               |

> **Screen parity (2026-08-28):** every core screen — Home, Inventory, Search, Eat, Chat,
> Notifications, Profile, Add, Item detail — is ported to match `apps/web`'s "dark neon pixel
> tech" look: Home has the Kitchen-Score SVG gauge (wired to the real `usage-history` /
> `organizer-tally` / `score-snapshots` endpoints), the animated CrewScene, the fridge hero
> carousel and swipe-dismiss crew tips; a shared fridge-scope drives Home / Inventory / Search /
> Profile. Deferred as unbuilt features (not layout): receipt/photo AI bulk-add, find-friend,
> Goals/Badges/AI-Data screens, chat attachments/voice, the hero style-picker.

### External setup — not started (long lead time, start now)

| Item                                                                                                                                                                                | Owner |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 🔒 Apple Developer Program enrollment (**Individual**)                                                                                                                        | A     |
| 🔒 App Store Connect: Paid Apps Agreement + banking + tax (blocks IAP testing)                                                                                                      | A     |
| 🔒 RevenueCat account + project +`pro` entitlement + offering                                                                                                                     | A     |
| 🔒`thatfridge_pro_monthly` subscription + 7-day trial in App Store Connect                                                                                                        | A     |
| ⬜ Domain (API host + privacy-policy / terms pages)                                                                                                                                 | A     |
| ⬜ Laravel API deployed to the VPS (HTTPS, Postgres, Redis, queue, scheduler)                                                                                                       | A     |
| ⬜ Proper backend demo-data seeder (replace the shell script)                                                                                                                       | A     |
| ⬜ Sentry on the Laravel app                                                                                                                                                        | A     |
| ⬜ Privacy policy + Terms pages on`apps/web`                                                                                                                                      | A/D   |
| ⬜ Devpost draft + start#BuildInPublic thread                                                                                                                                       | D     |
| ⬜**Buy PixelMix commercial license** ($25, andrewtyler.gumroad.com/l/pixelmix) — required before the App Store (commercial) release; see `assets/fonts/PixelMix-NOTES.md` | A     |
| ⬜ Decide Google Play account type (personal vs organization)                                                                                                                       | D     |

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

The bar for every mobile screen is now **visual parity with `apps/web`** (decided 2026-08-28),
not the earlier stripped MVP. Status per §1.

| Screen / feature                                                                     | Status                                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Auth — register / login / logout / persistence                                      | ✅                                                                     |
| Inventory + item detail — list / add / edit / delete, sort, category filter, search | ✅ web-parity                                                          |
| Add — method picker (barcode / manual live; receipt + photo Pro-gated)              | ✅ web-parity                                                          |
| Home dashboard — Kitchen Score gauge, CrewScene, fridge carousel, crew tips         | ✅ web-parity                                                          |
| Notifications feed + settings + local expiry reminders                               | ✅ web-parity                                                          |
| What to eat + recipe card (have/need ingredients, steps) + "Mark as made"            | ✅ web-parity                                                          |
| Chat (AI assistant) — wallpaper, quick asks, markdown replies                       | ✅ web-parity                                                          |
| Shopping list                                                                        | ✅                                                                     |
| Profile / Settings +**account deletion** + **restore purchases**         | ✅                                                                     |
| **Paywall + "ThatFridge Pro"** (RevenueCat, `thatfridge_pro` gate)           | ✅ code + dashboard + published paywall; needs real App Store products |
| Shared chrome — tab bar, toasts, fridge-scope, pixel headers                        | ✅ · sheet grab-to-dismiss gesture ⬜                                 |

**OUT** — fast-follow via EAS Update after launch (all JS-only, no new review):
sticky-notes board · Organizer · Goals · Badges · AI-data screen · RecipeFormSheet ·
FridgeStyleSheet · ChatHistory session list · item icon (generated) library ·
receipt/photo AI bulk-add · find-friend / shared-fridge invites · chat attachments + voice ·
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

- ✅ done: floating-pill **tab bar** (Home · Inventory · ＋ · Chat · Eat), toast/undo, safe-area
  wrappers. **Left:** bottom-sheet grab-to-dismiss gesture, skeleton loaders.
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

1. EAS Update: work through the **web-app parity gaps in §10** (recipe hub, recipe form, fridge
   style, goals, badges, AI-data, chat history, sticky notes, generated icons, receipt/photo
   AI add, find-friend / shared fridges) — all JS-only, no re-review.
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

---

## 10. Web-app parity gaps

Full inventory of what `apps/web` has that `apps/mobile` does **not** yet, as of 2026-08-28.
The core screens are at visual parity (§3); this is the long tail. Nothing here blocks the
v1.0 submission — it's the post-launch roadmap, ordered roughly by value. LOC is the web
component's size, as a rough effort signal. Every backend route named below already exists.

> **Built 2026-08-28** (commits `2e96ca4`…`98ee167`): §A — a **Recipe book** (`recipes.tsx`
> library + `recipe/[id]` detail + `recipe-form` create/edit with import-from-link), **Goals**,
> **Badges**, **AI Data & Memory**, **Chat History**, **About**. §B — the **multi-fridge &
> social subsystem**: `lib/social.tsx`, `find-friend.tsx`, `fridge/[id]` (rename / style photo /
> members / invite / join requests / leave-delete), Home find-friend icon, pending rows in
> Notifications. Core gained ~40 API methods + `progress.ts`.
> **Still open in §A/B:** custom fridge-photo upload, recipe photo/video attachments,
> `MarkRecipeMadeSheet` ingredient reconciliation, FoodHub's agent-activation + shopping-rec
> extras.

### A. Screens with no mobile equivalent

| Web screen                                 | LOC | What it does                                                                                                                                                                                                           | Backend                                                                                                                 |
| ------------------------------------------ | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `FoodHubScreen`                          | 649 | The recipe hub: browse/search the recipe library, category tabs, favourites, "tonight's pick", per-agent "activate" cards, shopping recommendations, embedded shopping panel, fridge notes                             | `/recipes`, `/recipes/suggest`                                                                                      |
| `RecipeFormSheet`                        | 486 | Create / edit a custom recipe — name, category, ingredients, steps,**photo + video attachments** (record or pick), **import from a link**                                                                 | `/recipes` POST/PATCH, `/recipes/attachments`, `/recipes/import-link`                                             |
| `FridgeStyleSheet`                       | 357 | Per-fridge look — pick a style photo or**upload a custom fridge photo**; also **rename / delete** a fridge and **leave** a shared one                                                               | `/fridges/{}` PATCH/DELETE, `/fridges/{}/leave`                                                                     |
| `GoalsScreen`                            | 201 | Set a weekly/monthly goal (waste rate / items rescued / freshness at use) and track progress                                                                                                                           | `/user-goal` GET/PATCH                                                                                                |
| `FindFriendScreen` (+ `friendProfile`) | 193 | Search users by username, view a profile, send / accept**fridge invites & join requests**                                                                                                                        | `/users/{username}/profile`, `/invites`, `/join-requests`, `/fridges/{}/invites`, `/fridges/{}/join-requests` |
| `RecipeDetailSheet`                      | 178 | Standalone recipe view. Mobile has an inline card in Eat with have/need rows + steps + "mark as made";**missing:** favourite toggle, edit-own-recipe, attachments / reference media, category tag, `by @owner` | `/recipes/{}/favorite`                                                                                                |
| `AIDataScreen`                           | 155 | See / manage what the crew remembers — chat-history entry,**usage-history list with per-row delete**, **memory facts** with delete + "extract from chats"                                                 | `/usage-history`, `/memory` (+ `/memory/extract`, `/memory/facts/{i}`)                                          |
| `MarkRecipeMadeSheet`                    | 144 | After "mark as made", reconcile which matched fridge items were**finished vs still remaining vs not used** — mobile currently calls `mark-made` with no reconciliation                                        | `/recipes/{}/mark-made`                                                                                               |
| `AboutScreen`                            | 132 | Standalone About + the 4 agent bios. Mobile folds a one-line blurb into Profile                                                                                                                                        | —                                                                                                                      |
| `BadgesScreen`                           | 81  | 4 achievement badges (`rescued_10`, `first_link_recipe`, `full_week_variety`, `zero_waste_week`) with progress                                                                                                 | `/badges` (+ `/badges/{key}/progress`)                                                                              |
| `ChatHistoryScreen`                      | 73  | List past chat sessions,**restore or delete** one. Mobile restores only the latest; "new chat" just clears                                                                                                       | `/chat/sessions`, `/chat/sessions/{id}` GET/DELETE                                                                  |

### B. Multi-fridge & social (whole subsystem — currently single-fridge only on mobile)

- Shared fridges: **members list**, remove a member, roles (owner / member), leave a fridge.
- **Join requests** — request to join someone's fridge; owner approves / declines.
- **Invites** — invite a user to your fridge; invitee accepts / declines.
- The **pending-action rows** in Notifications (`PendingRow` in `NotificationHistoryScreen`) —
  mobile's list shows only `expiring` / `lowStock` / `recipe` events.
- Home header's **find-friend icon** with its unread-invite dot (omitted on mobile).
- Global **fridge scope** — on mobile it drives Home / Inventory / Search / Profile but not
  shopping list or notes (web scopes those too).

### C. Add — receipt / photo / AI (web `AddScreen` is 1020 LOC; mobile = method picker + manual)

- **Receipt scan** → OCR → editable review list → confirm (`/items/receipt/scan` + `/confirm`).
- **Fridge photo** → AI detects items + **produce condition** (vibrant / wilting / past best)
  → review → confirm (`/items/photo/scan` + `/confirm`).
- **Scan the printed expiry date** instead of guessing (`/items/expiry-scan`).
- **AI auto-fill** — suggest expiry date + storage location from the item name
  (`/items/suggest-details`).
- In-app **barcode camera** inline (mobile has a separate `/scan` screen — acceptable).
- **Item icon**: choose from the full library / **generate an AI icon**
  (`GenerateIconRow`, `GeneratedIconLibrary`, `/icons/generated`).

### D. Item detail

- **"Opened it"** state + the `OPENED` badge — the mobile `/fridges` payload has no `opened`
  field (`toItem` in `packages/core` hardcodes `false`); needs a backend Item + resource change.
- **Icon picker / AI icon generation** in edit mode.
- Reassign the item's **section** (web edit has a section `<select>`; mobile edits location only).

### E. Chat

- **Photo attachment** on a message (`sendChat` accepts a file).
- **Voice input** (web uses the Web Speech API; mobile needs a native STT module).
- **Chat history / session list** (see `ChatHistoryScreen`, §A).
- **"Add to recipe book"** from a chat recipe suggestion (`RecipeSuggestionCard` →
  `addSuggestedRecipeToLibrary`).
- The "**demo reply — no AI key configured**" label on mocked responses.

### F. Kitchen Score / crew

- **Organizer sweeps** — "activate Organizer → AI checks each item's placement → apply / dismiss
  moves", which increments `/organizer-tally`. Mobile never increments it, so **Tidiness stays
  "building your score" forever**.
- `AgentScoreCard` **extras** — Guardian overdue pill, Chef's 5-food-group coverage icons,
  Organizer completion ring, Shopkeeper receipt-style bar (mobile's expand shows a plainer row).
- **Score trend / sparkline** — `getScoreTrend` / `getScoreSeries` show a delta vs last week's
  snapshot on the Waste Saver card.
- Badge award on **full food-group variety** (`awardBadgeProgress("full_week_variety")`).

### G. Fridge notes / sticky notes

- `FridgeNotesSection` (116) — a shared sticky-note board on the fridge door: add / edit / delete
  colour-coded notes, any household member can touch any note. Backend: `/notes`,
  `/fridges/{}/notes`. Shown on Home (mobile) / FoodHub (web).

### H. Notification settings

- Web `NotificationsScreen` (120) — grouped toggle rows with **agent GIF icons + descriptions**
  and a "MEALS & SUMMARIES" section. Mobile `notification-settings.tsx` (61) is a plain switch
  list with a native header (functionally complete, visually plainer).

### I. Profile / settings

- Links to **Goals, Badges, AI Data & Memory, About** — mobile Profile has only Notification
  settings + Shopping list + Your fridges.

### J. Shopping list

- **Recommendations** — `getShoppingRecommendations` (recipe / nutrition / habit-based picks)
  shown above the list on web; mobile shopping is add / check / clear only.

### K. Components & polish

- `AttachmentLightbox` — fullscreen viewer for recipe / chat image & video attachments.
- **Generated-icon library** UI + AI icon generation (`GenerateIconRow`, `GeneratedIconLibrary`).
- `FoodIcon` coverage — mobile ships ~10 core pixel grids + an initials fallback; web has a
  ~165-PNG asset pack plus AI-generated icons.
- **Bottom-sheet grab-to-dismiss** gesture on every modal screen (needs
  `react-native-gesture-handler` wiring — currently modals dismiss via the ✕ / swipe-down only).
- **Skeleton loaders** (web shimmer placeholders; mobile shows spinners).
- **Offline banners** / a sync-error toast surfaced consistently.
- Sheet **enter animations** (`pop` / slide-up) to match the web's sheet feel.
- Web **wide-viewport (≥900px) layout branches** on Home / Inventory / Chat — deferred with the
  web-deployment work in §9.4, not needed for the iOS submission.
