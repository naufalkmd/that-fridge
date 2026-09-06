# ThatFridge — TO DO (iOS launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native Expo /
React Native — no Capacitor, no WebView. This launch is also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia + South Korea. API hosted in Singapore; v1 app UI English-only,
localized store listings + Korean UI fast-follow.

**Hard deadline: Sep 30, 2026, 11:45 pm PDT.** The app must be **fully published and live**
(Apple review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-09-06):** backend, RevenueCat, and the mobile app are functionally complete
and live. App Store Connect is largely set up — listing copy, age rating (9+), App Privacy, App
Review notes + `app-review.pdf` attachment, subscriptions priced and "Ready to Submit", intro
offers attached, paywall published (RC rev 17). What's left is a fresh native build, a
real-device smoke test, screenshots, and the submission. **v1 ships an English-only listing;**
Korea localization is a post-approval fast-follow.

---

## What's left to do

### Blocking submission
- [ ] **New native build** — `apps/mobile` against prod `EXPO_PUBLIC_API_URL`, includes the
  camera-first Add fix (needs a rebuild, not an OTA — Info.plist camera string changed). Push to
  TestFlight.
- [ ] **Screenshots** — 10-frame marketing set (designed, not plain), plan in
  `apps/mobile/SCREENSHOTS.md`. Friend captures the 9 raw screens from the new build on the demo
  account (`keira@thatfridge.test`, hand over the new password) → send to Claude → Claude
  composites the frames via the `design` skill canvas or an HTML+headless-Chrome template (§5)
  and returns export-ready 1320×2868 PNGs. English set now; `ko` re-render post-approval.
- [ ] **Full real-device smoke test** on that build against the live API — run the QA matrix
  (Reference). Nothing dedicated since the parity port. Must pass:
  - Core loop: add item, barcode scan, inventory edit, mark-made decrements stock
  - Add flow: "Scan receipt" / "Photo of fridge" open the camera directly
  - New deletion flows (2026-09-06): inventory bulk-delete in select mode; chat-history
    delete + "Clear all" actually stick after a refresh; notification "Clear" / "Clear all"
    removes rows (not grey-out); long-press a generated icon in the Add picker to delete it
  - First-run: fresh no-items account → carousel, then the "+" spotlight on Home
  - Paywall on device: "Start 7-Day Free Trial" CTA, real $2.99 / $19.99 prices, Restore works,
    Terms/Privacy open `thatfridge.com`
  - Purchase sheet shows "7 days free, then $X" (fresh sandbox Apple ID, never subscribed)
  - Account deletion from a clean install
  - Local notifications fire and route to the right screen on tap
- [ ] **App Store availability** — MY + KR (or MY-first, see Korea section); exclude EU/EEA
  (keeps the DSA "trader" declaration moot — leave the status "non-trader", don't start the
  flow). Confirm primary category = Food & Drink.
- [ ] **TestFlight validated by the team** on real devices — add internal testers + a "What to
  Test" note.
- [ ] **Submit** — set release to **manual** in ASC, submit the version.

### Korea rollout (whenever the KR storefront ships — can trail the English launch)
- [ ] Per-storefront subscription prices: Malaysia `RM12.90` / `RM89`, Korea `₩3,900` / `₩25,000`.
- [ ] Korean listing metadata (subtitle, description, keywords, screenshots) — metadata-only,
  lands after English approval with no binary re-review. Draft screenshot captions in
  `SCREENSHOTS.md` §6.
- [ ] **Korean privacy policy** — `/privacy/ko/` is a 404. Legal requirement for KR (PIPA),
  needs a real translation. If it's not ready, launch **MY-first** and add KR later.
- [ ] Korea PIPA gap: the cross-border-transfer consent checkbox only covers email/password
  sign-up — Apple/Google social sign-in skips it. Needs a pre-OAuth consent interstitial.

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
- [x] ~~First-run onboarding~~ — built + simulator-verified 2026-09-06: skippable 3-slide
  carousel (`onboarding.tsx`) then, for an empty fridge, a spotlight coach-mark on the "+"
  button (`CoachSpotlight.tsx`) — screen dims, button highlighted, tooltip. Gated via
  `useOnboarding()` + `index.tsx` / `(tabs)/_layout.tsx`. Plan: `ONBOARDING_PLAN.md`. Pure JS,
  already OTA'd. Smoke-test with a **fresh no-items account** (the spotlight only shows when the
  fridge is empty). Reviewer notes mention the skippable carousel.
- [ ] Pro AI spend ceiling — meter real OpenRouter token cost per Pro user per billing cycle
  and cap it at ~$1.00–1.50 of model spend (well under the ~$2.09 net on a $2.99 plan). Debit
  the actual `usage` from each response into a per-user counter; at the ceiling, disable only
  the expensive paths (browsing, receipt/fridge-photo scan, vision) and keep basic text chat.
  Reset on the RevenueCat renewal date (or ISO-month). Update paywall + App Store copy: drop
  the literal "unlimited", use fair-use wording or an allowance. Floor `throttle:15,1` already
  covers hammering; this is margin protection against the heavy-browsing tail.
  - Stopgap now: pre-load a fixed ~$20–30 on the OpenRouter key and set the low-balance email
    alert; do the same on fal.ai. **Leave auto top-up OFF** — a drained balance is a degraded
    app, but auto top-up removes the only hard ceiling and lets a scripted trial-abuser or a
    bug bill your card with no cap. Top up manually as real usage grows. Flip auto top-up on
    only once the per-user spend ceiling below ships (then spend scales predictably with
    paying users and the runaway cases are capped per account).
- [ ] AI recipe images + one shared image budget. Give recipes an AI-generated hero image
  (`image_url` on `recipes`, migration, regenerate button in `recipe-form`, render on the card
  + detail). Generate with `fal-ai/flux/schnell` (same model as icons, no rembg pass → ~$0.003).
  **All AI image generation shares one weekly free budget**, not a per-feature limit: rename the
  `generated_icons` concept to a shared `generated_images` table with a `kind` (`icon`/`recipe`)
  and a `credits` int; the free-tier check becomes `SUM(credits) since weekStart <= 5` instead
  of `COUNT(*)`. Icon = 1 credit, recipe image (schnell) = 1 credit. Only bump the recipe image
  to 2 credits if it's ever moved to `flux/dev`/pro (~5-8× the cost). Pro folds under the spend
  ceiling above.
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
($2.99/mo) and `thatfridge_pro_yearly` ($19.99/yr, "1 Year Upfront"), both with a Free / 1-week
intro offer, both "Ready to Submit" and attached to the version. Pro unlocks: unlimited AI
chat/what-to-eat, receipt & photo bulk-add, multiple/shared fridges. Paywall = the RevenueCat
dashboard paywall (`RevenueCatUI.Paywall`), published rev 17. Sandbox purchase + restore
verified 2026-09-06. ASC API key + vendor number `94767188` set in RevenueCat.

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

`keira@thatfridge.test` — pre-seeded shared fridge ("Home Fridge") with items across all zones +
11 recipes (no alcohol references). Password is now an env var (`DEMO_USER_PASSWORD`) — rotated
2026-09-06, live value in the shared password manager, and pasted into ASC's Sign-In fields.

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
