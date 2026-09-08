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
everything since the Sep 7 build; the credit-metering rewrite that landed after it is OTA).
AI usage was moved from weekly Pro caps to a **credit model** on 2026-09-08 (see "AI credits"
below) — backend deployed, mobile OTA'd, but RevenueCat Virtual Currency + credit-pack IAPs
still need dashboard setup (checklist in that section). The paywall was rewritten 2026-09-08
into a Free-vs-Pro comparison table — **draft, unpublished**, pending the price / trial checks
**and** a copy pass for the credit model. What's left: the RC credit setup, smoke-test
`1.2.2 (17)` + a fresh build with the credit code, publish the paywall, screenshots (done),
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
- [x] Pro AI spend ceiling — **done via the credit system** (`50f4034` / `c5640bf`, 2026-09-08).
  Pro is capped at 400 credits/month (+800 rollover); every model call is metered per action,
  so per-user model spend is now bounded by construction. Pack buyers can spend more, but they
  paid for it. What's left is only wallet hygiene:
  - Pre-load a fixed ~$20–30 on **both** the OpenRouter and fal.ai wallets and
    turn on their low-balance email alerts. **Leave auto top-up / auto-recharge OFF on both**
    — a drained balance is a degraded app, but auto top-up removes the only hard ceiling and
    lets a scripted trial-abuser or a bug bill your card with no cap. Top up manually as real
    usage grows. Now that per-user spend is capped by credits, auto top-up is defensible once
    real paying volume makes manual refills annoying.
- [ ] Photographic recipe hero image. Recipes now carry `icon` + `icon_url` (curated pixel key
  or a generated pixel icon, picked in `recipe-form` → `recipe-icon-picker`; generation costs
  3 AI credits, curated picks are free). Still open: an optional full-bleed
  photo (`image_url` on `recipes`, `flux/schnell` no-rembg ~$0.003) rendered large on the card +
  detail. Web parity for the icon picker is also unbuilt
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
real risk was ever unbounded AI usage, now closed by per-action credit metering (see "AI credits").
Full reasoning, psychology notes, and benchmark-vs-confirmed figure tagging: see git history
(`3a. Business & pricing analysis`, commit history 2026-09-05) if this needs revisiting with
real post-launch data.

**Not captured in this model:** paid user acquisition (growth is organic/#BuildInPublic, so
acquisition cost is ≈$0 but also caps growth speed), your own time, refunds.

### RevenueCat / subscriptions

Two products, **permanent IDs — never reusable, don't typo**: `thatfridge_pro_monthly`
($2.99/mo) and `thatfridge_pro_yearly` ($19.99/yr, "1 Year Upfront"), both with a Free / 1-week
intro offer, both "Ready to Submit" and attached to the version. Pro grants a **400-credit
monthly bundle** (vs 50 free), rolls over up to 800, and unlocks **hosting** shared fridges
(see "AI credits" below — metering replaced the old weekly caps 2026-09-08).
Paywall = the RevenueCat dashboard paywall (`RevenueCatUI.Paywall`). Sandbox purchase + restore
verified 2026-09-06. ASC API key + vendor number `94767188` set in RevenueCat.

**Paywall editor** — project `projc6c4cdf4`, paywall `pwec1165df9a414243`, offering
`ofrngb7a8453e53`. Editor: `app.revenuecat.com/projects/c6c4cdf4/paywalls/pwec1165df9a414243/builder`.
Edited 2026-09-08: Free-vs-Pro comparison table, then reworded to the **credit model** (rows =
canonical content below; "50 / 400 monthly AI credits", rollover, top-up, own/host a fridge).
**Draft is unpublished** pending: (1) price rows show $9.99/$79.99 because the Monthly/Yearly
packages still have the RC **Test Store** products (`monthly`, `yearly`) attached alongside
`thatfridge_pro_*` — detach the Test Store pair after the first submission syncs the real
prices; (2) confirm the 7-day intro offer shows on-device; (3) minor: Terms/Privacy/Restore
spacing + placeholder feature icons — do in the visual builder. On a real device StoreKit
serves the right price regardless of the dashboard, so the smoke test is the real check.

#### Canonical paywall content (rebuild reference)

- Headline: **Get more out of your fridge** (turquoise `#26c6da`, ~22pt bold, centered)
- Subtitle: *Know before you open the door.*
- Comparison card — header row `· / Free / Pro` (Pro header in accent), then:

  | Feature | Free | Pro |
  | --- | --- | --- |
  | Fridge & pantry tracking, expiry alerts | ✓ | ✓ |
  | Monthly AI credits (chat, scans, icons) | 50 | 400 |
  | Bulk-add from a receipt or fridge photo | Uses credits | Uses credits |
  | Buy more credits anytime | ✓ | ✓ |
  | Own more than one fridge | – | ✓ |
  | Host a shared fridge for your household | – | ✓ |

- Footer line under the table: *Every AI action spends credits. Free gives you 50 a month; Pro
  gives you 400, rolls the unused ones over, and unlocks hosting shared fridges.*
- Rules: sentence case, **never the word "unlimited"**, lead with the credit number not a
  weekly cap.
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
premium highlights: 400 AI credits a month vs 50 (credits pay for crew chat, receipt/fridge
  scans, icon generation), unused credits roll over; own more than one fridge; host a shared
  fridge for the household.
visual: primary #26c6da, dark charcoal bg + cyan accent, bold sans headline / regular sans body.
```

### AI credits (metered, server-authoritative)

Shipped 2026-09-08 (`50f4034` backend + deploy, `c5640bf` mobile). Every AI action spends
credits from `users.ai_credits`; `App\Support\ChatQuota` and the client `chatQuota.ts` are
**deleted**. The backend ledger (`ai_credit_ledger`, unique on `reason`+`ref`) is authoritative
for spend; RevenueCat Virtual Currency (`AICR`) is a best-effort mirror for display / Shipaton
showcase (`RevenueCatVirtualCurrency::adjust`, no-op without `REVENUECAT_SECRET_API_KEY` +
`REVENUECAT_PROJECT_ID`).

| Action | Cost | Notes (`App\Support\CreditCost`) |
| --- | --- | --- |
| Quick Chat message | 1 | `+2` surcharge (best-effort) when the crew used a tool |
| AI icon generation (item + recipe) | 3 | curated pixel picks are free |
| Expiry-date photo scan | 2 | no refund — the vision call runs even on "not found" |
| Receipt scan | 3 | refunded on hard failure |
| Fridge-photo scan | 3 | refunded on hard failure |
| Add-item auto-fill | 1 | 402 → top-up prompt on the draft card |
| Memory extraction | 0 | tiny call right after a chat that already paid; route-throttled |
| Home crew tip cards (`compact`) | 0 | not charged; cached per user+agent per day (`compact_insight:` cache key) |
| Quick Chat with a photo | 3 | `CHAT_IMAGE` — vision is ~3-5× a text chat; refund matches on failure |

Grants: free accounts `CREDITS_FREE_MONTHLY` (50) topped up to that floor monthly; Pro
`credits.pro_monthly` (400) added each month, rolling over up to `pro_rollover_cap` (800).
`app:grant-monthly-credits` runs `monthlyOn(1, 00:15)`; the RevenueCat webhook also grants the
Pro bundle on a paid `INITIAL_PURCHASE` / `RENEWAL` and pack credits on a consumable
`NON_RENEWING_PURCHASE` (`credits.packs`: `credits_100/500/1500`). Idempotent via the ledger's
`reason`+`ref` unique key (event id / `monthly:YYYY-MM`). Demo account: 9999.

**Trial farming guard** (`2026_09_08_000008`): a `period_type: TRIAL` `INITIAL_PURCHASE` grants
**nothing** — the trial user keeps their free 50 — and sets `users.pro_trial_until`. The 400
bundle lands only when it converts to a paid `RENEWAL` (`period_type: NORMAL`), which clears
the flag. `app:grant-monthly-credits` also treats a user with a future `pro_trial_until` as
free. Without this, start trial → 400 credits → cancel day 6 → $0, repeatable per Apple ID.

**Tool-loop cost guard**: `import_recipe_from_link` draws on the same `MAX_FETCHES = 2` budget
as `fetch_url` (it makes its own web fetch + model call), so one 3-credit chat turn can't
trigger ~8 uncapped fetches.

**Signup cap** (`AppServiceProvider` `register` limiter): 6/min + **20/day per IP** on
`/register`, since each account carries free credits. Rotating IPs still get around it —
full **email verification** on signup is the real fix but it needs a mobile verify screen,
so it's a post-launch fast-follow, not a pre-Sep-30 change to the release-critical signup path.

Still open (see the analysis): email verification (above); dropping the rollover cap /
monthly grant once real usage data exists. The hard backstop is the prepaid OpenRouter +
fal.ai wallets with **auto-recharge OFF** — total loss is capped at the pre-loaded balance.

Barcode scan and manual add never touch credits. Every AI route keeps its floor-level
`throttle` as hammering protection. `InsufficientCreditsException` renders a 402
`{error: "insufficient_credits", balance, needed}`; the client routes every 402 to `/credits`.

**Host a shared fridge** stays a hard Pro gate (not credits) — `FridgeJoinRequestController`
`invite()` / request-to-join / `attachMember()` all require `$fridge->user->isPro()`. Being
*invited* is free (the acquisition loop); already-joined members keep access if the owner drops
to free. Mobile: `fridge/[id]` upsell card; `find-friend` "Not shared" (`FriendFridgeSummary.shareable`).

**Manual setup still owed** (code is deployed and degrades gracefully until these are done —
credits work off the backend ledger; only the RC mirror + real pack purchases wait on this):

- [x] RevenueCat → Virtual Currency `AICR` created (via API 2026-09-08 — not shown in the
      dashboard nav yet, but live: `list-virtual-currencies` returns it).
- [x] RevenueCat → 3 consumable products (`credits_100/500/1500`) + a **`credits`** offering
      (`ofrngd3a38a3ab9`, not current) with one custom package per pack, created via API. The
      mobile `/credits` screen reads `getOfferings().all["credits"]`.
- [ ] prod → `2026_09_08_000008_add_pro_trial_until_to_users` deploys with the trial-guard
      commit; `deploy.sh` runs `migrate`, just confirm.
- [x] prod → migration `2026_09_08_000007` confirmed run; all 7 users backfilled; demo
      accounts set to 9999; `config:cache` done.
- [ ] App Store Connect → 3 consumable IAPs `credits_100` / `credits_500` / `credits_1500`
      priced + "Ready to Submit" (done), then **submitted with a build** — until then RC shows
      "Could not check" and no `indicative_price` (ASC only exposes IAP metadata post-submission).
- [ ] RevenueCat webhook → confirm it's not filtering out `NON_RENEWING_PURCHASE` (the
      consumable-purchase event the credit grant keys off).
- [ ] prod `.env` → `REVENUECAT_SECRET_API_KEY=…` for the credit→VC mirror (project id defaults
      to `projc6c4cdf4`). Optional; the ledger is authoritative without it. Then `config:cache`.
- [ ] After submission: detach the two Test Store products (`monthly`, `yearly`) from the
      Monthly/Yearly packages so the paywall serves only `thatfridge_pro_*`, then publish the
      paywall draft (already reworded for credits — see below).

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

### Quick Chat tools (`AgentToolbox`)

Agents can call kitchen tools on top of `fetch_url` browsing. All 21 shipped (Tier 1 in
`f0fcc7b`, Tier 2/3 added 2026-09-08):

- **Reads:** `list_items`, `list_notes`, `list_shopping`, `list_recipes`, `list_fridges`,
  `get_recipe`, `get_kitchen_score`
- **Writes (direct, reversible):** `add_item`, `update_item`, `move_item`, `mark_item_used`,
  `add_to_shopping`, `check_off_shopping`, `remove_from_shopping`, `add_note`, `remember_fact`,
  `save_recipe`, `mark_recipe_made`, `import_recipe_from_link`
- **Deletes (confirm-first — `confirm:false` preview, prompt forbids self-confirming):**
  `remove_item`, `clear_expired_items`

Loop bounded by `MAX_TOOL_ROUNDS = 5` + `MAX_TOOL_CALLS = 10` (fetch_url keeps its own
`MAX_FETCHES = 2`). Client passes `fridge_id` (active scope) and refreshes inventory when the
reply carries `mutated: true` — note that flag currently only triggers an *inventory* refresh
on mobile, so a shopping/notes/recipe write won't refresh those views until the next open.
A tool exchange costs the 1-credit message + a best-effort `+2` surcharge (`chat_tools`,
`spendUpTo` so it never hard-fails mid-reply). All agents get all tools; model stays Haiku 4.5.

Notes / still open:
- `add_item` / `save_recipe` guess icons from a **curated-10 keyword map** only (the full pack's
  keywords live in a generated TS file); unknowns get `leftovers`. Post-launch: port the full
  `guessFoodIcon` (copy `food-icon-manifest.json` + keyword data into the backend).
- `save_recipe` skips the `meal_type`/`vibes`/`food_focus` "what to eat" tags (that needs an
  extra model call that would make `AgentToolbox` depend on `AgentService` circularly). Tags
  are advisory; re-saving from the app fills them in.
- A confirm *card* in the UI (vs the text round-trip) is still deferred.
- Sonnet-on-tool-turns: 1-line change at `AgentService.php`'s `runWithTools`. Only do it if
  Haiku fumbles the larger toolset in practice — the `+2` surcharge already makes the user pay.

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
| AI credits    | balance shows on chat + profile, spend decrements it, 0 credits routes to /credits, pack purchase tops up, Pro renewal grants the bundle |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe                                 |
| Network       | airplane mode on every screen, slow 3G, API 500s, retry paths                                                         |
| Lifecycle     | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly                               |
| Compliance    | account deletion from a clean install, privacy-policy link opens, demo account works fresh                            |
