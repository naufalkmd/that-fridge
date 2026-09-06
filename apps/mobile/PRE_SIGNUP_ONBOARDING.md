# Pre-sign-in onboarding — plan (draft, 2026-09-06)

Move the intro *before* the auth wall, Duolingo-style: deliver the "aha" and collect a few
low-friction choices while the user is still anonymous, so by the time we ask for an account
they've already invested and seen the product work.

**Status: post-launch project, not pre-Sep-30.** This is a ~1–2 week rework of the auth/routing
flow plus new screens, backend, and analytics — and it's exactly the kind of thing that needs
real funnel data to tune. The current post-sign-in flow (carousel → name fridge → "+" spotlight
→ nav tour → Getting Started checklist, see `ONBOARDING_PLAN.md`) stays as-is for launch.

Build broken into 5 phases in §9 — **Phase 1 (analytics) → Phase 2 (plumbing) → Phase 3
(minimal `/welcome`, first shippable)**, then Phases 4–5 are data-driven iteration.

---

## 1. Why pre-sign-in

Today: `signedOut` → `/sign-in`. A cold user hits a login form before seeing a single reason
to care. Every field on that form is a reason to bounce.

Duolingo's model: you pick a language, say why you're learning, set a daily goal, and complete
a whole first lesson — *then* it says "create a profile to save your progress." Conversion is
high because you're now protecting something you built, not clearing a barrier.

ThatFridge is well suited to copy this, and has advantages Duolingo doesn't:

- **Four characters, not one.** Chef / Guardian / Organizer / Shopkeeper are a ready-made
  emotional hook — a "meet the crew" beat lands harder than one owl.
- **A measurable, emotional outcome.** "Stop throwing away food and money" beats "learn
  Spanish" for gut-level motivation, and it's quantifiable later ("~RM40 saved this month").
- **A real first-win demo is cheap.** A mock fridge with three items + a Chef suggestion shows
  the whole value loop in one screen, no account required.

---

## 2. The psychology, and how we adapt each piece

| Mechanism (research)                             | What Duolingo does                       | Our adaptation                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Value before commitment**                | Full first lesson before signup          | The "first win" demo (§3 step 4): mock fridge → Chef suggests a recipe → Guardian flags an item. The loop, on fake data, in ~10s.                                   |
| **Endowed progress** (Nunes & Drèze 2006) | Streak starts at 1; XP from lesson 1     | The signup screen shows "✓ Goal set · ✓ Fridge named · ✓ Crew ready". The post-signup Getting Started checklist then opens at**3/7** with those pre-ticked. |
| **IKEA effect** (you value what you build) | You "built" a lesson's worth of progress | By the signup ask the user has named their fridge, picked a goal, chosen a reminder — five+ small authored choices.                                                   |
| **Sunk cost / escalation of commitment**   | Abandoning loses your lesson             | Same — abandoning at the wall discards named fridge + goal + answers. Kept honest: the wall says*"keep what you set up"*, never*"you must"*.                        |
| **Foot-in-the-door**                       | Tiny taps precede the signup ask         | Every pre-auth step is one tap and skippable. The signup ask is the first "real" commitment, and it arrives after a string of trivial yeses.                           |
| **Personalization = agency**               | "Why are you learning?"                  | "What brings you here?" / "How often does food get thrown out?" / "Who's it for?" — answers visibly shape later copy and the crew's tone. Not a form; a conversation. |
| **Commitment device**                      | "Practice 5 min/day" + reminder time     | "Remind me to check my fridge" → evening / twice a week / off. A promise to self; the notification permission is asked*after* signup, in context.                   |
| **Loss aversion** (Kahneman & Tversky)     | "Don't lose your streak!"                | The Waste Saver streak already exists — keep it**positive** ("3 weeks strong"), never "Duo is sad". The signup framing leans on *protecting* setup, not fear. |
| **Peak-end rule**                          | Lesson ends on confetti                  | End onboarding on the first-win demo + a "You're all set, [FridgeName] is ready" beat — not on the signup form.                                                       |
| **Zeigarnik effect** (open loops nag)      | The lesson path with locked nodes ahead  | The Getting Started checklist post-signup; the visible "3 of 7".                                                                                                       |

---

## 3. The flow (`/welcome`, anonymous)

```
app launch, signedOut ──► /welcome
   │
   1. Value carousel — 3 slides (existing SLIDES)            "Skip" ─┐
   2. "A few quick things" — ONE screen, 3 crew-asked chip rows:     │
        Shopkeeper · "What brings you here?"                         │
          waste · cook · organize · save                            │
        Guardian · "How often does food get thrown out?"            │
          weekly · monthly · rarely                                 │
        Organizer · "Who's this fridge for?"                        │
          just me · partner · household · roommates                 │
        one "Continue" (works with any/none answered)               │
   3. Meet your crew — 4 cards, tap each for its one-liner           │
   4. First-win demo — mock fridge (eggs, spinach, yogurt);          │
      Chef: "15-min frittata uses all three." Guardian: "yogurt      │
      goes tomorrow." One button: "Nice — let's do mine"             │
   5. Name your fridge  (existing FridgeStep; stored locally)        │
   6. Set your intention — reminder cadence (stored locally)         │
   7. Soft wall — "Save your fridge & crew"                          │
      Apple · Google · email  ·  small "I already have an account" ◄─┘
   │  (every step also has "I already have an account" → /sign-in)
   ▼ auth success
 hydrate: create fridge(name) · save goal + answers to user ·
          schedule reminder + ask notif permission
   ▼
 Home ─► "+" spotlight ─► 3-stop nav tour ─► Getting Started (opens 3/7)
```

7 steps. The three questions live on **one screen** (step 2) — stacked single-tap chip rows,
each "asked" by the relevant crew member, so it reads as one conversational beat and doubles
as a warm-up for step 3. Nothing on it is required; "Continue" is always live.

**Cut candidates** if funnel data shows drop-off: the Guardian + Organizer rows on step 2
(keep only "What brings you here?"), and step 6 (reminder). Ship the leanest version first —
carousel, "what brings you here?", demo, name fridge, wall — and add back only what earns it.
Duolingo landed on ~7 screens after heavy A/B testing; we won't nail the count first try.

### Returning users

"I already have an account" is present from slide 1 and prominent — a returning user taps it
and goes straight to `/sign-in`, no tour. A local `welcome_seen` flag also means someone who
signs out later lands on `/sign-in`, not the full flow. "Replay intro & tips" in Profile still
resets everything.

---

## 4. Persistence & hydration

Everything pre-auth is a **local draft** in SecureStore — no backend, no anonymous account:

```ts
type OnboardingDraft = {
  goal?: "waste_less" | "cook_smarter" | "organize" | "save_money";
  wasteFrequency?: "weekly" | "monthly" | "rarely";
  household?: "solo" | "partner" | "household" | "roommates";
  fridgeName?: string;
  reminder?: { cadence: "evening" | "twice_weekly"; } | null;
  completedAt?: string;
};
```

On the first successful sign-in/sign-up, `hydrateFromOnboarding(draft)` runs once:

1. If the user has **no fridges** → `api.createFridge(draft.fridgeName ?? "My Fridge")`.
   (A returning user who already has fridges: skip — don't make a duplicate.)
2. `api.updateUserGoal(...)` seeded from `draft.goal` (map the coarse tag → a concrete metric
   goal, e.g. `save_money` → `money_saved`), left inactive/soft so the user can tune it.
3. `PATCH /me` (or `POST /me/onboarding`) with `{ goal, wasteFrequency, household }` — stored
   for later copy personalization and, in aggregate, product insight.
4. If `draft.reminder` → request notification permission now (in context) and schedule it.
5. Clear the draft.

Each step is independent and best-effort — a failure logs and continues; the Getting Started
checklist is the backstop for anything that didn't land. **The first-win demo's mock items are
never migrated** — the user lands on their real empty fridge with the "+" spotlight.

---

## 5. Routing changes

- `app/index.tsx`: `status === "signedOut"` → `<Redirect href="/welcome" />` (was `/sign-in`).
- New `app/welcome.tsx` — single screen, internal step state (same pattern as `onboarding.tsx`).
  Registered in `_layout.tsx` `<Stack>` with `headerShown: false`, `gestureEnabled: false`.
- `welcome.tsx` final step → `router.replace("/sign-in")` carrying nothing (draft is in
  SecureStore); "I already have an account" does the same from any step.
- `sign-in.tsx`: after auth, call `hydrateFromOnboarding()` before `router.replace("/home")`.
  Add a "New here? Take the tour" link back to `/welcome`.
- `(tabs)/_layout.tsx` guard is unchanged — the post-auth spotlight + checklist stay.
- The existing `onboarding.tsx` (carousel + name-fridge) is **absorbed into `/welcome`** and
  removed as a separate post-auth route, OR kept as a thin fallback for accounts created
  before this shipped (they never saw `/welcome`). Decide at build time.

---

## 6. Backend changes

Small:

- `users` gets a nullable `preferences` JSON column (or three nullable string columns:
  `onboarding_goal`, `waste_frequency`, `household_type`). JSON is more forgiving as the
  question set changes.
- One endpoint: extend `PATCH /me`, or `POST /me/onboarding` — accepts the three tags,
  validates against enums, stores them.
- Everything else already exists: `POST /fridges`, `PATCH /user-goal`.

---

## 7. What we deliberately do NOT copy from Duolingo

- **Guilt notifications.** The crew can nudge, never shame. No "Guardian is disappointed."
- **Fake urgency / countdown paywalls.** The paywall keeps its honest framing.
- **Streak-freeze monetization / streak anxiety.** Waste Saver streak stays a positive number.
- **A hard wall with no escape.** The first-win demo delivers the value *before* the ask, and
  "I already have an account" is always visible.
- **Forced questions.** Every personalization step skippable, no progress blocked.
- **9 mandatory screens.** Start minimal (carousel + 1 question + demo + name + wall), expand
  only where data justifies it.

---

## 8. Analytics — a prerequisite, not an afterthought

There is **no analytics SDK today** (it's on the post-launch list). Duolingo's entire
onboarding is A/B-tested; shipping ours blind means we can't tell if it helps or hurts
conversion — the one metric that matters here.

Before this ships, add lightweight events (reuse the notification-events / kitchen-score
plumbing, or a tiny `POST /events`):

- `welcome_started`
- `welcome_step_viewed { step }` / `welcome_step_skipped { step }`
- `welcome_demo_win_tapped`
- `welcome_reached_wall`
- `signup_completed { from: "welcome" | "direct" }`
- `welcome_abandoned { at_step }`

Funnel = started → wall → signup. Watch per-step drop-off to decide which questions survive.

---

## 9. Build phases

Five phases, each independently shippable. Do them in order — Phase 1 gates everything (no
funnel = flying blind), Phase 2 is the first user-visible cut, Phases 3–5 are data-driven.

### Phase 1 — Analytics foundation  ·  DONE 2026-09-07  ·  no user-visible change

- `POST /events` — public route, optional auth (session guard → falls through to the sanctum
  token so a logged-in client's events are still attributed), batched (≤50/request), oversized
  props dropped not rejected. `AnalyticsEvent` model + migration; `user_id` nullable + `anon_id`.
- `apps/mobile/src/lib/analytics.ts` — `track(name, props?)` buffers in memory, flushes on an
  8s timer / at 20 events / on app background; `getAnonId()` (stable per-install id in
  SecureStore, survives the auth boundary); all failures swallowed.
- `core`: `AnalyticsEventInput` type + `api.trackEvents()`.
- Wired: `_layout` (`initAnalytics` + `app_open`), `auth` (`signup_completed` / `login_completed`
  / `auth_completed` with method + `from: "direct"`), `onboarding` (`onboarding_started`,
  `_slide_viewed`, `_fridge_step_viewed`, `_fridge_created` / `_skipped`, `_finished` / `_skipped`).
- Tests: `AnalyticsControllerTest` (guest, attributed, batch cap, missing name, props clamp).
- **Left for later:** a query/dashboard to actually read the funnel; a couple of weeks of
  baseline `direct` data before Phase 3 ships.

### Phase 2 — Plumbing  ·  DONE 2026-09-07  ·  no user-visible change

- `apps/mobile/src/lib/onboardingDraft.ts` — `OnboardingDraft` type + `get` / `patch` / `clear`
  (SecureStore, best-effort, mirrors `lib/chatQuota.ts`).
- `apps/mobile/src/lib/hydrateOnboarding.ts` — replays the draft once after first auth:
  create fridge (only if the account has none), `saveOnboardingProfile()` for the tags. Each
  step independent + best-effort; clears the draft; beacons `onboarding_hydrated`. **Wired into
  `auth.tsx` but inert** — nothing writes a draft until Phase 3.
- Backend: `users.preferences` JSON column, `POST /me/onboarding` (merges validated enum tags),
  `preferences` returned in the `/me` payload + on `CurrentUser`.
- `core`: `OnboardingPrefs` / `OnboardingGoal` types + `api.saveOnboardingProfile()`.
- Tests: `AuthControllerTest` (merge, empty body, bad tag, auth required).
- **Deviation from plan:** no concrete `UserGoal` is seeded from the coarse tag (decision §10.4
  — tag only for v1). Reminder scheduling deferred to Phase 4.
- **Manual check:** `patchOnboardingDraft({ fridgeName: "Loft", goal: "save_money" })` in a dev
  build, then sign in on a fresh account → fridge "Loft" exists, `preferences.goal` set, draft
  cleared; a second sign-in is a no-op.

### Phase 3 — Minimal `/welcome`  ·  ~3–4 days  ·  first shippable version

The leanest flow that still delivers the aha before the wall.

- `app/welcome.tsx` — carousel (reuse `SLIDES`) → **one** question ("What brings you here?")
  → **first-win demo** → name fridge (reuse `FridgeStep`) → soft wall.
- Routing swap: `signedOut` → `/welcome`; `welcome` → `/sign-in`; `sign-in` calls `hydrate`
  post-auth; "I already have an account" on every step; `welcome_seen` flag for return trips.
- Absorb the post-auth `onboarding.tsx` carousel + name-fridge into `/welcome` (keep a thin
  fallback for pre-existing accounts, or migrate them — decision §10.6).
- Fire all §8 events.
- **Exit:** clean cold-install → `/welcome` → demo → name → wall → signup → hydrated Home
  with the spotlight + checklist (opens 2/7). Returning-user and skip paths both work.
- **Ship it. Collect 2–3 weeks of funnel data before Phase 4.**

### Phase 4 — Expand from data  ·  ~2–3 days  ·  data-driven

Add back the pieces that earn their place; cut anything Phase 3 data shows bleeding users.

- Add the **Guardian + Organizer question rows** (one screen, §3 step 2) if the single
  question didn't hurt drop-off.
- Add **Meet your crew** (§3 step 3) and the **reminder cadence** step (§3 step 6).
- Re-check per-step drop-off after each addition; a step that costs >X% conversion comes back
  out.
- **Exit:** the flow matches §3 (or a justified subset), each step's drop-off is known.

### Phase 5 — Payoff & polish  ·  ~2 days  ·  closes the loop

Make the pre-auth choices visibly matter, so the investment feels rewarded.

- Peak-end beat: "You're all set — [FridgeName] is ready" between the demo/wall and Home.
- Personalized copy from the stored preferences: e.g. a `save_money` user sees savings framing
  on the Kitchen Score / Home; a `roommates` household gets the shared-fridge nudge sooner.
- Tune the demo (fixed vs. pick-3, decision §10.3) if data shows it's a weak point.

---

**Total ~1.5–2 weeks of build across Phases 1–3**, then Phases 4–5 are iterative and paced by
data. Phase 3 is the milestone to aim for; everything after is optimization.

---

## 10. Open decisions

| # | Decision | Needed by | Leaning |
| --- | --- | --- | --- |
| 1 | **Guest mode** — can the app ever be used with no account? | Phase 3 | No — the demo delivers the aha without one |
| 2 | **How many questions at launch** — just "what brings you here?", or also waste-frequency / household? | Phase 3 (start), Phase 4 (expand) | One at Phase 3, add from data |
| 3 | **The demo** — fixed mock data, or tap 3 items from a shortlist (more investment, more friction)? | Phase 3 | Fixed; revisit in Phase 5 |
| 4 | **Goal mapping** — does the coarse tag seed a concrete `UserGoal`, or stay a copy-personalization tag only? | Phase 2 | Tag only for v1 |
| 5 | **Reminder cadence** — options + default; ties into notif-permission timing. | Phase 4 | evening / twice-weekly / off; default off |
| 6 | **Existing post-auth `onboarding.tsx`** — absorb fully, or keep as a fallback for pre-existing accounts? | Phase 3 | Absorb; thin fallback for old accounts |
