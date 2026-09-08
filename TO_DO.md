# ThatFridge — TO DO (iOS launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native Expo /
React Native — no Capacitor, no WebView. This launch is also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia at launch (plus ~140 other storefronts); South Korea is a
post-approval fast-follow (see Deferred). API hosted in Singapore; v1 app UI English-only.

**Hard deadline: Sep 30, 2026, 11:45 pm PDT.** The app must be **fully published and live**
(Apple review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-09-08):** backend, RevenueCat, and the mobile app are functionally complete
and live. The full pre-sign-in onboarding flow is built and OTA'd (see
`apps/mobile/ONBOARDING.md`); Google Sign-In is wired into the native build. App Store Connect
is largely set up — listing copy, age rating (9+), App Privacy, App Review notes +
`app-review.pdf` attachment, subscriptions priced and "Ready to Submit", intro offers attached.
Binary `1.2.2 (17)` built + uploaded to TestFlight from `main` on 2026-09-08 (contains
everything since the Sep 7 build). The paywall was rewritten 2026-09-08 into a Free-vs-Pro
comparison table — **draft, unpublished**, pending the price / trial checks in the RevenueCat
section below. What's left: smoke-test `1.2.2 (17)`, publish the paywall, screenshots (done),
and the submission. **v1 ships an English-only listing;** Korea localization is a post-approval
fast-follow.

---

## What's left to do

### Ship by Sep 30 (App Store + Shipaton — one deadline)

**App Store**

- [ ] **Cut the `v1.2.2` submission binary** — `app.config.ts` version already bumped to 1.2.2
  (2026-09-07) with Google Sign-In wired into the native build (`@react-native-google-signin`
  URL scheme + client ids; `GOOGLE_CLIENT_IDS` on the VPS lists both the iOS and Web ids). Tag
  `v1.2.2` to trigger the build + auto-submit. `v1.2.1` (`7a1db9a`) is live in TestFlight but
  predates Google + all the onboarding work — everything since is OTA on runtime **1.2.2 only**,
  so the reviewed binary must be 1.2.2.
  - Once it processes: re-run the key smoke paths on the actual binary (**especially "Continue
    with Google"** — never in a shipped build before) and have the team re-check on TestFlight.
- [ ] **Screenshots** — 10-frame marketing set (designed, not plain), plan in
  `apps/mobile/SCREENSHOTS.md`. Friend captures the 9 raw screens from the new build on the demo
  account (`keira@thatfridge.test`, hand over the new password) → send to Claude → Claude
  composites the frames via the `design` skill canvas or an HTML+headless-Chrome template (§5)
  and returns export-ready 1320×2868 PNGs. English set.
- [ ] **Submit** — set release to **manual** in ASC, submit the version.

**Shipaton / Devpost** (same Sep 30, 11:45pm PDT)

- [ ] Devpost project page + feature description.
- [ ] Demo video ≤2:00, public on YouTube/Vimeo, no copyrighted music/footage.
- [ ] #BuildInPublic thread/dev log, updated 2-3×/week.
- [ ] Peace Prize impact statement (household food-waste → savings + environmental).
- [ ] App Store URL on the submission.
- [ ] **Submit on Devpost before the deadline.**
- **Don't** market as "launched" anywhere public (TestFlight link, ProductHunt, press) before
  the store listing is live — risks Shipaton's "brand-new app" disqualification.

### Deferred to post-launch (don't work on these before Sep 30)

- [ ] **Korea launch** — metadata-only fast-follow, no binary re-review. There is no PIPA
  "pass/fail" or pre-approval to clear; the real gates are Apple review wanting a proper
  localized policy, and your own exposure to Korean users. A disclaimer is not a substitute for
  compliance. To turn KR back on:
  - **Korean privacy policy** at `/privacy/ko/` (currently 404) — the one genuine blocker, and
    cheap: ~$200–350 for a KR legal translator, or ~$300–600 for a PIPA-compliance consultant
    who *adapts* it to PIPA norms rather than translating literally (you get the compliance
    check too). Keep an "English version prevails" clause.
  - **Stricter KR consent** — a *separate, explicit, unticked* cross-border checkbox on **every**
    sign-in path including Apple/Google, gated on KR locale. Today's mechanism (email checkbox +
    a notice/affirmative-action before social, recorded as `data_transfer_consented_at`) covers
    MY/UK/CH but isn't PIPA gold-standard.
  - Per-storefront prices: KR `₩3,900` / `₩25,000`. (MY `RM12.90` / `RM89` can go in at the
    main launch.)
  - Korean listing metadata (subtitle, description, keywords) + `ko` screenshot re-render —
    captions drafted in `SCREENSHOTS.md` §6.
  - Re-check the KR storefront in ASC → Availability (unchecked 2026-09-07).

- [ ] **Getting a real translation** (the KR policy above; later the KR/MS app UI):
  - Short legal docs: AI draft → *paid native review*, not translate-from-scratch.
    Fiverr / Upwork $30–80 for a review pass; ProZ.com for actual professional legal
    translators. Always keep "English version prevails".
  - The operator is Malaysian — the `/privacy/pdpa/` Malay notice may just need your own
    careful read.
  - App UI strings (`react-i18next` JSON): a localization platform — Crowdin / Lokalise
    (vetted translator marketplaces) or Weblate (self-host). ~$150–300 for a full KO set.
  - Malaysia's PDP dept (pdp.gov.my) and Korea's PIPC (pipc.go.kr) publish model privacy
    notices in the local language — adapting their structure often beats translating ours.

- [ ] Onboarding polish — personalized payoff copy from the stored `preferences` tags + a
  peak-end "you're all set" beat, and contextual one-shot coach-marks (crew tabs in `/eat`,
  drag-to-reorder in Inventory, the Kitchen Score). Both wait on `app:onboarding-funnel` data.
  See `apps/mobile/ONBOARDING.md` → "Still open". The rest of onboarding is shipped.
- [ ] Personal-goal feature, done right (the old Goal screen was removed for v1 — orphan,
  confusing metrics, dishonest weekly/monthly period). If rebuilt: one intuitive metric
  ("items rescued" = used before it spoiled), a live card on Home, an honest timeframe, maybe a
  badge. Backend `user_goals` table + `UserGoalController` + core `progress.ts` goal code are
  still there, unused by the client.
- [ ] Pro AI spend ceiling — meter real OpenRouter token cost per Pro user per billing cycle
  and cap it at ~$1.00–1.50 of model spend (well under the ~$2.09 net on a $2.99 plan). Debit
  the actual `usage` from each response into a per-user counter; at the ceiling, disable only
  the expensive paths (browsing, receipt/fridge-photo scan, vision) and keep basic text chat.
  Reset on the RevenueCat renewal date (or ISO-month). Update paywall + App Store copy: drop
  the literal "unlimited", use fair-use wording or an allowance. Floor `throttle:15,1` already
  covers hammering; this is margin protection against the heavy-browsing tail.
  - Stopgap now: pre-load a fixed ~$20–30 on **both** the OpenRouter and fal.ai wallets and
    turn on their low-balance email alerts. **Leave auto top-up / auto-recharge OFF on both**
    — a drained balance is a degraded app, but auto top-up removes the only hard ceiling and
    lets a scripted trial-abuser or a bug bill your card with no cap. Top up manually as real
    usage grows. Flip auto top-up on only once the per-user spend ceiling below ships (then
    spend scales predictably with paying users and the runaway cases are capped per account).
- [ ] Photographic recipe hero image. Recipes now carry `icon` + `icon_url` (curated pixel key
  or a generated pixel icon, picked in `recipe-form` → `recipe-icon-picker`, shared weekly budget
  via `generated_icons.kind`/`credits`, `SUM(credits) <= 5`). Still open: an optional full-bleed
  photo (`image_url` on `recipes`, `flux/schnell` no-rembg ~$0.003, `kind` `recipe_photo` at maybe
  2 credits) rendered large on the card + detail. Web parity for the icon picker is also unbuilt
  (legacy `apps/web` — fold into the web retirement below).
- [ ] **Flip media storage to Cloudflare R2** when `df -h` on the VPS shows the droplet disk
  past ~50%, or before ~500 active users. All uploads already route through
  `config('filesystems.media_disk')` (default `public`); the switch is env vars + a one-off
  file copy + URL rewrite. Full runbook: `backend/DEPLOY.md` §13a. Cost: ~$0 under R2's 10 GB
  free tier, then ~$2–5/mo.
- [ ] Sentry DSN (crash monitoring is scaffolded, currently a no-op).
- [ ] `apps/web/lib/thatfridge` → `packages/core` extraction (most already moved).
- [ ] `react-i18next` + `expo-localization` — the i18n plumbing so a Korean (or Malay) UI ships
  as an OTA, no rebuild. Getting the actual strings translated is the "real translation" item above.
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

| Item                                                   | Cost         | Status                                           |
| ------------------------------------------------------ | ------------ | ------------------------------------------------ |
| Apple Developer Program                                | $99/yr       | Paid                                             |
| Domain —`thatfridge.com`                            | ~$10.46/yr   | Paid                                             |
| PixelMix commercial font licence                       | $25 one-time | Paid (embedding confirmation pending, see above) |
| VPS — DigitalOcean SGP1, 2 vCPU/2GB + backups         | $21.60/mo    | Live                                             |
| Legal site hosting (Cloudflare Workers), email routing | $0           | Live                                             |
| Sentry, RevenueCat, Expo EAS, Devpost                  | $0           | Free tiers                                       |
| Google Play Console                                    | $25 one-time | Deferred (post-launch)                           |

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
intro offer, both "Ready to Submit" and attached to the version. Pro unlocks: AI chat / icons /
expiry scans without the free weekly caps, receipt & photo bulk-add, multiple + shared fridges.
Paywall = the RevenueCat dashboard paywall (`RevenueCatUI.Paywall`). Sandbox purchase + restore
verified 2026-09-06. ASC API key + vendor number `94767188` set in RevenueCat.

**Paywall editor** — project `projc6c4cdf4`, paywall `pwec1165df9a414243`, offering
`ofrngb7a8453e53`. Editor: `app.revenuecat.com/projects/c6c4cdf4/paywalls/pwec1165df9a414243/builder`.
Edited 2026-09-08 into a Free-vs-Pro comparison table (see canonical content below). **Draft is
unpublished** pending: (1) price rows show $9.99/$79.99 — confirm the packages serve
`thatfridge_pro_*` not the old `monthly`/`yearly` test products; (2) confirm the 7-day intro
offer is attached to `thatfridge_pro_*` in ASC; (3) minor: Terms/Privacy/Restore link spacing +
placeholder feature icons (crosshair/map/question-mark) — do in the visual builder.

#### Canonical paywall content (rebuild reference)

- Headline: **Get more out of your fridge** (turquoise `#26c6da`, ~22pt bold, centered)
- Subtitle: *Know before you open the door.*
- Comparison card — header row `· / Free / Pro` (Pro header in accent), then:

  | Feature | Free | Pro |
  | --- | --- | --- |
  | Fridge & pantry tracking, expiry alerts | ✓ | ✓ |
  | AI crew chat | 5 / week | ✓ |
  | AI food-icon generation | 5 / week | ✓ |
  | Expiry-date photo scan | 10 / week | ✓ |
  | Bulk-add from a receipt or fridge photo | – | ✓ |
  | Own more than one fridge | – | ✓ |
  | Share a fridge with your household | – | ✓ |

- Footer line under the table: *Free keeps everything you use today. Pro lifts the weekly limits
  and unlocks sharing.*
- Rules: sentence case, **never the word "unlimited"** (a Pro AI spend ceiling is planned — see
  §"Pro AI spend ceiling"), the ✓ + "N / week" already carry the contrast.
- Trial line: *7-day free trial, then {{ product.price_per_period }}. Renews automatically until
  you cancel.* CTA: **Get Pro access**.

#### `app_context` used with the RC Paywall AI editor (`edit-paywall-ai`)

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
premium highlights: no weekly caps on AI crew chat / AI icons / expiry-date scans; bulk-add via
  receipt or fridge photo; own more than one fridge + share a fridge with the household.
visual: primary #26c6da, dark charcoal bg + cyan accent, bold sans headline / regular sans body.
```

### Free-tier limits (all enforced server-side, not just client-side)

| Feature                                                  | Free tier      | Pro       |
| -------------------------------------------------------- | -------------- | --------- |
| AI chat (Quick Chat + "Activate {agent}", shared budget) | 5/week         | Unlimited |
| AI memory extraction (fires after a chat)                | tied to chat budget | Unlimited |
| Add-item "Auto-fill"                                     | 40/week        | Unlimited |
| AI image generation (item + recipe icons, shared budget) | 5/week         | Unlimited |
| Expiry-date photo scan                                   | 10/week        | Unlimited |
| Receipt / fridge-photo scan                              | Not available  | Unlimited |
| Fridges you own                                          | 1              | Unlimited |
| Join a shared fridge you're invited to                   | 1              | Unlimited |
| **Host a shared fridge** (invite people into yours)      | **Not available** | Yes    |

"Host a shared fridge" is enforced in `FridgeJoinRequestController` — `invite()`, the
request-to-join path, and the `attachMember()` chokepoint all require `$fridge->user->isPro()`.
Being *invited* stays free (the acquisition loop). Grandfathering: the gate only blocks *adding*
a member, so anyone already in a fridge whose owner later drops to free keeps their access.
Mobile: `fridge/[id]` shows a Pro-upsell card instead of the invite UI; `find-friend` shows
"Not shared" instead of a Request button (`FriendFridgeSummary.shareable`).

Every AI-calling route also has a floor-level `throttle` regardless of Pro status, as abuse
protection against direct API hammering. As of this pass, **no AI endpoint is unguarded**:
`/memory/extract` gained `throttle:15,1` + skips extraction once a non-Pro user's weekly chat
budget is spent (shared logic in `App\Support\ChatQuota`); `/items/suggest-details` gained a
lenient 40/week cache cap.

### Shared icon pack (curated from user generations)

Generated icons can be hand-picked into an app-wide pack shown in both icon pickers
("MORE ICONS" section). Workflow, all on the prod box as `deploy`:
`php artisan app:generated-icons --html=/tmp/icons.html` (scp it down / open in a browser to
actually see them) → `php artisan app:promote-icon <id> --label="Tomato"` → it's live for
everyone. `app:demote-icon <shared_id>` to pull one. Promotion **copies** the image to
`shared-icons/` with no user_id, so it survives the generator deleting their icon or account.
Legal cover: `apps/legal/terms` §4 (licence to include generated images in the shared set,
no attribution) + `privacy` §3/§5 (review + retention). Only promote generic, non-personal
food icons.

### Data retention

`app:prune-stale-data` runs daily (04:00, `routes/console.php`) and bounds the few unbounded
tables + orphaned upload files: `analytics_events` >180d, `notification_events` (done >60d /
any >180d), terminal `fridge_join_requests` >90d, and `photos/` + `receipts/` scan images +
orphaned `icons/` files >7d. Not pruned: `chat_history` (user-visible — needs a "kept 12
months" UI message first), and the user's real data (items, recipes, usage history, memory).
`--dry-run` reports without deleting. Note: `photo_scans` / `receipts` / `receipt_line_items`
tables are dead schema — the vision services store the file and return it inline, never
writing a row.

### Demo / reviewer account

`keira@thatfridge.test` — pre-seeded shared fridge ("Home Fridge") with items across all zones +
11 recipes (no alcohol references). Password is now an env var (`DEMO_USER_PASSWORD`) — rotated
2026-09-06, live value in the shared password manager, and pasted into ASC's Sign-In fields.

### Privacy & compliance posture (2026-09-07)

**App Store availability — set 2026-09-07:** unavailable in the EU-27 + Iceland + Norway (GDPR +
the DSA trader declaration), the non-EU Balkans + Moldova + Ukraine, China (PIPL + ICP filing),
Russia + Belarus, and **South Korea** (temporary — re-enable as a metadata-only fast-follow once
the KR-rollout items ship). Available everywhere else (~140 territories incl. MY, US, UK,
Switzerland) — those laws don't block the storefront and the policy + consent + account
deletion is a defensible baseline there.

What's covered for the markets we sell in:

- One English privacy policy (`/privacy/`) + Apple App Privacy labels + in-app account deletion
  — the disclosure floor for ~everywhere we sell.
- **Cross-border-transfer consent on every sign-up path** — email checkbox; a notice +
  affirmative action before Apple / Google; recorded as `users.data_transfer_consented_at`.
  Satisfies MY (PDPA) / UK / Switzerland.
- **Malaysia:** bilingual Section 7 notice at `/privacy/pdpa/`; breach process in
  `INCIDENT_RESPONSE.md`.
- **UK / Switzerland:** policy has region sections + lawful bases. Art. 27 UK representative /
  Swiss rep are *technically* applicable for a non-established operator but low-enforcement at
  this scale — revisit only with real traction there.
- **Korea:** storefront **unchecked for launch**. Re-enable only after the Korean-language
  policy (`/privacy/ko/`) and the stricter unticked-checkbox consent on every path ship (see
  Deferred → "Korea launch").
- Adding the EU later is a much bigger lift (DSA trader info, GDPR lawful basis, tracking
  consent, EU representative) — treat as its own project.

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

| Area          | Checks                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Devices       | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device                                                            |
| Auth          | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session                     |
| Core loop     | add item, barcode scan (camera allow/deny/deny-then-enable), inventory edit/delete, mark recipe made decrements stock |
| Notifications | local alert fires at the right time, taps route to the item, permission denied handled                                |
| Paywall       | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow                                        |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe                                 |
| Network       | airplane mode on every screen, slow 3G, API 500s, retry paths                                                         |
| Lifecycle     | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly                               |
| Compliance    | account deletion from a clean install, privacy-policy link opens, demo account works fresh                            |
