# ThatFridge — TO DO (iOS + Android launch + RevenueCat Shipaton 2026)

**Goal:** ship ThatFridge to the **Apple App Store** and **Google Play**, live and approved.
Native Expo / React Native — no Capacitor, no WebView. Also our **RevenueCat Shipaton 2026**
entry.

**Target markets:** Malaysia at launch (+~140 storefronts); South Korea is a post-approval
fast-follow (see Deferred). API hosted in Singapore; v1 app UI is English-only.

**Hard deadline: Sep 30, 2026, 11:45pm PDT.** The app must be **fully published and live**
(review passed), not just submitted — review takes days, so submit ~2 weeks early.

**Where we are (2026-09-18):** iOS — `v1.3.0` **approved and live** on the App Store. `v1.3.2`
(App Store rating support, swipe-to-profile, light/dark theme) submitted for review 2026-09-18;
awaiting Apple's decision. Android — new this cycle, actively in progress (own section below):
Play Console account, store listing, and 4 of 5 IAP products are live; blocked on a Closed
Testing requirement + a Payments Profile issue before the last product and full RevenueCat
wiring can finish.

---

## What's left to do

### iOS — App Store

`v1.3.0` is approved and live. (Rejection/resubmission history from the 2.1(b)/5.1.1(v) round:
git log around `37e21a7` if ever needed again.)

- [ ] `v1.3.2` — App Store rating (Settings row + native review prompt), swipe-right-to-profile,
      light/dark theme — submitted for review 2026-09-18, awaiting Apple's decision.

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
      `credits_500` $7.99, `credits_1500` $19.99) exist and are already attached to RevenueCat;
      attach `credits_100` the same way once it's created.
- [ ] **Closed testing must clear before Play Console allows creating the remaining IAP
      product** — track created and running (started 2026-09-16); check Play Console for the exact
      tester-count/day requirement and days remaining. Internal testing opt-ins do **not** count
      toward this — testers need the Closed-testing-specific opt-in link.
- [ ] **Google Sign-In on Android needs its own OAuth client** (separate from iOS's) — the
      button fails ("sign-in didn't go through") until this exists.
- [ ] Once the above clears: enable the tag trigger is already done
      (`.github/workflows/google-play.yml` fires on the same `v*` tag as `testflight.yml`) — just
      needs the service account fixed for it to actually work end-to-end.
- [ ] **UGC reporting is stricter in wording than Apple's** — Google's policy says "in-app
      functionality for reporting"; the mailto-based report (`FridgeNotes.tsx`, `find-friend.tsx`)
      commonly passes review in practice but is a literal gap vs. the text. Deliberately left as-is;
      revisit with a true in-app report flow only if Android review actually flags it.

### Shipaton / Devpost (same Sep 30, 11:45pm PDT)

- [ ] Devpost project page + feature description.
- [ ] Demo video ≤2:00, public on YouTube/Vimeo, no copyrighted music/footage.
- [ ] Peace Prize impact statement (household food-waste → savings + environmental).
- [ ] App Store URL on the submission.
- [ ] **Submit on Devpost before the deadline.**

- **Don't** market as "launched" anywhere public (TestFlight link, ProductHunt, press) before
  the store listing is live — risks Shipaton's "brand-new app" disqualification.

### Product backlog

Ordered by dependency, not just priority — later phases build on work landed in earlier ones.

**Phase 1 — shipped 2026-09-25.** Swipe-to-delete + undo on Notifications (shared
`SwipeRow`/`NotificationRow`/`NotificationUndoSnackbar` components, delayed-commit undo state
lives in `NotificationsProvider`) plus a small preview on Home reusing the same state; device-
local recent-searches on Find a Friend (`apps/mobile/src/lib/friendSearchHistory.ts`); 3 curated
Kitchen Lab templates (`apps/mobile/src/lib/machineTemplates.ts`, no draft credit spent); and a
timezone-confirm field on the Machine review screen, defaulting to the device's zone. `tsc
--noEmit` clean; no visual QA pass (mobile app's `.env` points at prod, declined).

`apps/mobile` now has a test runner (`jest-expo` + `@testing-library/react-native`, `pnpm --filter
mobile test`) — didn't exist before this pass. Config: `apps/mobile/package.json`'s `jest` block
(pnpm-flavored `transformIgnorePatterns`, `resolver: react-native-worklets/jest/resolver`),
`apps/mobile/jest.setup.js` (gesture-handler's `jestSetup` + worklets' mock + Reanimated's
`setUpTests()` — Reanimated 4's split into `react-native-worklets` means the old
`react-native-reanimated/mock` recipe alone no longer works), and `types: ["jest"]` in
`tsconfig.json` (this pnpm install is hoisted to the workspace root, so plain `@types/jest`
auto-discovery silently didn't apply — needed the explicit `types` array). 31 tests across 4
suites cover `friendSearchHistory`, `machineTemplates` (validated against
`MachineDraftValidator`'s actual rules), `NotificationsProvider`'s delayed-delete/undo/supersede
logic, and `SwipeRow`'s tap-to-delete path. Found and fixed one real bug along the way:
`finalizePending` wasn't clearing the pending timer's handle. Not covered: Kitchen Lab template
UI, timezone field UI, and Find a Friend's history UI (no component tests written for
`find-friend.tsx`/`kitchen-lab.tsx` themselves — worth adding if this app invests further in UI
tests) and the real swipe-pan gesture itself (only the fallback tap target is exercised; RNTL
can't simulate a native pan gesture).

**Phase 2 — foundations that later phases depend on — complete as of 2026-09-25** (the third
original Phase 2 item, *Recheck the credit scheme*, moved to Phase 4 — see below)

- [x] **Reduce food-group autofill cost and improve classification** — shipped 2026-09-25.
      New `App\Support\FoodGroupClassifier`: word-boundary + regular-plural-safe keyword
      matching, a `SPECIFIC_TERMS` layer for compound terms a shorter keyword would misclassify
      (`peanut butter` before `butter`, `ice cream` before `cream`, `green beans` before `bean`),
      then the item's own already-assigned icon key (direct lookup), then a small supplementary
      keyword list, then `FoodIconMatcher`'s fuzzy icon-corpus guess *last* — empirically, running
      the icon corpus first misclassified real items (`FoodIconMatcher::guess()` has no word
      boundaries and a few overly generic keywords like "whole"/"raw" meant only to disambiguate
      icon art, e.g. "Whole milk" → protein via icon23 before this fix). `classify()`/
      `resolveNutritionCategory()` never force `other_extras` anymore - a genuinely unclassifiable
      name comes back null (`fallbackAutofill` had a latent bug forcing it into the *returned*
      category, not just its own internal weight-lookup default - fixed). `ItemController::autofill`
      now tries the classifier (local rules, then a 90-day cross-user cache of previously
      AI-resolved names) *before* deciding whether to spend a credit on the AI at all - when food
      group is the only thing an item needs and the classifier is confident, the AI call is
      skipped entirely. Once the AI *is* asked (because other fields are still needed), its own
      valid answer is trusted as-is, same as every other field - the classifier only overrides an
      invalid/missing AI answer, never a valid one. 16 new `FoodGroupClassifierTest` cases + 5 new
      `ItemControllerTest` autofill cases (local-only resolution, AI-fallback, refund-when-
      unclassifiable, cross-item caching); full backend suite (712 tests) and Pint both clean.
      Unblocks *Remove food-group friction* below - that item needs a classifier trustworthy
      enough to run without a visible control.
- [x] **Kitchen Lab execution history** — shipped 2026-09-25. The `machine_runs` table and
      `MachineRunner` already persisted everything (status, per-step outcomes, error,
      timestamp) - nothing exposed it. Added `GET /machines/{machine}/runs` (owner-only,
      `MachinePolicy::view`, newest 20), `MachineRunResource`, a `Machine::runs()` relation, and
      `packages/core`'s `MachineRun` type + `listMachineRuns()`. Kitchen Lab's review screen (only
      for an already-saved Machine) now shows a scrollable execution-history list - status,
      relative time, error, and each step's tool/outcome - refreshed after "Run now", plus a
      "View notifications" link to `/notifications` (a precise per-run deep link would need a new
      FK from `notification_events` back to the run, which felt like scope creep beyond what was
      asked). 3 new backend feature tests; backend suite (712) and mobile `tsc`/jest both clean.
      Unblocks *Kitchen Lab action undo and audit details* and *Kitchen Lab dry run and action
      preview* in Phase 3 below - both need per-run metadata to explain or distinguish results.

      Note: the Phase 1 UI-test-coverage follow-up (component tests for `kitchen-lab.tsx`'s new
      template/timezone UI and `find-friend.tsx`'s recent-searches UI) was agreed but not done
      yet - deprioritized in favor of finishing Phase 2's substance first.

**Phase 3 — builds on Phase 2 foundations — complete as of 2026-09-25**

- [x] **Remove food-group friction from every Add-item UI** — shipped 2026-09-25. Removed the
      food-group Pressable/chip picker from `draft-item.tsx`'s shared `ItemCard` (the one
      component behind Add, scan review, and bulk-add - confirmed there's no second copy
      anywhere). `category`/`categoryId` stay in the `Draft` model and `toCreatePayload`
      unchanged, so anything that already supplies a value keeps working with no visible
      control: Auto-fill's merge already only ever adds `category` when the AI/classifier
      returns non-null, so a null answer (now the norm post-Phase-2) never erases an existing
      value. Found and fixed a real bug while verifying "preserve a supplied value from
      existing records/scans": barcode lookups (`BarcodeService::suggestItemDetails`, already
      classifying a food group via Phase 2's work) were never actually wired into the scanned
      draft in `scan.tsx` - the value existed in the API response and the TS type but was
      silently dropped on the floor. Fixed. Manual editing still lives on
      `item-detail/storage-row.tsx` post-creation. 6 new tests
      (`components/__tests__/draft-item.test.ts`) cover the preserve-on-null-answer behavior
      explicitly.
- [x] **Kitchen Lab AI cost transparency** — shipped 2026-09-25. The credit cost was already
      shown before generation ("Draft with AI · 2 credits", matching `CreditCost::MACHINE_BUILD`);
      the real gap was the ledger link - `apps/mobile/src/app/credits.tsx`'s `REASON_LABEL` map
      was missing `machine_build`/`machine_build_refund` entirely, so a Kitchen Lab charge showed
      as a raw, unlabeled string on the credits history screen. Fixed, and while auditing that
      map for completeness also fixed several other missing reasons the same way (`chat_pdf`,
      `item_autofill`/`_refund`, `label_scan`/`_refund`, `expiry_scan_refund`,
      `photo_scan_refund`, `receipt_scan_refund`, `calorie_estimate`) - a labeling-completeness
      fix, not a pricing change, so it's not overlapping with the Phase 4 cost audit. Added a
      `MachineRunnerTest` regression guard (`test_running_a_machine_never_spends_ai_credits`)
      exercising 8 of the Machine-eligible tools in one run and asserting the ledger is
      untouched, locking in "Machine execution stays AI-free" as an explicit, tested invariant
      rather than just an implicit property of the current tool implementations.
- [x] **Kitchen Lab duplicate-trigger protection** — shipped 2026-09-25. Implemented entirely
      client-side in `apps/mobile/src/lib/machineOverlap.ts` (`triggersOverlap`/
      `findOverlappingMachine`, 13 tests) rather than a backend change - the mobile app already
      holds the full, authoritative Machine list in memory whenever Kitchen Lab is open, so no
      new endpoint was needed. Checked at both points named in the backlog: turning a Machine on
      (`toggleEnabled`) and saving a redraft of an already-*enabled* Machine's trigger
      (`saveMachine`) - both against other *enabled* Machines on the *same fridge* only (a
      schedule on a different fridge isn't a real duplicate-notification risk). A hit shows a
      reviewable Cancel/"Enable anyway" (or "Save anyway") Alert naming the conflicting Machine
      and its trigger - never a silent block, merge, or delete, per the backlog's own framing.
- [x] **Kitchen Lab dry run and action preview** — shipped 2026-09-25. New
      `AgentToolbox::preview()` - a parallel dispatcher to `run()`, machine-surface-only, that
      actually executes the 4 read-only Machine tools for real (safe, and more accurate than a
      second hand-kept copy of their logic) but simulates the 7 write tools instead of touching
      the database: each reports a "Would ..." description of what it would do, and
      `mark_items_used_matching` - the one genuinely destructive/bulk tool, the backlog's named
      priority - reuses its own real filter query to report exactly which items would be marked
      used without deleting any of them. `MachineRunner::dryRun()` replays a saved Machine's
      steps through `preview()` with the same condition/placeholder logic `run()` uses, but
      records nothing (no `MachineRun` row, no `last_run_at`/`run_count` change) - a preview
      can never be mistaken for real execution history. New `POST /machines/{id}/dry-run`
      endpoint (view-policy, since nothing is written) and a "Dry run" button next to "Run now"
      on Kitchen Lab's review screen, rendering results in a visibly distinct dashed-border
      panel labeled "A preview only - nothing was saved and no notification was sent." 19 new
      backend tests (11 `AgentToolboxTest` + 4 `MachineRunnerTest` + 3 controller) plus mobile
      `tsc`/jest clean.
- [x] **Kitchen Lab action undo and audit details** — shipped 2026-09-25, scoped to exactly
      what the backlog named: rollback for the one destructive/bulk tool
      (`mark_items_used_matching`) and the "safe" actions it listed by name (added items via
      `add_item`/`bulk_add_items`, notes via `add_note`, shopping entries via
      `add_to_shopping`) - `notify_user` and `mark_recipe_made` are deliberately not undoable,
      matching the backlog's own list. Each of those 5 tools now writes a small `undo` payload
      (ids for the simple adds; full field snapshots + per-name usage-history deltas for
      `mark_items_used_matching`) into `$this->undo`, persisted as part of `steps_run`'s
      existing JSON column - no schema change needed there. New `undone_at` column on
      `machine_runs` (a run can be undone once) plus `AgentToolbox::undoStep()` and
      `MachineRunner::undo()`, which walks a run's steps most-recent-first and reverses each
      one: deletes for the simple adds, and for `mark_items_used_matching`, recreates each
      deleted item from its snapshot and decrements (never below zero, dropping the row at
      zero) exactly the usage-history delta that run added - verified with a two-runs test that
      undoing the first leaves the second's contribution to the shared aggregate intact. New
      `POST /machines/{id}/runs/{run}/undo` endpoint (409 if already undone, 422 if nothing on
      the run was undoable, 404 if the run doesn't belong to the machine), `MachineRunResource`
      now exposes `undoable`/`undoneAt`, and Kitchen Lab's execution-history rows show an "Undo"
      action (confirm-first, since this touches real inventory data) that disappears once used.
      27 new backend tests (8 `AgentToolboxTest` + 3 `MachineRunnerTest` + 6 controller, plus
      the earlier dry-run counts); full backend suite (746 tests) and Pint clean throughout
      Phase 3.

Found in passing, unrelated to any of the above: the local dev Postgres is listening on 5432,
but `backend/.env`'s `DB_PORT` is set to 5433 - `php artisan migrate` fails against the local
dev DB until one of those is corrected (the test suite is unaffected; it runs against a
separate in-memory SQLite DB per `phpunit.xml`). Not touched here since guessing which port is
"right" risked pointing at the wrong database.

**Phase 4 — larger scope, tackle last**

- [ ] **Recheck the credit scheme** — moved here from Phase 2 (2026-09-25) since it's an audit-
      first task, not a foundation the other phases block on. The authority is
      `backend/app/Services/CreditService.php` plus `ai_credit_ledger`; prices are centralized in
      `backend/app/Support/CreditCost.php`, grants arrive through `RevenueCatWebhookController`
      and `GrantMonthlyCredits`, and the mobile ledger is displayed by
      `apps/mobile/src/app/credits.tsx`. Audit every metered controller against provider
      input/output cost and the actual UI copy, especially chat image extras, PDF, tool
      surcharge, scans, refunds, webhook idempotency, and monthly top-ups. Then version the
      pricing table, add an endpoint-to-cost test matrix, and change prices only after recording
      the expected user/cost impact.
- [ ] **Calendar integration** — no calendar API, permission, or model exists today; expiry data
      lives on `items.expiry_date`, local reminders are managed by
      `apps/mobile/src/lib/localNotifications.ts`, and server expiry events come from
      `backend/app/Console/Commands/CheckItemFreshness.php`. Implement in phases: first add a
      permission-free `.ics` export/share from the item or expiry list; only then consider
      `expo-calendar` event creation. If native sync is added, keep event IDs per item, use an
      app-owned calendar, reconcile edits/deletes, handle timezone changes, and request permission
      only at the point of export/sync. Add the package/config plugin and bump the app version
      because this cannot safely be delivered by OTA.
- [ ] **Kitchen Lab multi-Machine generation** — later allow one prompt to propose several
      independent Machines, but return and validate them as separate drafts. Review each trigger
      and action independently, detect duplicates, charge per saved Machine, and save atomically or
      report partial failures clearly. Keep the current one-trigger/up-to-10-step Machine model as
      the default until this review flow exists. Depends on the *duplicate-trigger protection* and
      *dry run* work in Phase 3 — multi-Machine drafts need the same duplicate detection and preview
      safety, just applied per-draft.

### Deferred to post-launch (don't work on these before Sep 30)

- [ ] **Korea launch** — metadata-only fast-follow, no binary re-review. Real blocker: a
      **Korean privacy policy** at `/privacy/ko/` (currently 404) — ~$200–350 for a KR legal
  translator, or ~$300–600 for a PIPA-compliance consultant who adapts rather than translates
      (keep an "English version prevails" clause). Also needs a _separate, unticked_ cross-border
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

  <details>
  <summary>Draft email — font@andrewtyler.net</summary>

  ```
  Subject: PixelMix licence — confirming app/web embedding coverage

  Hi Andrew,

  I purchased the commercial licence for PixelMix via Sellfy on August 28, 2026 (governed by
  PixelMix-EULA.docx). I'm using it as the wordmark/logo font in a mobile app called ThatFridge
  (iOS/Android, built with Expo/React Native) and on its companion website, thatfridge.com.

  The EULA's "Embedding Restrictions" and "No Other Use" sections mention that embedding the
  font into "application programs" and "web pages" needs an additional licence beyond the base
  purchase. Could you confirm in writing whether my purchase already covers:

  1. Embedding the font file in a distributed iOS/Android app (bundled into the app binary via
     expo-font), and
  2. Serving it via @font-face on a public website

  — or whether an additional licence is needed for either, and if so, how to obtain it?

  Happy to provide the Sellfy order confirmation if useful.

  Thanks,
  Muhammad Naufal Kamaruddin
  ```

  </details>

- [ ] Privacy Policy §11 promises material changes get "surfaced in the app" — nothing does
      that yet.
- [ ] **Recipe attachments still on the public media disk** (unlike receipts/photos — see
      Security below — these are actively displayed, so privatizing needs a real data-model change:
      store a disk path instead of a baked URL, regenerate the signed URL fresh on every read).

---

## Reference

### Cost tracker (all USD, approximate)

| Item                                                          | Cost         | Status                                           |
| ------------------------------------------------------------- | ------------ | ------------------------------------------------ |
| Apple Developer Program                                       | $99/yr       | Paid                                             |
| Domain —`thatfridge.com`                                      | ~$10.46/yr   | Paid                                             |
| PixelMix commercial font licence                              | $25 one-time | Paid (embedding confirmation pending, see above) |
| VPS — DigitalOcean SGP1, 2 vCPU/2GB + backups                 | $21.60/mo    | Live                                             |
| Legal site hosting (Cloudflare Workers), email routing        | $0           | Live                                             |
| Expo EAS — Starter plan (upgraded from free tier)             | $19/mo       | Live (2026-09-18, hit free iOS build quota)      |
| Sentry, RevenueCat, Devpost                                   | $0           | Free tiers                                       |
| Google Play Console                                           | $25 one-time | Paid                                             |
| OpenRouter wallet (AI chat/vision, prepaid, no auto-recharge) | $10 one-time | Paid                                             |
| fal.ai wallet (icon generation, prepaid, no auto-recharge)    | $10 one-time | Paid                                             |

- [ ] **Downgrade EAS back to the free plan** before the next monthly renewal, if the extra iOS
      build capacity isn't still needed by then — subscribed 2026-09-18 to unblock a TestFlight build
      after hitting the free tier's monthly iOS build quota. Check the exact renewal date at
      `expo.dev/accounts/avocacode/settings/billing`.

**Fixed recurring cost: ≈$49.72/mo ($596.66/yr)**, regardless of user count. Apple's commission
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
- Subtitle: _Know before you open the door._
- Comparison card — header row `· / Free / Pro`, then:
  | Feature                                 | Free         | Pro          |
  | --------------------------------------- | ------------ | ------------ |
  | Fridge & pantry tracking, expiry alerts | ✓            | ✓            |
  | Monthly AI credits (chat, scans, icons) | 50           | 400          |
  | Bulk-add from a receipt or fridge photo | Uses credits | Uses credits |
  | Buy more credits anytime                | ✓            | ✓            |
  | Own more than one fridge                | –            | ✓            |
  | Host a shared fridge for your household | –            | ✓            |
- Footer: _Every AI action spends credits. Free gives you 50 a month; Pro gives you 400, rolls
  the unused ones over, and unlocks hosting shared fridges._
- Rules: sentence case, **never the word "unlimited"**, lead with the credit number not a
  weekly cap.
- Trial line: _7-day free trial, then {{ product.price_per_period }}. Renews automatically until
  you cancel._ CTA: **Get Pro access**.

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

| Action                             | Cost | Notes (`App\Support\CreditCost`)                       |
| ---------------------------------- | ---- | ------------------------------------------------------ |
| Quick Chat message                 | 1    | `+2` surcharge (best-effort) when the crew used a tool |
| AI icon generation (item + recipe) | 3    | curated pixel picks are free                           |
| Expiry-date photo scan             | 2    | no refund — the vision call runs even on "not found"   |
| Receipt scan                       | 3    | refunded on hard failure                               |
| Fridge-photo scan                  | 3    | refunded on hard failure                               |
| Add-item auto-fill                 | 1    | 402 → top-up prompt on the draft card                  |
| Memory extraction                  | 0    | tiny call right after a chat that already paid         |
| Home crew tip cards                | 0    | cached per user+agent per day                          |
| Quick Chat with a photo            | 3    | vision is ~3-5× a text chat; refund matches on failure |

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
(port the full `guessFoodIcon` post-launch); a confirm _card_ in the UI (vs. text round-trip) is
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
Apple-only) and cover the credit model: the AI crew reads _and acts on_ kitchen data, fetches
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

| Area          | Checks                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Devices       | iPhone with notch (14/15), iPhone SE, one iOS 15/16 device; one Android device                                                           |
| Auth          | register, login, logout, token expiry, wrong password, offline attempt, token revoked mid-session                                        |
| Core loop     | add item, barcode scan (camera allow/deny/deny-then-enable), inventory edit/delete, mark recipe made decrements stock                    |
| Notifications | local alert fires at the right time, taps route to the item, permission denied handled                                                   |
| Paywall       | trial start, purchase (sandbox), restore, entitlement gate on/off, cancel flow                                                           |
| AI credits    | balance shows on chat + profile, spend decrements it, 0 credits routes to /credits, pack purchase tops up, Pro renewal grants the bundle |
| Native chrome | safe areas, status bar, splash → app, keyboard avoidance, sheet gestures, back-swipe                                                     |
| Network       | airplane mode on every screen, slow 3G, API 500s, retry paths                                                                            |
| Lifecycle     | background/foreground, cold-start time, memory after 10 min, EAS Update applies cleanly                                                  |
| Compliance    | account deletion from a clean install, privacy-policy link opens, demo account works fresh                                               |
