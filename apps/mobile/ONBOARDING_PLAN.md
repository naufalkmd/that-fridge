# ThatFridge — first-run onboarding (plan, 2026-09-06)

A short, skippable intro shown once after a user first signs in, plus a first-run checklist on
Home. Goal: get a brand-new user to their first "aha" (one item tracked, one crew answer) before
they bounce on empty states.

## Scope decision

**Post-launch OTA fast-follow, not a submission blocker.** It's pure JS/UI — ships as an EAS
Update with no new binary or App Review. Pre-launch time goes to the smoke test + screenshots +
submission (TO_DO risk #5: don't trade release-track time for a nice-to-have screen).

Exception: the **3-slide value carousel alone** (§2a) is low-risk and self-contained. If the
smoke test lands clean with a week of buffer, it can go in the submission build. The **Home
checklist** (§2c) waits for post-launch regardless — it needs careful state derivation.

## Why a new user needs this

After sign-in a fresh account lands on Home with **no fridge** (one isn't created until the
first item is added — `inventory.tsx` `ensureFridgeId`), so they see: empty carousel, all-zero
Overview, baseline Kitchen Score, generic crew-tip fallbacks, empty Inventory. Nothing explains
the crew, the freshness system, or where to start.

## Design principles

- **Time-to-value over completeness.** Teach the *why* in ~15 seconds, then get out of the way.
- **Show, don't tell.** Reuse the existing crew art (`assets/images/thatfridge/chef.gif` etc.),
  the fridge photos, the freshness colours. No walls of text.
- **Progressive disclosure.** The carousel sells the idea; the Home checklist teaches the
  mechanics in context, one action at a time.
- **Always skippable.** A persistent "Skip" on every slide. Skipping still marks onboarding
  seen — never show it twice.
- **Endowed progress.** The checklist starts with one item already ticked ("Create your
  account ✓") so it reads as 1/4 done, not 0/4.
- **No dark patterns.** No fake urgency, no forced permission prompts, no paywall inside
  onboarding (the paywall has its own entry points).

---

## 2. The flow

```
sign-in  ──►  onboarding seen?  ──no──►  /onboarding
                    │ yes                     │
                    ▼                         ▼
              /(tabs)/home  ◄──── Skip / Finish ────┘
                    │
                    ▼
        Home shows the first-run checklist card
        (until all done or dismissed)
```

### 2a. Value carousel — 3 slides (`/onboarding`)

Full-screen, dark canvas, `#26c6da` accent, swipe or "Next", page dots, "Skip" top-right.

| # | Visual | Headline | Body |
| --- | --- | --- | --- |
| 1 | The four crew members (existing GIFs, animated in) | **Your kitchen has a crew now** | Chef, Guardian, Organizer and Shopkeeper watch what's in your fridge so you don't have to. |
| 2 | An item card sliding from green → amber → red | **Know before it goes bad** | Track what you have and get a nudge a few days out — not a bad smell a week later. |
| 3 | Chat bubble: "What can I cook tonight?" → a recipe | **Cook what you already have** | Ask the crew anything about your fridge in plain language. Less guessing, less waste. |

Slide 3 primary button: **"Add my first item"** → completes onboarding, routes to `/add`.
Secondary on every slide: **"Skip"** → completes onboarding, routes to `/home`.

### 2b. One personalization question — *optional, cut if it adds friction*

Between slide 3 and finish, a single question (multi-choice, one tap, "Skip" still present):

> **What brings you here?**
> · Stop wasting food · Cook from what I have · Keep the kitchen organized · Save money

Store the answer on the user (`data.onboarding_goal`) for later use (e.g. which crew tip to
lead with, or a tailored empty-state line). **v1: only build this if it's genuinely one extra
screen.** Skip entirely if it risks the deadline — it's the least important piece.

### 2c. Post-carousel spotlight tour (BUILT 2026-09-06, expanded 2026-09-06)

`components/home/CoachSpotlight.tsx`, rendered from `(tabs)/_layout` above the tab bar. The
tab bar measures each pill + the "+" FAB and publishes their screen rects via
`useOnboarding().setCoachRect(target, rect)` (`coachRects` map).

**Phase A — empty fridge:** dims the screen, highlights the "+" with a ring + tooltip
("Add your first item"), plus a bright tappable FAB copy → `/add`. Tap dim / Skip → dismiss.

**Phase B — once an item exists** (and ≤ 6 items, i.e. not an established fridge / demo
account): a 3-stop "look around" pointing at the **Inventory**, **Crew** and **Chat** tabs
with a one-line explainer each and Next / Skip / Got it. Non-navigating — the user stays on
Home. Gets exactly one session: `coach_tour_seen_v1` is persisted on first show, so a
force-quit mid-tour doesn't make it nag on every launch.

Both phases end permanently on Skip / Got it (`coachDismissed`). "Replay intro & tips" in
Profile → Settings (`resetOnboarding()`) clears all of it.

### 2c-alt. Home "Getting started" checklist (BUILT 2026-09-06)

Ships **alongside** the spotlight, not instead of it: the spotlight gets the very first item
added; this card then guides the next few features at the user's own pace.

`components/home/GettingStarted.tsx` — a dismissible card above Overview on Home, with a
progress bar and 5 steps. Renders only when the carousel is `seen`, not dismissed, not all
5 done, **and `items.length < 5`** (so a reinstall / the demo account doesn't get a beginner
checklist). Each row deep-links; completion is derived from real state where possible:

| Step | Route | Done when |
| --- | --- | --- |
| Add your first item | `/add` | `items.length > 0` |
| Ask the crew what to cook | `/chat` | tapped through (`checklistVisited` has `crew`) |
| Save a recipe to your book | `/recipes` | `recipes.length > 0` |
| Start a shopping list | `/shopping` | `shopping.length > 0` |
| Add your household | `/fridges` | a fridge has `memberCount > 1`, or tapped through |

State in `lib/onboarding.tsx`: `checklistDismissed` + `dismissChecklist()`,
`checklistVisited[]` + `markChecklistVisited(id)` (SecureStore keys
`..._checklist_dismissed_v1` / `..._checklist_visited_v1`). "Hide" dismisses permanently;
the card also self-hides once all 5 are done.

Deferred (post-launch, see TO_DO): contextual one-shot coach-marks for the non-obvious bits
(crew tabs, drag-to-reorder in Inventory, the Kitchen Score), and any analytics on completion.

---

## 3. Technical plan

### Routing & gating
- New route: `apps/mobile/src/app/onboarding.tsx` (single screen, internal step state — simpler
  than a nested stack for 3–4 steps).
- Register it in `app/_layout.tsx` `<Stack>` with `headerShown: false`.
- `app/index.tsx` currently redirects `signedIn → /home`. Change to:
  `signedIn && !onboardingSeen → /onboarding`, else `/home`.
- Also guard `(tabs)/_layout.tsx` the same way so a deep link can't skip it. Keep the check in
  one hook (`useOnboarding()`).

### Persistence
- Local only, `expo-secure-store` — mirrors the `lib/chatQuota.ts` pattern
  (`thatfridge_onboarding` → `{ seen: boolean }`). Per-device is fine; seeing the intro again
  after a reinstall is acceptable (arguably good).
- The personalization answer (§2b), if built, goes to the API on the user record so it survives
  reinstall and is readable server-side — needs a `data` JSON column or a dedicated field
  (check `backend` — `User` already has a `data_transfer_consented_at`; add
  `onboarding_goal` nullable string, or a small `preferences` json).
- Checklist flags: local secure-store keys, same pattern.

### Components
- `src/components/onboarding/Slide.tsx` — one slide (art slot, headline, body).
- `src/components/onboarding/Carousel.tsx` — horizontal pager + dots + Skip, reuses the Home
  hero carousel's paging approach.
- `src/components/home/FirstRunChecklist.tsx` — the Home card; consumes `useInventory`,
  a `useOnboarding` hook, and `useRouter`.
- `src/lib/onboarding.tsx` — `useOnboarding()` provider/hook: `seen`, `markSeen()`,
  `checklist` state, `goal`. Add its provider in `_layout.tsx` near `AuthProvider`.

### Reuse, don't rebuild
- Crew art: `assets/images/thatfridge/{chef,guardian,organizer,shopkeeper}.gif`.
- Colours/spacing: `apps/web/lib/thatfridge/theme.ts` values (or the NativeWind tokens).
- Pixel eyebrow: `PixelText` from `components/brand.tsx`.
- Paging: the `ScrollView pagingEnabled` pattern already in `(tabs)/home.tsx`.

### Accessibility / edge cases
- Respect `prefers-reduced-motion` — no auto-advancing slides; crew art can be a static frame.
- Back-swipe / hardware back on Android during onboarding → treat as "Skip".
- If sign-in is via "Sign in with Apple" for a returning user (account already existed),
  `onboardingSeen` is local so they'd still see it once on a new device — acceptable, or gate
  on the server `onboarding_goal` being set if §2b is built.

---

## 4. What NOT to do

- No coach-mark / tooltip tour over the real UI — high effort, easy to annoy, brittle as
  screens change.
- No mandatory steps. Everything skippable, nothing blocks reaching Home.
- No permission prompts (notifications, camera) inside onboarding — ask them in context when
  the feature is first used, as the app already does.
- No paywall or trial pitch inside onboarding.
- Don't auto-create a fridge on finish just to avoid the empty carousel — let "Add my first
  item" do it, so the fridge has a real item in it.

---

## 5. Effort & sequencing

| Piece | Est. | When |
| --- | --- | --- |
| Carousel (3 slides) + routing + local persistence | ~0.5–1 day | Pre-launch *if* buffer, else OTA |
| Personalization question + `onboarding_goal` field | ~0.5 day | OTA, optional |
| Home first-run checklist | ~0.5–1 day | Post-launch OTA |

Ships via `.github/workflows/eas-update.yml` (push to `main` touching `apps/mobile` →
production channel). No `app.config.ts` / native change, so no version bump, no re-review.

## 6. Success signal

No analytics SDK in v1, so judge it qualitatively at first: does a fresh install reach "first
item added" without confusion? Post-launch, a lightweight event (reuse the Kitchen Score /
notification-events plumbing) could track carousel completion vs skip and checklist task
completion, to decide whether §2b and the checklist earn their keep.
