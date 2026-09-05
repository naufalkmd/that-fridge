# ThatFridge — TO DO (iOS launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native Expo /
React Native — no Capacitor, no WebView. This launch is also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia + South Korea. API hosted in Singapore; v1 app UI English-only,
localized store listings + Korean UI fast-follow.

**Hard deadline: Sep 30, 2026, 11:45 pm PDT.** The app must be **fully published and live**
(Apple review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-09-06):** backend, RevenueCat, and the mobile app are all functionally
complete and live. Every AI-calling / monetization-relevant endpoint is now Pro-gated and
rate-limited server-side (not just client-side). What's left is almost entirely App Store
submission mechanics (screenshots, pasting drafted content into ASC) plus the Devpost/Shipaton
track — see below.

Legend: ✅ done · 🟡 partial / drafted, needs action · ⬜ not started

---

## What's left to do

### Blocking App Store submission
- [ ] **Confirm Paid Applications agreement shows "Active"** in App Store Connect (bank + tax
  rows green) — IAPs can't be tested/submitted until it's Active.
- [ ] **Change the demo account's password** (`keira@thatfridge.test`, currently `password123`
  — treat as public, it's been in a committed file) before submitting.
- [ ] **Capture iPhone screenshots** — 1320×2868px, **6.9" size only** (this alone satisfies
  every smaller size via Apple's auto-scaling — verified against Apple's current spec
  2026-09-05). No device frame, no alpha channel. 1-10 images; suggest paywall + Home + Chat +
  Inventory.
- [ ] **Paste drafted content into App Store Connect** — all fully written in
  `apps/mobile/STORE_LISTING.md`: store listing copy (§2), App Privacy form (§1), age rating
  reasoning (§4, expected 4+), App Review notes + demo account instructions (§5). Review before
  pasting, verify age-rating answers against ASC's actual live questionnaire (category
  structure changed recently, can't confirm the exact current wording).
- [ ] **Full real-device/simulator smoke test** against the live API — inventory, chat,
  notifications, social/blocking, icon-gen, expiry-scan, Activate button. Nothing dedicated
  since the parity port; only the paywall/purchase flow has been verified so far.
- [ ] Confirm the 7-day free trial is actually active on the **live** subscription products
  (not just configured in RevenueCat's dashboard) — it doubles as judge/reviewer access.
- [ ] Confirm account deletion works from a clean install against the live API.
- [ ] Confirm local notifications fire correctly and route to the right screen on tap.
- [ ] Confirm crash-free session in Sentry (needs the DSN set first — see Reference).
- [ ] App built against prod `EXPO_PUBLIC_API_URL`, no localhost reachable — verify at build
  time (`eas.json` profiles already correct).
- [ ] TestFlight build validated by the whole team on real devices; add internal testers + a
  "What to Test" note.
- [ ] Set release to **manual** in ASC once the real version submission exists (not applicable
  yet — only TestFlight builds so far).

### Market expansion (Malaysia + Korea)
- [ ] Set per-storefront subscription prices: Malaysia `RM12.90`/`RM89`, Korea `₩3,900`/`₩25,000`.
- [ ] App Store Connect localized metadata for `en`/`ko`/`ms` (name, subtitle, description,
  keywords, screenshots — at minimum `ko`, Korean downloads depend on it).
- [ ] Set App Store availability to include Malaysia + Korea.
- [ ] **Korean-language privacy policy** — `/privacy/ko/` is still a 404. Needs a real
  translation, not unsupervised machine translation for a legal document.
- [ ] **Known compliance gap:** the cross-border-transfer consent checkbox (Korea PIPA) only
  covers email/password sign-up — Apple/Google social sign-in creates users too and skips it.
  Needs a pre-OAuth consent interstitial for new social-signin users.

### Shipaton / Devpost (deadline: same Sep 30, 11:45pm PDT)
- [ ] Devpost project page + feature description.
- [ ] Demo video ≤2:00, public on YouTube/Vimeo, no copyrighted music/footage.
- [ ] #BuildInPublic thread/dev log, updated 2-3×/week.
- [ ] Peace Prize impact statement (household food-waste → savings + environmental).
- [ ] App Store URL on the submission.
- [ ] **Submit on Devpost before the deadline.**
- **Don't** market as "launched" anywhere public (TestFlight link, ProductHunt, press) before
  the store listing is live — risks Shipaton's "brand-new app" disqualification.

### Deferred to post-launch (don't work on these before Sep 30)
- [ ] Copy backups off the VPS (weekly droplet snapshot is on; add pg_dump → object storage).
- [ ] Sentry DSN (crash monitoring is scaffolded, currently a no-op).
- [ ] `apps/web/lib/thatfridge` → `packages/core` extraction (most already moved).
- [ ] `react-i18next` + `expo-localization` — ship Korean (and optionally Malay) UI as an OTA,
  no rebuild needed.
- [ ] Android: `eas build -p android`, Play Console, Data Safety form, screenshots, submit.
  Decide personal vs. organization account type first.
- [ ] Web deployment: `expo export -p web`, wide-viewport (≥900px) layouts, retire legacy
  `apps/web`.
- [ ] PixelMix font: get written confirmation the desktop EULA covers app/web embedding (email
  font@andrewtyler.net), and drop the unused unofficial `PixelMix-Bold.ttf`.
- [ ] Privacy Policy §11 promises material changes get "surfaced in the app" — nothing does
  that yet.

---

## Reference

### Cost tracker (all USD, approximate)

| Item | Cost | Status |
| --- | --- | --- |
| Apple Developer Program | $99/yr | Paid |
| Domain — `thatfridge.com` | ~$10.46/yr | Paid |
| PixelMix commercial font licence | $25 one-time | Paid (embedding confirmation pending, see above) |
| VPS — DigitalOcean SGP1, 2 vCPU/2GB + backups | $21.60/mo | Live |
| Legal site hosting (Cloudflare Workers), email routing | $0 | Live |
| Sentry, RevenueCat, Expo EAS, Devpost | $0 | Free tiers |
| Google Play Console | $25 one-time | Deferred (post-launch) |

**Fixed recurring cost: ≈$30.72/mo ($368.66/yr)**, regardless of user count. Apple's commission
is 15% once the Small Business Program application (submitted 2026-09-05) is approved, 30%
until then. **US withholding:** 30% on US-storefront sales only (Malaysian individual, no US
tax treaty, W-8BEN filed) — shouldn't bite much given MY/KR are the target markets, but stacks
with Apple's cut on whatever US sales do happen.

### Business model — bottom line

Break-even is **≈20 paying subscribers** at 15% commission, **≈25** at 30% — a low, genuinely
achievable bar at this infra scale. Blended contribution margin per subscriber is
**≈$1.24-1.56/mo** (65/35 annual/monthly mix assumption) after Apple's cut and AI cost. AI cost
itself is trivial (~$0.15-0.40/mo per active Pro subscriber, ~$0.10/mo per free user) — the
real risk was ever unbounded free-tier usage, which is now closed (see Free-tier limits below).
Full reasoning, psychology notes, and benchmark-vs-confirmed figure tagging: see git history
(`3a. Business & pricing analysis`, commit history 2026-09-05) if this needs revisiting with
real post-launch data.

**Not captured in this model:** paid user acquisition (growth is organic/#BuildInPublic, so
acquisition cost is ≈$0 but also caps growth speed), your own time, refunds.

### RevenueCat / subscriptions

Two products, **permanent IDs — never reusable, don't typo**: `thatfridge_pro_monthly`
($2.99/mo) and `thatfridge_pro_yearly` ($19.99/yr), both with a 7-day free trial, both status
"Ready to Submit" in ASC. Pro unlocks: unlimited AI chat/what-to-eat, receipt & photo bulk-add,
multiple/shared fridges. Sandbox purchase + restore verified end-to-end 2026-09-05.

### Free-tier limits (all enforced server-side, not just client-side)

| Feature | Free tier | Pro |
| --- | --- | --- |
| AI chat (Quick Chat + "Activate {agent}", shared budget) | 5/week | Unlimited |
| Icon generation | 5/week | Unlimited |
| Expiry-date photo scan | 10/week | Unlimited |
| Receipt / fridge-photo scan | Not available | Unlimited |
| Fridges (owned or joined, total) | 1 | Unlimited |

Every AI-calling route also has a floor-level `throttle` regardless of Pro status, as abuse
protection against direct API hammering.

### Demo / reviewer account

`keira@thatfridge.test` — pre-seeded with a fridge + 7 curated recipes (no alcohol references,
relevant for the age-rating answer). **Change the password before submitting** (see checklist).

### Locked decisions — no re-litigation

NativeWind · Expo Router · pnpm workspaces + turborepo · bundle id `test.thatfridge.app` · iOS
target 15.1 · Apple enrollment Individual · v1 notifications local/on-device (server push is
already built too, for social events) · Android deferred entirely · one universal UI codebase
(`react-native-web` renders `apps/mobile` in a browser; legacy `apps/web` retired once web
output ships) · signing keys + Apple assets in a shared password manager · **v1 app UI is
English-only**, localized store listings only.

### Infra & CD

- API: `https://api.thatfridge.com` (DigitalOcean SGP1, `167.172.88.75`, PHP 8.5/Nginx/
  Postgres/Redis). CD: `.github/workflows/deploy-api.yml`, push to `main` → test → deploy.
- Legal site: `https://thatfridge.com` (Cloudflare Workers). CD:
  `.github/workflows/deploy-legal.yml`.
- Mobile OTA: `.github/workflows/eas-update.yml`, push to `main` touching `apps/mobile`/
  `packages` → production channel.
- Mobile native builds: `.github/workflows/testflight.yml`, `git tag v*` or manual dispatch.
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
   patterns — the published paywall is already built to spec.
2. **Guideline 4.2 (thin-wrapper rejection).** Low risk for a real RN app with substantial
   native feature use; a written rebuttal is on hand in `STORE_LISTING.md` §3 if needed — don't
   submit it pre-emptively.
3. **Shipaton "first public release" timing.** No public TestFlight link/press before the store
   listing is live.
4. **The deadline is a wall.** Sep 30, no extensions. Submit ~2 weeks early; be ready for
   same-day resubmits if rejected.
5. **Scope creep.** Anything not already in the app is post-launch OTA. The paywall is
   mandatory — don't trade release-track time for a nice-to-have screen.

### QA matrix

| Area | Checks |
| --- | --- |
| Devices | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device |
| Auth | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session |
| Core loop | add item, barcode scan (camera allow/deny/deny-then-enable), inventory edit/delete, mark recipe made decrements stock |
| Notifications | local alert fires at the right time, taps route to the item, permission denied handled |
| Paywall | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe |
| Network | airplane mode on every screen, slow 3G, API 500s, retry paths |
| Lifecycle | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly |
| Compliance | account deletion from a clean install, privacy-policy link opens, demo account works fresh |
