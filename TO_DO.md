# ThatFridge — TO DO (iOS + Android launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store** and **Google Play**, live and approved.
Native Expo / React Native — no Capacitor, no WebView. Also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia at launch (+~140 storefronts); South Korea is a post-approval
fast-follow (see Deferred). API hosted in Singapore; v1 app UI is English-only.

**Hard deadline: Sep 30, 2026, 11:45pm PDT.** The app must be **fully published and live**
(review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-09-17):** iOS — `v1.3.0 (18)` was rejected 2026-09-11 (Guideline 2.1(b) +
5.1.1(v)), both fixed and **resubmitted** 2026-09-16 with all 5 IAPs attached; awaiting Apple's
re-review. Android — new this cycle, actively in progress (own section below): Play Console
account, store listing, and 4 of 5 IAP products are live; blocked on a Closed Testing
requirement + a Payments Profile issue before the last product and full RevenueCat wiring can
finish.

---

## What's left to do

### iOS — App Store

- [x] `v1.3.0 (18)` rejected 2026-09-11 (2.1(b): couldn't locate IAPs; 5.1.1(v): no account
  deletion found) — both root causes fixed (`7e775ed`, `d639fd1`: demo account had no path to
  the paywall; account deletion existed but was unlabeled) and **resubmitted 2026-09-16** with
  a new build, all 5 IAPs attached, Paid Apps Agreement confirmed Active, and a screen recording
  of the delete-account flow linked in App Review Information → Notes. Full reply text is in git
  history (`TO_DO.md` as of commit `37e21a7` or earlier) if it's ever needed again.
- [ ] Awaiting Apple's decision on the resubmission.

### Android — Play Store

Play Console **Personal** account, app record (`app.thatfridge`, Food & Drink, Free), Data
Safety / content rating / ads / financial / health declarations, advertising-ID declaration,
app icon + feature graphic, and the `#delete-account`/`#delete-data` privacy-policy anchors are
all done. First production build shipped to Internal testing; RevenueCat's Android API key
(`EXPO_PUBLIC_RC_ANDROID_KEY`) is wired into EAS and the `Platform.OS`-based key-selection bug
is fixed (`a7fea71`) — the paywall works for whichever products are attached (below).

- [ ] **EAS→Play publishing service account is NOT actually set up**, despite earlier appearing
  configured — a real `eas build --auto-submit` attempt failed with "Google Service Account Keys
  cannot be set up in --non-interactive mode." Needs running `eas credentials` (interactive,
  can't be done from here) → Android → production → Google Service Account → set up, using the
  **Release manager**-role service account JSON (separate from RevenueCat's). Until then, every
  build needs a manual `.aab` upload to Play Console.
- [ ] **Google Play Payments Profile is incomplete** (pay.google.com/business/console) — this is
  the likely root cause of persistent, differently-coded "unexpected error" failures when
  creating the `credits_100` product specifically. Needs the banking/payout + tax (W-8BEN) form
  there completed before retrying.
- [ ] **`credits_100` product still not created** in Play Console — blocked on the above. The
  other 4 products (`thatfridge_pro_monthly` $2.99/mo, `thatfridge_pro_yearly` $19.99/yr,
  `credits_500` $7.99, `credits_1500` $19.99) exist.
- [x] **Attach the Android products to RevenueCat** — done via API 2026-09-17: all 4 synced
  Android products (`thatfridge_pro_monthly:monthly`, `thatfridge_pro_yearly:yearly`,
  `credits_500`, `credits_1500`) attached to the `thatfridge_pro` entitlement and their matching
  offering packages, alongside the existing iOS/Test Store products. `credits_100` isn't in
  RevenueCat yet since it doesn't exist in Play Console (blocked on the payments profile above)
  — attach it the same way once it's created. Purchase-validation on the Android app's
  credentials will likely only go green after a real test purchase, not a config issue.
- [ ] **Closed testing must clear before Play Console allows creating the remaining IAP
  product** — track created and running (started 2026-09-16); check Play Console for the exact
  tester-count/day requirement and days remaining. Internal testing opt-ins do **not** count
  toward this — testers need the Closed-testing-specific opt-in link.
- [ ] **Google Sign-In on Android needs its own OAuth client** (separate from iOS's) — the
  button fails ("sign-in didn't go through") until this exists.
- [ ] Once the above clears: enable the tag trigger is already done
  (`.github/workflows/google-play.yml` fires on the same `v*` tag as `testflight.yml`) — just
  needs the service account fixed for it to actually work end-to-end.
- [x] **Target API level 36 (Android 16) by Aug 31, 2026** — verified 2026-09-17 by dumping the
  actual built `.aab`'s manifest (`bundletool dump manifest`): `targetSdkVersion="36"`,
  `compileSdkVersion="36"`, confirmed compliant, not assumed.
- [ ] **UGC reporting is stricter in wording than Apple's** — Google's policy says "in-app
  functionality for reporting"; the mailto-based report (`FridgeNotes.tsx`, `find-friend.tsx`)
  commonly passes review in practice but is a literal gap vs. the text. Deliberately left as-is;
  revisit with a true in-app report flow only if Android review actually flags it.

### Shipaton / Devpost (same Sep 30, 11:45pm PDT)

- [ ] Devpost project page + feature description.
- [ ] Demo video ≤2:00, public on YouTube/Vimeo, no copyrighted music/footage.
- [x] #BuildInPublic thread/dev log, updated 2-3×/week.
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
  consent checkbox on every sign-in path gated on KR locale, KR pricing (₩3,900/₩25,000), KR
  listing metadata + screenshots (captions in `SCREENSHOTS.md` §6), and re-checking the KR
  storefront in ASC → Availability.
- [ ] **Translation sourcing** (KR policy above, later a KR/MS app UI): paid native review beats
  translate-from-scratch — Fiverr/Upwork $30–80 for a review pass, ProZ.com for real legal
  translators. App UI strings (once i18n is wired) via Crowdin/Lokalise/Weblate, ~$150–300 for a
  full KO set.
- [ ] Onboarding polish — personalized payoff copy from stored `preferences` tags + a peak-end
  "you're all set" beat, and contextual coach-marks (crew tabs in `/eat`, drag-to-reorder in
  Inventory, Kitchen Score). Waits on `app:onboarding-funnel` data. See
  `apps/mobile/ONBOARDING.md` → "Still open."
- [ ] Personal-goal feature, done right (old Goal screen removed for v1). If rebuilt: one
  intuitive metric ("items rescued"), a live Home card, an honest timeframe. Backend
  `user_goals`/`UserGoalController`/`progress.ts` still exist, unused by the client.
- [ ] Turn on low-balance email alerts on the OpenRouter + fal.ai dashboards (the spend-ceiling
  system itself is done — see AI credits below).
- [ ] Photographic recipe hero image — an optional full-bleed photo (`image_url`, `flux/schnell`
  no-rembg ~$0.003/img) on the card + detail, alongside the existing `icon`/`icon_url`. Web
  parity for the icon picker also unbuilt.
- [ ] **Flip media storage to Cloudflare R2** when the VPS disk hits ~50% or before ~500 active
  users. Runbook: `backend/DEPLOY.md` §13a. ~$0 under R2's free tier, then ~$2–5/mo.
- [ ] Sentry DSN (crash monitoring scaffolded, currently a no-op).
- [ ] `apps/web/lib/thatfridge` → `packages/core` extraction (most already moved).
- [ ] `react-i18next` + `expo-localization` — i18n plumbing so a Korean/Malay UI ships as an
  OTA, no rebuild.
- [ ] Web deployment: `expo export -p web`, wide-viewport (≥900px) layouts, retire legacy
  `apps/web`.
- [ ] PixelMix font: get written confirmation the desktop EULA covers app/web embedding (email
  font@andrewtyler.net), drop the unused unofficial `PixelMix-Bold.ttf`.
- [ ] Privacy Policy §11 promises material changes get "surfaced in the app" — nothing does
  that yet.
- [ ] **Recipe attachments still on the public media disk** (unlike receipts/photos — see
  Security below — these are actively displayed, so privatizing needs a real data-model change:
  store a disk path instead of a baked URL, regenerate the signed URL fresh on every read).

---

## Reference

### Cost tracker (all USD, approximate)

| Item                                                          | Cost         | Status                                           |
| --------------------------------------------------------------| ------------ | ------------------------------------------------ |
| Apple Developer Program                                       | $99/yr       | Paid                                             |
| Domain —`thatfridge.com`                                    | ~$10.46/yr   | Paid                                             |
| PixelMix commercial font licence                               | $25 one-time | Paid (embedding confirmation pending, see above) |
| VPS — DigitalOcean SGP1, 2 vCPU/2GB + backups                 | $21.60/mo    | Live                                             |
| Legal site hosting (Cloudflare Workers), email routing         | $0           | Live                                             |
| Sentry, RevenueCat, Expo EAS, Devpost                          | $0           | Free tiers                                       |
| Google Play Console                                            | $25 one-time | Paid                                             |
| OpenRouter wallet (AI chat/vision, prepaid, no auto-recharge)  | $10 one-time | Paid                                             |
| fal.ai wallet (icon generation, prepaid, no auto-recharge)     | $10 one-time | Paid                                             |

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
($2.99/mo) and `thatfridge_pro_yearly` ($19.99/yr), both with a 1-week free intro offer. Pro
grants a **400-credit monthly bundle** (vs 50 free), rolls over up to 800, and unlocks hosting
shared fridges (see AI credits below). iOS paywall = the RevenueCat dashboard paywall
(`RevenueCatUI.Paywall`) — editor at
`app.revenuecat.com/projects/c6c4cdf4/paywalls/pwec1165df9a414243/builder`, published revision
36 (credit-model copy, live in the app). Android app + products are being wired in now (see
Android section above).

<details>
<summary>Canonical paywall content (rebuild reference)</summary>

- Headline: **Get more out of your fridge** (turquoise `#26c6da`, ~22pt bold, centered)
- Subtitle: *Know before you open the door.*
- Comparison card — header row `· / Free / Pro`, then:

  | Feature                                 | Free         | Pro          |
  | ---------------------------------------- | ------------ | ------------ |
  | Fridge & pantry tracking, expiry alerts  | ✓            | ✓            |
  | Monthly AI credits (chat, scans, icons)  | 50           | 400          |
  | Bulk-add from a receipt or fridge photo  | Uses credits | Uses credits |
  | Buy more credits anytime                 | ✓            | ✓            |
  | Own more than one fridge                 | –            | ✓            |
  | Host a shared fridge for your household  | –            | ✓            |

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

Every AI action spends credits from `users.ai_credits`. The backend ledger
(`ai_credit_ledger`, unique on `reason`+`ref`) is authoritative; RevenueCat Virtual Currency
(`AICR`) is a best-effort display mirror.

| Action                             | Cost | Notes (`App\Support\CreditCost`)                        |
| ----------------------------------- | ---- | -------------------------------------------------------- |
| Quick Chat message                 | 1    | `+2` surcharge (best-effort) when the crew used a tool   |
| AI icon generation (item + recipe) | 3    | curated pixel picks are free                              |
| Expiry-date photo scan             | 2    | no refund — the vision call runs even on "not found"     |
| Receipt scan                       | 3    | refunded on hard failure                                  |
| Fridge-photo scan                  | 3    | refunded on hard failure                                  |
| Add-item auto-fill                 | 1    | 402 → top-up prompt on the draft card                     |
| Memory extraction                  | 0    | tiny call right after a chat that already paid            |
| Home crew tip cards                | 0    | cached per user+agent per day                             |
| Quick Chat with a photo            | 3    | vision is ~3-5× a text chat; refund matches on failure    |

Grants: free accounts topped up to 50/month; Pro gets 400/month, rolling over up to 800.
`app:grant-monthly-credits` runs `monthlyOn(1, 00:15)`; the RevenueCat webhook also grants the
Pro bundle on a paid `INITIAL_PURCHASE`/`RENEWAL` and pack credits on a consumable
`NON_RENEWING_PURCHASE` — idempotent via the ledger's `reason`+`ref` key.

**Trial-farming guard**: a `period_type: TRIAL` `INITIAL_PURCHASE` grants **nothing** (trial
user keeps their free 50) and sets `pro_trial_until`; the 400 bundle lands only on a paid
`RENEWAL`.

**Signup cap**: 6/min + 20/day per IP on `/register` — full email verification is the real fix,
deferred (needs a mobile verify screen).

**Host a shared fridge** stays a hard Pro gate (not credits) — `FridgeJoinRequestController`
requires `$fridge->user->isPro()`.

Still owed: prod `.env` → `REVENUECAT_SECRET_API_KEY=…` for the credit→VC display mirror
(optional, the ledger is authoritative without it); after both stores' IAPs are fully live,
detach the RC Test Store products (`monthly`, `yearly`) from the packages so the paywall serves
only the real store products.

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
(port the full `guessFoodIcon` post-launch); a confirm *card* in the UI (vs. text round-trip) is
deferred; no tools yet for recipe favourite/unfavourite, `suggest_recipes`, user categories, or
shopping→fridge handoff. Buy links (`shop_url`) are opened in-browser only, never fetched
server-side.

### Data retention

`app:prune-stale-data` runs daily (04:00): `analytics_events` >180d, `notification_events`
(done >60d / any >180d), terminal `fridge_join_requests` >90d, `photos/`+`receipts/` scan
images + orphaned `icons/`/`recipe-attachments/` files >7d. Not pruned: `chat_history` (needs a
"kept 12 months" UI message first), and real user data (items, recipes, usage history, memory).
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

`keira@thatfridge.test` — pre-seeded shared fridge ("Home Fridge") with items across all zones.
Password is an env var (`DEMO_USER_PASSWORD`), live value in the shared password manager, pasted
into ASC's Sign-In fields. If the demo account is ever deleted again (e.g. while recording an
account-deletion demo), re-seed via `php artisan config:clear && php artisan db:seed --force` on
the server — restores the login but not any hand-built fridge/recipe content, which would need
rebuilding separately.

### Privacy & compliance posture

**App Store availability:** unavailable in the EU-27 + Iceland + Norway (GDPR + DSA trader
declaration), the non-EU Balkans + Moldova + Ukraine, China (PIPL + ICP filing), Russia +
Belarus, and **South Korea** (temporary — re-enable per the Korea fast-follow above). Available
everywhere else (~140 territories incl. MY, US, UK, Switzerland).

Privacy policy + terms are cross-platform (both stores named as payment/push processors, not
Apple-only) and cover the credit model: the AI crew reads *and acts on* kitchen data, fetches
pasted links; consumable AI-credit packs + the RC credit-balance mirror are disclosed; terms §3
covers credits (consumable, non-refundable, no cash value).

- One English privacy policy (`/privacy/`) + App Privacy labels (both stores) + in-app account
  deletion — the disclosure floor for ~everywhere sold.
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

NativeWind · Expo Router · pnpm workspaces + turborepo · bundle id `test.thatfridge.app` (iOS) /
`app.thatfridge` (Android) · iOS target 15.1 · Apple enrollment Individual, Google Play Personal
· v1 notifications local/on-device (server push already built too, for social events) · one
universal UI codebase (`react-native-web` renders `apps/mobile` in a browser; legacy `apps/web`
retired once web output ships) · signing keys + store assets in a shared password manager ·
**v1 app UI is English-only**, localized store listings only.

### Infra & CD

- API: `https://api.thatfridge.com` (DigitalOcean SGP1, `167.172.88.75`, PHP 8.5/Nginx/
  Postgres/Redis). CD: `.github/workflows/deploy-api.yml`, push to `main` → test → deploy
  (runs migrations automatically).
- Legal site: `https://thatfridge.com` (Cloudflare Workers). CD:
  `.github/workflows/deploy-legal.yml`.
- Mobile OTA: `.github/workflows/eas-update.yml`, push to `main` touching `apps/mobile`/
  `packages` → production channel.
- Mobile native builds: `git tag v*` (or manual dispatch) fires both
  `.github/workflows/testflight.yml` (iOS) and `.github/workflows/google-play.yml` (Android) —
  Android auto-submit needs its service account fixed first (see Android section).
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
   pre-dashboard-config / Expo Go) got an explicit auto-renewal disclosure line added too.
2. **Guideline 4.2 (thin-wrapper rejection).** Low risk for a real RN app with substantial
   native feature use; a written rebuttal is on hand in `STORE_LISTING.md` §3 if needed.
3. **Shipaton "first public release" timing.** No public TestFlight/Play link or press before
   the store listing is live.
4. **The deadline is a wall.** Sep 30, no extensions. Submit ~2 weeks early; be ready for
   same-day resubmits if rejected.
5. **Scope creep.** Anything not already in the app is post-launch OTA. The paywall is
   mandatory — don't trade release-track time for a nice-to-have screen.

**Full guideline passes done:** Apple (2026-09-15 — 4.8 Sign in with Apple parity, 3.1.1
restore, 5.1.1 privacy manifest/permission strings/data minimization/account deletion, 5.1.2/ATT
no tracking, 1.2 UGC report+block) and Google Play (2026-09-15/16 — Data Safety, subscription
disclosure, permissions, UGC reporting caveat noted above) — both compliant, same codebase.

### QA matrix

| Area          | Checks                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Devices        | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device; one Android device                                                            |
| Auth           | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session                                         |
| Core loop      | add item, barcode scan (camera allow/deny/deny-then-enable), inventory edit/delete, mark recipe made decrements stock                     |
| Notifications  | local alert fires at the right time, taps route to the item, permission denied handled                                                    |
| Paywall        | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow                                                             |
| AI credits     | balance shows on chat + profile, spend decrements it, 0 credits routes to /credits, pack purchase tops up, Pro renewal grants the bundle |
| Native chrome  | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe                                                      |
| Network        | airplane mode on every screen, slow 3G, API 500s, retry paths                                                                              |
| Lifecycle      | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly                                                   |
| Compliance     | account deletion from a clean install, privacy-policy link opens, demo account works fresh                                                |
