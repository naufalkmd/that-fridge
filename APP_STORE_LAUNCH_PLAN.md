# ThatFridge — 3-Week iOS Launch Plan (Expo / React Native)

**Goal:** Ship ThatFridge to the **Apple App Store** in **3 weeks (15 working days)**. iOS only. Native app built with **Expo / React Native** — no Capacitor, no WebView.
**Team:** 4 people, all full-time on this. Roles in §3.
**Method:** Monorepo, share the existing logic layer, rebuild the UI native, cut scope hard, parallelize from Day 1.

> This is an aggressive plan. It works only if: (a) all 4 people are heads-down, (b) the MVP scope cut in §2 holds — no additions mid-sprint, (c) Apple Developer enrollment is submitted **Day 1**. The single biggest schedule risk is Apple identity verification; §7 covers the mitigation.

---

## 0. Progress

_Last updated: 2026-08-27. Branch: `mobile-app` (not yet merged to `main`)._

### Done

- [x] **Monorepo stood up** — pnpm workspaces + turborepo; `.npmrc` with `node-linker=hoisted` for Metro compatibility
- [x] **`frontend/` → `apps/web/`** — pure `git mv`, web app otherwise untouched and frozen; README + pre-push hook + `.gitignore` updated
- [x] **`apps/mobile` scaffolded** — Expo SDK 57, Expo Router, NativeWind, TypeScript
- [x] **`app.config.ts`** — bundle id `test.thatfridge.app`, camera usage string, mic disabled, `ITSAppUsesNonExemptEncryption=false`
- [x] **`eas.json`** — development / preview / production profiles (needs `eas init` to attach a project id, and real API URLs)
- [x] **`packages/core` created** — `types.ts` (copied), platform-agnostic `HttpClient` (injected baseUrl + token store), `createApi` with `login`/`register`/`logout`/`me`, `describeError`
- [x] **Mobile ↔ core wired** — `expo-secure-store` token store, `EXPO_PUBLIC_API_URL` env
- [x] **AuthScreen ported** (`sign-in.tsx`) — login/signup toggle, validation matching backend rules, loading/error states, `__DEV__` demo-account fill
- [x] **Auth session** — `AuthProvider` with token-restore on launch; `index.tsx` redirects by auth status; `home.tsx` placeholder
- [x] iOS bundle verified building clean via Metro
- [x] Runs in Expo Go (auth flow only — native modules need a dev build)

### In progress / next

- [ ] `eas init` + first `eas build --profile development` (dev client) — **Member B**
- [ ] `lib/thatfridge` full extraction into `packages/core` (see `packages/core/README.md`) — **Member B**
- [ ] Merge `mobile-app` → `main`
- [ ] InventoryScreen + ItemDetailSheet — **Member C**
- [ ] Shared chrome: tab bar, drawer, bottom sheets, toasts — **Member D**

### Blockers not started (external lead time — start now)

- [ ] **Apple Developer Program** enrollment (Individual) — **Member A/D**
- [ ] Domain purchased (API + privacy policy) — **Member A**
- [ ] Laravel API deployed to the VPS (HTTPS, Postgres, Redis, queue, scheduler) — **Member A**
- [ ] Decide Google Play account type (personal vs organization) — **Member D**

---

## 1. Approach

`frontend/lib/thatfridge/` is **~5,850 LOC of portable logic** (API client, types, domain rules), already cleanly separated from **~9,100 LOC of web UI**. We move the logic into a shared package untouched and rebuild only the UI in React Native.

**Expo, not bare React Native:** EAS Build (cloud iOS builds, one command), EAS Submit (CLI upload to App Store Connect), EAS Update (push JS bug-fixes with no re-review), pre-built native modules (`expo-camera`, `expo-notifications`, `expo-secure-store`). Prebuild/config-plugins are the escape hatch if we need custom native code.

**Locked decisions — no re-litigation during the sprint:**
- Styling: **NativeWind** (Tailwind syntax — closest to the current web code, no learning curve).
- Navigation: **Expo Router** (file-based, mirrors Next.js).
- Package manager: **pnpm** workspaces + turborepo. Node 20 LTS.
- Bundle id: `test.thatfridge.app`. iOS deployment target: **15.1**.
- Apple enrollment: **Individual** (Organization needs a D-U-N-S number — weeks).
- **v1 notifications are local/scheduled on-device** (from synced expiry dates). Server-driven push (APNs/FCM) is a post-launch fast-follow — it's off the critical path.
- **Android is deferred entirely** to post-launch. The Expo code is cross-platform; it's a separate submission effort later.
- Signing keys / Apple assets live in a shared password manager from Day 1.

### Target architecture

```
thatfridge/                  (monorepo — pnpm workspaces + turborepo)
├── packages/core/           ← frontend/lib/thatfridge, moved verbatim
│                              API client, types, domain logic
├── apps/mobile/             ← Expo + Expo Router. iOS. THE PRODUCT.
├── apps/web/                ← current Next.js SPA — frozen, not touched this sprint
│                              (hosts the privacy policy + terms pages)
└── backend/                 ← Laravel API. Deploy only, minimal changes.
```

---

## 2. MVP scope — what ships in v1.0

**IN (the core loop must be flawless):**
| Screen | Note |
|---|---|
| AuthScreen | register / login / logout / token persistence |
| InventoryScreen + ItemDetailSheet | list, detail, add, edit, delete |
| AddScreen + barcode scanning | `expo-camera` — the marquee native feature |
| HomeScreen | dashboard / first screen |
| NotificationsScreen + NotificationHistoryScreen | in-app feed + **local scheduled** expiry/low-stock alerts |
| WhatToEatSheet | "what can I cook" |
| RecipeDetailSheet + MarkRecipeMadeSheet | view a suggestion, mark made (decrements inventory) |
| ChatScreen + ChatHistoryScreen | AI assistant |
| Shopping list | shared/fridge-scoped list |
| ProfileDrawer / Settings + **account deletion** | Apple 5.1.1(v) requirement |
| AboutScreen | |
| Shared chrome | tab bar, drawer, bottom sheets, toasts, offline/error states |

**OUT — fast-follow via EAS Update after launch (all JS-only, no new review needed):**
Sticky-notes board · Organizer page · GoalsScreen · BadgesScreen · AIDataScreen · RecipeFormSheet (custom recipe creation) · FridgeStyleSheet · dedicated SearchScreen · Android · server-driven push.

If a screen in the OUT list is trivial to port and there's slack, fine — but it is never allowed to delay an IN item.

---

## 3. Roles & ownership

### Member A — Backend, Infra & Release/Compliance
Backend deploy is front-loaded in Week 1; store/compliance is bursty (enrollment Week 1, submission Week 3). These interleave for one person.
- **Day 1:** submit Apple Developer enrollment (Individual); create the App Store Connect app record as soon as the account clears; reserve the name.
- Deploy Laravel to the VPS: Nginx, PHP 8.2+, `migrate --force`, `config:cache`, `route:cache`, HTTPS on `api.thatfridge.<domain>`, `APP_DEBUG=false`, fresh `APP_KEY`, rate-limit auth routes.
- Hosted **Postgres** + **Redis**; daily DB backups; **queue worker + scheduler** under systemd (freshness notifications depend on it — see `README.md`).
- **New endpoint:** `DELETE /api/me` — hard-delete user + owned fridges/items, revoke all tokens. With tests.
- Confirm the inventory API returns per-item expiry timestamps the app needs to schedule local notifications; add fields if missing.
- Seed a stable **reviewer demo account** on prod with realistic data.
- Sentry on the Laravel app.
- **Privacy policy + Terms** pages on `apps/web`, deployed, public URLs.
- Store listing: description, subtitle, keywords, support URL, screenshots (iPhone 6.9" + 6.5"), icon 1024².
- **App Privacy** ("nutrition labels") form, age rating, App Review notes (demo credentials, "requires network").
- Submit to review; own the Resolution Center; turn rejections around within hours.

### Member B — Mobile Platform Lead
Owns the monorepo, Expo project, native config, and the build pipeline. **Needs a Mac.**
- Stand up the monorepo (pnpm + turborepo). Move `frontend/lib/thatfridge` → `packages/core`; fix imports; add build step. **Timebox to Day 2** — if there are hidden web deps, stub them behind an interface, don't rewrite.
- Scaffold `apps/mobile`: Expo + Expo Router + TypeScript + NativeWind.
- `app.config.ts`: bundle id, deployment target, **camera permission string** ("Scan grocery barcodes"), `ITSAppUsesNonExemptEncryption = false`, icon, splash.
- `expo-secure-store` for the auth token; wire `packages/core`'s API client to it.
- `eas.json` with `development` / `preview` / `production` profiles; `EXPO_PUBLIC_API_URL` per profile. Get one green `eas build` by Day 2.
- **EAS Update** channel wired for post-launch OTA fixes.
- `expo-notifications`: local scheduling from synced item expiry dates + permission priming.
- Barcode scanning module (`expo-camera`) — prototype on a real device by Day 4.
- Cut TestFlight builds; own the release runbook.

### Member C — App UI: core loop
Owns the screens users touch every day.
- Port in order: **AuthScreen → InventoryScreen + ItemDetailSheet → AddScreen + barcode scan → HomeScreen → NotificationsScreen + NotificationHistoryScreen.**
- Wire each to `packages/core` against the prod API.
- Camera permission flow: allow / deny / deny-then-enable, with the priming screen.
- Offline / error / loading states on every one of these screens — no infinite spinners.

### Member D — App UI: secondary screens + shared chrome
Owns everything else in MVP scope and the components every screen depends on.
- **Day 1–3:** shared chrome — tab bar, drawer/sidebar, bottom-sheet system, toast/undo, skeleton loader, safe-area wrapper. C and A are blocked on these, so they come first.
- Then port: WhatToEatSheet → RecipeDetailSheet + MarkRecipeMadeSheet → ChatScreen + ChatHistoryScreen → Shopping list → ProfileDrawer/Settings → AboutScreen.
- **Account-deletion UI**: Settings → confirm dialog → `DELETE /api/me` → clear secure-store + local state → back to Auth.
- Native-feel pass across all screens: haptics on key actions, pull-to-refresh on lists, momentum scrolling, keyboard-avoiding views.

---

## 4. 15-day timeline

> See §0 for live progress. Ahead of this grid: monorepo, mobile scaffold, `eas.json`,
> `app.config.ts`, `packages/core` (partial), AuthScreen + session all landed early.
> Behind: nothing started yet on the Member A backend/enrollment track.

### Week 1 — Foundations + core skeleton (Days 1–5)

| Day | A (Backend/Release) | B (Platform) | C (Core UI) | D (Chrome + Secondary) |
|---|---|---|---|---|
| 1 | **Apple enrollment submitted.** VPS API deploy started. | Monorepo init; start `core` extraction. | Expo app scaffold + NativeWind + Router skeleton; dev client on a real iPhone. | Navigation shell: tabs + one stack + one sheet. |
| 2 | API on HTTPS; CORS; prod migrate+seed; reviewer demo account. | `core` extracted & building; `eas.json`; one green `eas build --profile preview`. | AuthScreen ported, hitting prod API. | Tab bar + drawer + toast components. |
| 3 | `DELETE /api/me` + tests. | `expo-secure-store` auth persistence; `app.config.ts` (bundle id, perms, icon, splash). | InventoryScreen + ItemDetailSheet. | Bottom-sheet system + skeleton loader; AddScreen form shell. |
| 4 | Verify expiry fields in API; Sentry; draft privacy policy + terms. | `expo-camera` barcode scan prototype on device. | Inventory CRUD wired end-to-end. | HomeScreen. |
| 5 | Privacy policy + terms deployed (public URLs). | TestFlight build #1 (if Apple cleared) or ad-hoc `preview` build. | **Checkpoint: register → scan → item in inventory → shows on Home, on a real device.** | Safe-area pass on ported screens. |

### Week 2 — Full MVP port + native polish (Days 6–10)

| Day | A | B | C | D |
|---|---|---|---|---|
| 6 | Store listing copy; screenshot plan. | Local notification scheduling from synced expiry dates. | Barcode scan production-ready (permission states + priming). | NotificationsScreen + NotificationHistoryScreen. |
| 7 | App Privacy form; age rating. | Haptics, pull-to-refresh, momentum lists wired into the chrome. | WhatToEatSheet + RecipeDetailSheet + MarkRecipeMadeSheet. | Shopping list + **account-deletion UI**. |
| 8 | Review notes w/ demo login; finalize screenshots. | Cold-start + bundle-size pass; EAS Update channel live. | Offline/error states across all core screens. | ChatScreen + ChatHistoryScreen; ProfileDrawer/Settings; AboutScreen. |
| 9 | — full team: **bug bash on TestFlight build #2** — crashers + un-native feel first — | | | |
| 10 | All store assets final. | TestFlight build #3 → team + ~5 friends. | **MVP feature-freeze.** | **MVP feature-freeze.** |

### Week 3 — Harden, submit, review (Days 11–15)

| Day | Everyone |
|---|---|
| 11 | Bug triage from build #3; polish; performance (list scroll, image loading, memory). |
| 12 | Release candidate; version 1.0.0, manual release. **A submits to App Store review.** |
| 13 | Respond to any metadata rejection same-day. 4.2 rebuttal ready (native camera, local notifications, offline, haptics, native nav) — a real RN app rarely triggers it. |
| 14 | Buffer for one review round-trip (Apple ~24–48h/cycle). Fix + resubmit same day if rejected. |
| 15 | Approved → manual release. Kick off post-launch backlog: OUT-scope screens via EAS Update, Android submission, server push. |

---

## 5. Definition of done per phase

- **End Week 1:** empty-ish app on a real device; auth works against prod; register→scan→inventory→home path is demoable.
- **End Week 2:** every IN-scope screen present and functional; team dogfooding from TestFlight daily; feature-frozen.
- **End Week 3:** build in review or approved; post-launch backlog written.

---

## 6. QA matrix (A owns the process; whole team runs it in Week 2–3)

| Area | Checks |
|---|---|
| Devices | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device. |
| Auth | Register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session. |
| Core loop | Add item, barcode scan (camera allow/deny/deny-then-enable), inventory edit/delete, mark recipe made decrements stock. |
| Notifications | Local alert fires at the right time; tap routes to the item; permission denied handled. |
| Native chrome | Safe areas top+bottom, status bar, splash→app transition, keyboard avoidance, sheet gestures, deep back-swipe. |
| Network | Airplane mode on every screen; slow 3G; API 500s; retry paths. |
| Lifecycle | Background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly. |
| Compliance | Account deletion from a clean install; privacy policy link opens; demo account works fresh. |

---

## 7. Top risks & mitigations

1. **Apple identity verification is slow (the #1 risk).** — Submit Day 1 as an Individual. *Everything except TestFlight and submission works without a paid account*: Expo dev client runs on a personal iPhone with a free Apple ID (7-day resign). If not cleared by **Day 8**, escalate to Apple support and check whether any team member already has an active Apple Developer account we can use.
2. **Scope creep.** — The §2 IN list is the contract. Anything else is post-launch OTA. The person who wants to add a screen mid-sprint owns explaining which IN item slips.
3. **`core` extraction hits hidden web dependencies.** — Timeboxed to Day 2; stub behind interfaces rather than rewrite.
4. **Barcode scanning UX is worse than the web `@zxing` version.** — Prototype on a real device Day 4, not Week 3.
5. **Review round-trip eats the buffer.** — Submit Day 12, keep the whole team on-call Days 13–15 for same-day resubmits.
6. **Local-notification scheduling drift** (times wrong after inventory changes). — Reschedule the full local queue on every successful inventory sync; test with clock changes.
7. **Lost signing keys.** — Shared password manager, Day 1.
8. **One person (A) wearing backend + release.** — Backend work must be *done* by end of Week 1 so A is free for compliance and submission. If backend slips, B backstops the deploy.

---

## 8. Pre-submission checklist

- [ ] Prod API on HTTPS, `APP_DEBUG=false`, queue + scheduler running, backups on
- [ ] App built against prod `EXPO_PUBLIC_API_URL`; no localhost reachable
- [ ] Account deletion works from a clean install
- [ ] Privacy policy + terms URLs live and linked in-app
- [ ] Camera permission string set; `ITSAppUsesNonExemptEncryption` set
- [ ] Local notifications fire correctly and route on tap
- [ ] Icon, splash, iPhone 6.9" + 6.5" screenshots
- [ ] App Privacy form complete and accurate
- [ ] Age rating done
- [ ] Demo account + review notes filled in
- [ ] TestFlight build validated by all 4 members on real devices
- [ ] Crash-free session confirmed in Sentry
- [ ] Version 1.0.0, build number set, release set to **manual**
- [ ] EAS Update production channel wired for post-launch fixes

---

## 9. Post-launch backlog (starts Day 15)

1. EAS Update: sticky notes, organizer, goals, badges, AI data, recipe form, fridge style, search.
2. Server-driven push: APNs auth key + FCM + device-token endpoint + backend sends.
3. **Android**: `eas build -p android`, Play Console (register as an **organization** to skip the 12-tester / 14-day closed-testing gate), Data Safety form, Android screenshots, submit.
4. iPad layout pass if analytics show demand.
