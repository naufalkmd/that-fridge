# Onboarding — how it works (shipped 2026-09-07)

The whole first-run experience is built and OTA'd (runtime 1.2.2). This doc is the current
state, not a plan — the build-phase history is in git (`PRE_SIGNUP_ONBOARDING.md` /
`ONBOARDING_PLAN.md`, removed 2026-09-07).

Everything here is **pure JS** — ships as an EAS Update, no binary, no App Review.

---

## The flow

```
app launch, signedOut ──► onboarding.seen ?
   │ no                                   │ yes
   ▼                                      ▼
/welcome  (anonymous, 7 steps)          /sign-in
   1  value carousel — 3 slides; slide 1 = the live walking crew scene (CrewScene showcase)
   2  "a few quick things" — 3 crew-framed chip questions on one screen (all skippable)
   3  meet the crew — character-select: switcher of 4 role glyphs, big sprite + role + example
   4  first-win demo — mock fridge (eggs / spinach / yogurt) → Chef + Guardian lines, no API
   5  name your fridge  (FridgeStep, stored in the local draft)
   6  check-in reminder — evening / 2×week / off  (stored in the draft)
   7  soft wall — "Save your setup": a cross-border-transfer consent checkbox gates inline
      Apple / Google (email sign-up has its own checkbox on /sign-in); + "I already have an account"
   │
   ▼ auth success — hydrateOnboarding() replays the draft once:
     create fridge(name) if none · POST /me/onboarding {goal,waste,household} · schedule reminder
   ▼
Home ──► one 4-stop spotlight tour (+ FAB → Inventory → Crew → Chat)
     ──► "Getting started" card — a vertical progress path, 7 nodes, opens with account ✓
```

"I already have an account" / "Log in" is on every step → `/sign-in`. A user who signs out
later lands on `/sign-in` (not `/welcome`) because `onboarding.seen` is set.

## Post-sign-in pieces

- **`app/onboarding.tsx`** — a thin fallback (carousel + name-fridge) for accounts created
  before `/welcome` shipped, and for "Replay intro". Shares components with `/welcome`.
- **`components/home/CoachSpotlight.tsx`** — the one-time 4-stop tour, runs on the first Home
  visit for a fridge with ≤ 6 items. `coach_tour_seen_v1` persists on first show.
- **`components/home/GettingStarted.tsx`** — the progress-path card. Hidden once every step is
  done, the user taps Hide, or the fridge has ≥ 5 items (a reinstall / the demo account
  shouldn't get a beginner checklist). Steps are data-derived where possible.

## Files

| Concern | File |
| --- | --- |
| Pre-sign-in flow | `src/app/welcome.tsx` |
| Shared step components | `src/components/onboarding/shared.tsx` |
| Post-auth fallback | `src/app/onboarding.tsx` |
| Local draft (SecureStore) | `src/lib/onboardingDraft.ts` |
| Draft → server on first auth | `src/lib/hydrateOnboarding.ts` |
| Gating flags + replay | `src/lib/onboarding.tsx` |
| Home spotlight tour | `src/components/home/CoachSpotlight.tsx` |
| Home checklist | `src/components/home/GettingStarted.tsx` |
| Check-in reminder | `src/lib/fridgeReminder.ts` |
| Analytics | `src/lib/analytics.ts` → `POST /events`; `php artisan app:onboarding-funnel` |
| Backend | `users.preferences` JSON, `POST /me/onboarding`, `AnalyticsEvent` model |

## Persistence

All flags and the draft are **per-device** (SecureStore = iOS Keychain, survives reinstall):
`thatfridge_onboarding_draft_v1`, `..._seen_v1`, `..._coach_tour_seen_v1`,
`..._checklist_dismissed_v1` / `..._checklist_visited_v1`, `thatfridge_fridge_reminder_v1`,
`thatfridge_anon_id_v1`. Nothing about onboarding is stored per-account except the three
`preferences` tags. The first-win demo's mock items are **never** migrated.

## Replay

Profile → Settings → **"Replay intro & tips"** → `replayOnboarding()` re-arms the Home
spotlight / tour / checklist (keeps `seen`, so no `/onboarding` bounce) and opens
`/welcome?preview=1` — a non-destructive walk: no draft write, no auth, every hand-off just
closes back to Profile. A "PREVIEW — tap to exit" pill is shown throughout.

## Principles worth keeping

- **Always skippable.** Every step has Skip / "Log in"; nothing blocks reaching Home.
- **The crew nudges, never shames.** No "Guardian is disappointed", no guilt notifications.
- **Endowed progress.** The checklist opens with "Created your account" already ticked.
- **No forced multi-step tour.** The 4-stop spotlight runs once and is skippable; a long
  mandatory walkthrough was deliberately rejected.
- **Value before the ask.** The first-win demo shows the loop on fake data before the wall.
- **Data-driven cuts.** If `app:onboarding-funnel` shows a step bleeding users, remove it —
  the `welcome.tsx` state machine makes any step trivial to drop.

## Still open (post-launch, wait for funnel data)

- **Personalized payoff** — use the stored `preferences` tags to flavour later copy (a
  `save_money` user sees savings framing; a `roommates` household gets the shared-fridge nudge
  sooner), plus a "you're all set, [FridgeName] is ready" peak-end beat.
- **Contextual coach-marks** — one-shot tips for the non-obvious bits: the crew tabs inside
  `/eat`, drag-to-reorder in Inventory, what the Kitchen Score means.
