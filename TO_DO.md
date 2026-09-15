# ThatFridge — TO DO (iOS launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store**, live and approved. iOS only. Native Expo /
React Native — no Capacitor, no WebView. Also our **RevenueCat Shipaton 2026** entry.

**Target markets:** Malaysia at launch (+~140 storefronts); South Korea is a post-approval
fast-follow (see Deferred). API hosted in Singapore; v1 app UI is English-only.

**Hard deadline: Sep 30, 2026, 11:45pm PDT.** The app must be **fully published and live**
(review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-09-15):** app is feature-complete — backend, RevenueCat, mobile all live.
`v1.3.0 (18)` was reviewed 2026-09-11 and **rejected** (Guideline 2.1(b) + 5.1.1(v)); both root
causes are fixed in code. What's left is a new build + resubmit (below) — that's the only thing
between here and launch.

---

## What's left to do

### Ship by Sep 30 (App Store + Shipaton — one deadline)

**App Store**

- [x] `v1.3.0 (18)` rejected 2026-09-11 — Guideline 2.1(b) (couldn't locate the IAPs) +
  5.1.1(v) (no account deletion found). Both fixed (`7e775ed`, `d639fd1`):
  1. The demo/review account (`keira@thatfridge.test`) was hardcoded Pro on the client, which
     hid every paywall entry point — Profile → Subscription now has a "View plans" button that
     force-opens the real paywall regardless of entitlement.
  2. All 5 App Store IAPs were stuck at "Ready to Submit" in ASC, never attached to a submitted
     version — genuinely invisible to the reviewer independent of the client bug (see Resubmit).
  3. Account deletion already existed but sat as an unlabeled button — now under a clear
     "Account" section header.
- [ ] **New build** — pure JS fix, same `version` 1.3.0 (no native change, no version bump).
  Trigger `testflight.yml` manually from the Actions tab (`workflow_dispatch`), not a tag push,
  since the marketing version isn't changing.
  - Smoke-test after: sign in as `keira@thatfridge.test`, Profile → Subscription → View plans
    opens the real paywall with all 5 products priced correctly.
- [x] Screenshots uploaded (2026-09-08).
- [ ] **Resubmit** — in ASC pick the new build, **attach all 5 IAPs (2 subscriptions + 3 credit
  packs) to this version and submit them for review together with it** — this is the step that
  was actually missing and caused the 2.1(b) rejection. Reply to the review thread (Resolution
  Center) with the draft below; for 5.1.1(v), attach a screen recording of the full
  delete-account flow (sign in as demo → Profile → Account → Delete account → confirm twice) in
  the Notes field.

  <details>
  <summary>Draft reply — Resolution Center (submission 60752a52-3b30-446c-b4ec-0d2a54df3d34, v1.3.0/18)</summary>

  **Guideline 2.1(b) — In-App Purchases**

  Thank you for flagging this. We found the cause: our review account was configured to
  always display as fully subscribed on the client, which suppressed every entry point to
  the paywall — there was no way to reach the In-App Purchase screen from that account in
  the build you reviewed.

  We've fixed this in a new build. To locate the In-App Purchases:

  1. Sign in with the review account (credentials in App Review Information).
  2. Go to the **Profile** tab (bottom right).
  3. Under **Subscription**, tap **View plans**.

  This opens our paywall showing all products: `thatfridge_pro_monthly`,
  `thatfridge_pro_yearly`, and three consumable credit packs (`credits_100`, `credits_500`,
  `credits_1500`). We've also attached all 5 products to this submission for review and
  confirmed the Paid Apps Agreement is active in the Business section of App Store Connect.

  We are not restricting IAP access by storefront or device configuration.

  **Guideline 5.1.1(v) — Account deletion**

  Account deletion has been present in the app since before this submission; we believe it
  was simply hard to find. We've now placed it under a clearly labeled "Account" section.
  To locate it:

  1. Sign in with the review account (or create a new account).
  2. Go to the **Profile** tab.
  3. Scroll to **Account** → tap **Delete account**.
  4. Confirm twice ("Delete account", then "Delete forever").

  This permanently deletes the account server-side (no deactivation/soft-delete) with no
  further customer-service steps required. A screen recording of the full flow is attached
  in the Notes field of the App Review Information section.

  *Before pasting: fill in the actual build number once known; confirm the Paid Apps
  Agreement is genuinely Active in ASC → Business before claiming it; record and attach the
  account-deletion video in App Review Information → Notes, not in this reply.*
  </details>

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

- [ ] **Korea launch** — metadata-only fast-follow, no binary re-review. Real blocker: a
  **Korean privacy policy** at `/privacy/ko/` (currently 404) — ~$200–350 for a KR legal
  translator, or ~$300–600 for a PIPA-compliance consultant who adapts rather than translates
  (keep an "English version prevails" clause). Also needs a *separate, unticked* cross-border
  consent checkbox on every sign-in path gated on KR locale (today's mechanism covers MY/UK/CH
  but isn't PIPA gold-standard), KR pricing (₩3,900/₩25,000), KR listing metadata + screenshots
  (captions in `SCREENSHOTS.md` §6), and re-checking the KR storefront in ASC → Availability.
- [ ] **Translation sourcing** (KR policy above, later a KR/MS app UI): paid native review beats
  translate-from-scratch — Fiverr/Upwork $30–80 for a review pass, ProZ.com for real legal
  translators. App UI strings (once i18n is wired) via Crowdin/Lokalise/Weblate, ~$150–300 for a
  full KO set. Malaysia's pdp.gov.my / Korea's pipc.go.kr publish model privacy notices worth
  adapting rather than translating from ours.
- [ ] Onboarding polish — personalized payoff copy from stored `preferences` tags + a peak-end
  "you're all set" beat, and contextual coach-marks (crew tabs in `/eat`, drag-to-reorder in
  Inventory, Kitchen Score). Waits on `app:onboarding-funnel` data. See
  `apps/mobile/ONBOARDING.md` → "Still open" — rest of onboarding is shipped.
- [ ] Personal-goal feature, done right (old Goal screen removed for v1 — confusing metrics,
  dishonest weekly/monthly period). If rebuilt: one intuitive metric ("items rescued"), a live
  Home card, an honest timeframe. Backend `user_goals`/`UserGoalController`/`progress.ts` still
  exist, unused by the client.
- [x] Pro AI spend ceiling — done via the credit system (2026-09-08): every model call is
  metered per action, so per-user spend is bounded by construction. $10 pre-loaded on
  OpenRouter + fal.ai each, auto-recharge **OFF** (caps total exposure at the pre-loaded
  balance — refill manually as usage grows). Open: turn on low-balance email alerts on both
  dashboards so a refill isn't missed.
- [ ] Photographic recipe hero image. Recipes carry `icon`/`icon_url` (curated or generated);
  still open is an optional full-bleed photo (`image_url`, `flux/schnell` no-rembg ~$0.003/img)
  on the card + detail. Web parity for the icon picker also unbuilt.
- [ ] **Flip media storage to Cloudflare R2** when the VPS disk hits ~50% or before ~500 active
  users. Uploads already route through `config('filesystems.media_disk')` (default `public`) —
  the switch is env vars + a one-off file copy + URL rewrite. Runbook: `backend/DEPLOY.md` §13a.
  ~$0 under R2's 10GB free tier, then ~$2–5/mo.
- [ ] Sentry DSN (crash monitoring scaffolded, currently a no-op).
- [ ] `apps/web/lib/thatfridge` → `packages/core` extraction (most already moved).
- [ ] `react-i18next` + `expo-localization` — i18n plumbing so a Korean/Malay UI ships as an
  OTA, no rebuild. Getting strings translated is the sourcing item above.
- [ ] Android: CI pipeline is ready (`.github/workflows/google-play.yml`, manual dispatch only —
  see `RELEASE.md` "Google Play"). Still open: create the Play Console account (personal vs.
  organization — can't change later), the app record + Data Safety form + screenshots, the
  one-time manual first upload, and the Google Cloud service account key handoff to EAS. Also
  needs its own Android Google Sign-In OAuth client (separate from iOS's) if that button should
  work there.

  **Google Play Developer Program Policy pass (2026-09-15)** — checked against the current
  policy text, cross-referenced with the same codebase already audited for Apple (permission
  strings, no tracking, subscription disclosure, account deletion, privacy policy — all already
  compliant, same code). Android/Google-specific items:
  - [ ] **Target API level 36 (Android 16) by Aug 31, 2026** for new apps, Billing Library v8+.
    No manual override in this project (`expo-build-properties` isn't used) — Expo SDK 57
    almost certainly ships a compliant default already, but this needs confirming on the actual
    first Android build (step 3 above), not assumed.
  - [x] In-app subscription cancellation (Google's 2026 "easy-to-use, in-app cancel" policy) —
    already covered by `openCustomerCenter()` (RevenueCat Customer Center), which is
    cross-platform in the existing code, not iOS-gated. No change needed once Android IAP
    products exist in RevenueCat.
  - [ ] **UGC reporting is stricter in wording than Apple's.** Google's policy says apps with
    user interaction must provide "in-app functionality for reporting" — the mailto-based report
    added for the Apple pass (`FridgeNotes.tsx`, `find-friend.tsx`) commonly passes review in
    practice since the action originates in-app, but is a literal gap vs. the policy text.
    Deliberately left as-is for now (see 2026-09-15 discussion) — revisit with a true in-app
    report flow (new backend endpoint + modal, no Mail hand-off) if Android review ever flags it,
    or proactively before submitting if there's time to spare.
  - [ ] Play Console "App content" declarations (all metadata tasks, blocked on having an
    account): Data safety form, ads declaration (answer "No ads"), content rating (IARC)
    questionnaire, target audience/age group. No code involved.
- [ ] Web deployment: `expo export -p web`, wide-viewport (≥900px) layouts, retire legacy
  `apps/web`.
- [ ] PixelMix font: get written confirmation the desktop EULA covers app/web embedding (email
  font@andrewtyler.net), drop the unused unofficial `PixelMix-Bold.ttf`.
- [ ] Privacy Policy §11 promises material changes get "surfaced in the app" — nothing does
  that yet.
- [ ] **Recipe attachments still on the public media disk** (unlike receipts/photos — see
  Security below — these are actively displayed, so privatizing needs a real data-model change:
  store a disk path instead of a baked URL, regenerate the signed URL fresh on every read. No
  mobile change needed. Worth doing carefully, not last-minute.

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
($2.99/mo) and `thatfridge_pro_yearly` ($19.99/yr), both with a 1-week free intro offer, both
attached to the version. Pro grants a **400-credit monthly bundle** (vs 50 free), rolls over up
to 800, and unlocks hosting shared fridges (see AI credits below). Paywall = the RevenueCat
dashboard paywall (`RevenueCatUI.Paywall`) — editor at
`app.revenuecat.com/projects/c6c4cdf4/paywalls/pwec1165df9a414243/builder`, published revision
36 (credit-model copy, live in the app). ASC API key + vendor number `94767188` set in
RevenueCat.

<details>
<summary>Canonical paywall content (rebuild reference)</summary>

- Headline: **Get more out of your fridge** (turquoise `#26c6da`, ~22pt bold, centered)
- Subtitle: *Know before you open the door.*
- Comparison card — header row `· / Free / Pro`, then:

  | Feature | Free | Pro |
  | --- | --- | --- |
  | Fridge & pantry tracking, expiry alerts | ✓ | ✓ |
  | Monthly AI credits (chat, scans, icons) | 50 | 400 |
  | Bulk-add from a receipt or fridge photo | Uses credits | Uses credits |
  | Buy more credits anytime | ✓ | ✓ |
  | Own more than one fridge | – | ✓ |
  | Host a shared fridge for your household | – | ✓ |

- Footer: *Every AI action spends credits. Free gives you 50 a month; Pro gives you 400, rolls
  the unused ones over, and unlocks hosting shared fridges.*
- Rules: sentence case, **never the word "unlimited"**, lead with the credit number not a
  weekly cap.
- Trial line: *7-day free trial, then {{ product.price_per_period }}. Renews automatically until
  you cancel.* CTA: **Get Pro access**.

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

Every AI action spends credits from `users.ai_credits`; `ChatQuota` is deleted. The backend
ledger (`ai_credit_ledger`, unique on `reason`+`ref`) is authoritative; RevenueCat Virtual
Currency (`AICR`) is a best-effort display mirror.

| Action | Cost | Notes (`App\Support\CreditCost`) |
| --- | --- | --- |
| Quick Chat message | 1 | `+2` surcharge (best-effort) when the crew used a tool |
| AI icon generation (item + recipe) | 3 | curated pixel picks are free |
| Expiry-date photo scan | 2 | no refund — the vision call runs even on "not found" |
| Receipt scan | 3 | refunded on hard failure |
| Fridge-photo scan | 3 | refunded on hard failure |
| Add-item auto-fill | 1 | 402 → top-up prompt on the draft card |
| Memory extraction | 0 | tiny call right after a chat that already paid |
| Home crew tip cards | 0 | cached per user+agent per day |
| Quick Chat with a photo | 3 | vision is ~3-5× a text chat; refund matches on failure |

Grants: free accounts topped up to 50/month; Pro gets 400/month, rolling over up to 800.
`app:grant-monthly-credits` runs `monthlyOn(1, 00:15)`; the RevenueCat webhook also grants the
Pro bundle on a paid `INITIAL_PURCHASE`/`RENEWAL` and pack credits on a consumable
`NON_RENEWING_PURCHASE` (`credits.packs`: `credits_100/500/1500`) — idempotent via the ledger's
`reason`+`ref` key.

**Trial-farming guard**: a `period_type: TRIAL` `INITIAL_PURCHASE` grants **nothing** (trial
user keeps their free 50) and sets `pro_trial_until`; the 400 bundle lands only on a paid
`RENEWAL`. Without this: start trial → 400 credits → cancel day 6 → $0, repeatable per Apple ID.

**Signup cap**: 6/min + 20/day per IP on `/register` (each account carries free credits) — full
email verification is the real fix, deferred (needs a mobile verify screen).

**Host a shared fridge** stays a hard Pro gate (not credits) — `FridgeJoinRequestController`
requires `$fridge->user->isPro()`. Being invited is free; already-joined members keep access if
the owner drops to free.

**Manual setup still owed:**
- [x] RevenueCat Virtual Currency `AICR`, 3 consumable products, `credits` offering — all
  created via API.
- [x] Trial-guard migration + webhook consumable-purchase handling — confirmed via passing
  tests (`RevenueCatWebhookControllerTest`), and every deploy runs `migrate --force`.
- [ ] App Store Connect: the 3 consumable IAPs are "Ready to Submit" but not yet submitted with
  a build — tracked as the same item as the App Store "Resubmit" step above (all 5 IAPs go
  together).
- [ ] prod `.env` → `REVENUECAT_SECRET_API_KEY=…` for the credit→VC display mirror. Optional —
  the ledger is authoritative without it.
- [ ] After submission: detach the two RC Test Store products (`monthly`, `yearly`) from the
  Monthly/Yearly packages so the paywall serves only the real `thatfridge_pro_*` products.

### Shared icon pack (curated from user generations)

Generated icons can be hand-picked into an app-wide pack shown in both icon pickers. On the prod
box: `php artisan app:generated-icons --html=/tmp/icons.html` (review) →
`php artisan app:promote-icon <id> --label="Tomato"` (live for everyone) →
`app:demote-icon <shared_id>` to pull one. Promotion **copies** the image to `shared-icons/`
with no `user_id`, so it survives the generator deleting their icon or account. Legal cover:
`apps/legal/terms` §4 + `privacy` §3/§5. Only promote generic, non-personal food icons.

### Quick Chat tools (`AgentToolbox`)

27 tools on top of `fetch_url` browsing:

- **Reads:** `list_items`, `list_notes`, `list_shopping`, `list_recipes`, `list_fridges`,
  `get_recipe`, `get_kitchen_score`, `list_facts`
- **Writes (direct, reversible):** `add_item`, `bulk_add_items`, `update_item`, `move_item`,
  `mark_item_used`, `add_to_shopping`, `check_off_shopping`, `remove_from_shopping`, `add_note`,
  `update_note`, `remove_note`, `remember_fact`, `forget_fact`, `save_recipe`,
  `mark_recipe_made`, `import_recipe_from_link`
- **Deletes (confirm-first):** `remove_item`, `clear_expired_items`, `delete_recipe` (own only)

Loop bounded by `MAX_TOOL_ROUNDS = 5` + `MAX_TOOL_CALLS = 10` (`fetch_url` keeps its own
`MAX_FETCHES = 2`). A tool exchange costs the 1-credit message + a best-effort `+2` surcharge
(never hard-fails mid-reply). All agents get all tools; model stays Haiku 4.5.

**Still open:** `add_item`/`save_recipe` icon-guessing only covers a curated-10 keyword map
(port the full `guessFoodIcon` post-launch); `save_recipe` skips `meal_type`/`vibes`/
`food_focus` tags (advisory, filled in if re-saved from the app); a confirm *card* in the UI
(vs. text round-trip) is deferred; no tools yet for recipe favourite/unfavourite,
`suggest_recipes`, user categories, or shopping→fridge handoff — nice-to-have, none hit in week
one. Buy links (`shop_url`) are opened in-browser only, never fetched server-side.

### Data retention

`app:prune-stale-data` runs daily (04:00): `analytics_events` >180d, `notification_events`
(done >60d / any >180d), terminal `fridge_join_requests` >90d, `photos/`+`receipts/` scan images
+ orphaned `icons/`/`recipe-attachments/` files >7d. Not pruned: `chat_history` (needs a "kept
12 months" UI message first), and real user data (items, recipes, usage history, memory).
`--dry-run` reports without deleting. `photo_scans`/`receipts`/`receipt_line_items` tables are
dead schema — the vision services store the file and return it inline, never writing a row.

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

`keira@thatfridge.test` — pre-seeded shared fridge ("Home Fridge") with items across all zones +
11 recipes (no alcohol references). Password is an env var (`DEMO_USER_PASSWORD`), live value in
the shared password manager, pasted into ASC's Sign-In fields.

### Privacy & compliance posture (2026-09-07)

**App Store availability:** unavailable in the EU-27 + Iceland + Norway (GDPR + DSA trader
declaration), the non-EU Balkans + Moldova + Ukraine, China (PIPL + ICP filing), Russia +
Belarus, and **South Korea** (temporary — re-enable per the Korea fast-follow above). Available
everywhere else (~140 territories incl. MY, US, UK, Switzerland).

Privacy policy + terms cover the credit model: the AI crew reads *and acts on* kitchen data,
fetches pasted links; consumable AI-credit packs + the RC credit-balance mirror are disclosed;
terms §3 covers credits (consumable, non-refundable, no cash value).

- One English privacy policy (`/privacy/`) + Apple App Privacy labels + in-app account deletion
  — the disclosure floor for ~everywhere sold.
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

NativeWind · Expo Router · pnpm workspaces + turborepo · bundle id `test.thatfridge.app` · iOS
target 15.1 · Apple enrollment Individual · v1 notifications local/on-device (server push
already built too, for social events) · Android deferred entirely · one universal UI codebase
(`react-native-web` renders `apps/mobile` in a browser; legacy `apps/web` retired once web
output ships) · signing keys + Apple assets in a shared password manager · **v1 app UI is
English-only**, localized store listings only.

### Infra & CD

- API: `https://api.thatfridge.com` (DigitalOcean SGP1, `167.172.88.75`, PHP 8.5/Nginx/
  Postgres/Redis). CD: `.github/workflows/deploy-api.yml`, push to `main` → test → deploy
  (runs migrations automatically).
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
   patterns — the published paywall is already built to spec; the code fallback UI (used only
   pre-dashboard-config / Expo Go) got an explicit auto-renewal disclosure line added too
   (2026-09-15 guideline pass).
2. **Guideline 4.2 (thin-wrapper rejection).** Low risk for a real RN app with substantial
   native feature use; a written rebuttal is on hand in `STORE_LISTING.md` §3 if needed.
3. **Shipaton "first public release" timing.** No public TestFlight link/press before the store
   listing is live.
4. **The deadline is a wall.** Sep 30, no extensions. Submit ~2 weeks early; be ready for
   same-day resubmits if rejected.
5. **Scope creep.** Anything not already in the app is post-launch OTA. The paywall is
   mandatory — don't trade release-track time for a nice-to-have screen.

**Full-guideline pass (2026-09-15):** checked 4.8 (Sign in with Apple parity), 3.1.1 (restore),
5.1.1 (privacy manifest, permission strings, data minimization, account deletion), 5.1.2/ATT (no
tracking), 1.2 (UGC — report via `support@thatfridge.com` + working block, per `find-friend.tsx`)
— all compliant.
- [x] Report/block was per-user only (find-friend), not per-note — fixed: `FridgeNotes.tsx` now
  has a "Report" action (mailto, same pattern as the existing user report) on other members'
  notes, both the Home grid and Organizer editor views.
- [x] Quick Chat's `fetch_url` tool has no content-category filtering (SSRF-safe, but no adult/
  violence blocklist) — verified the ASC age-rating questionnaire's "Unrestricted Web Access"
  question is answered **No** (2026-09-15), accurate since it's a narrow tool (recipe-link
  import + citations, capped at 2 fetches/turn), not an in-app browser.

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
