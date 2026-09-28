# Onboarding — how it works (shipped 2026-09-07)

The whole first-run experience is built and OTA'd (runtime 1.2.2). This doc is the current
state, not a plan — the build-phase history is in git (`PRE_SIGNUP_ONBOARDING.md` /
`ONBOARDING_PLAN.md`, removed 2026-09-07).

Everything here is **pure JS** — ships as an EAS Update, no binary, no App Review.

---

## The flow

Rebuilt 2026-09-28 to get the user's own food in sooner: 7 pre-sign-in steps became 1, and the
real first win (a scan) comes straight after sign-in.

```
app launch, signedOut ──► onboarding.seen ?
   │ no                                   │ yes
   ▼                                      ▼
/welcome  (anonymous)                   /sign-in
   1  welcome — the live walking crew scene, "Use what you have before it goes bad", three
      value lines (scan · reminders · the crew), Get started / "I already have an account"
   2  soft wall — "Save your kitchen": consent checkbox gates inline Apple / Google (email
      sign-up has its own checkbox on /sign-in)
   │
   ▼ auth success — hydrateOnboarding() creates the fridge ("My Fridge") if none
   ▼
Tabs ──► FirstScanGate (once per install): an empty fridge opens /first-scan
         "Let's fill your fridge" → Photo of fridge / Scan a receipt / Scan barcodes → /sweep
         (or "I'll add things later"). Someone with items already skips it silently.
     ──► after that first scan saves: "N items in your fridge — want a nudge?" (the check-in
         reminder, formerly an onboarding step)
     ──► the Home spotlight tour + "Getting started" card (the tour waits for the first-scan
         prompt so the two never overlap)
```

Removed: the 3 questions (goal / waste / household — `preferences` tags now stay empty for new
accounts), meet-the-crew character select, the mock first-win demo, fridge naming and the
reminder step. Funnel events: `welcome_*`, then `onboarding_first_scan_{shown,started,skipped,saved}`
(Admin → onboarding funnel).

## Post-sign-in pieces

- **Signed in without having seen the intro** (an existing account on a new phone): the tabs
  layout just marks it seen — there's nothing to show; `FirstScanGate` still offers the first scan
  for an empty fridge. (The old `/onboarding` carousel + name-your-fridge fallback is gone.)
- **`components/home/CoachSpotlight.tsx`** — the one-time 4-stop tour, runs on the first Home
  visit for a fridge with ≤ 6 items. `coach_tour_seen_v1` persists on first show.
- **`components/home/GettingStarted.tsx`** — the progress-path card. Hidden once every step is
  done, the user taps Hide, or the fridge has ≥ 5 items (a reinstall / the demo account
  shouldn't get a beginner checklist). Steps are data-derived where possible.

## Files

| Concern | File |
| --- | --- |
| Pre-sign-in flow | `src/app/welcome.tsx` |
| First scan (post sign-in) | `src/app/first-scan.tsx`, `src/components/onboarding/FirstScanGate.tsx` |
| Shared step components | `src/components/onboarding/shared.tsx` |
| Local draft (SecureStore) | `src/lib/onboardingDraft.ts` |
| Draft → server on first auth | `src/lib/hydrateOnboarding.ts` |
| Gating flags + replay | `src/lib/onboarding.tsx` |
| Home spotlight tour | `src/components/home/CoachSpotlight.tsx` |
| Home checklist | `src/components/home/GettingStarted.tsx` |
| Check-in reminder | `src/lib/fridgeReminder.ts` |
| Analytics | `src/lib/analytics.ts` → `POST /events`; `php artisan app:onboarding-funnel` |
| Backend | `AnalyticsEvent` model; `POST /me/onboarding` + `users.preferences` tags are kept for older app builds (1.3.3 and earlier still send the answers) |

## Persistence

All flags and the draft are **per-device** (SecureStore = iOS Keychain, survives reinstall):
`thatfridge_onboarding_draft_v1`, `..._seen_v1`, `..._coach_tour_seen_v1`,
`..._checklist_dismissed_v1` / `..._checklist_visited_v1`, `thatfridge_fridge_reminder_v1`,
`thatfridge_anon_id_v1`. Nothing about onboarding is stored per-account except the three
`preferences` tags. The first-win demo's mock items are **never** migrated.

## Replay

Profile → Settings → **"Replay intro & tips"** → `replayOnboarding()` re-arms the Home
spotlight / tour / checklist / first-scan prompt (keeps `seen`) and opens
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
