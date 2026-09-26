# In-app calendar — plan

Status: **phases 1 and 2 built and published via OTA `0a92e78c`, not yet device-checked** (2026-09-26): `GET /api/calendar`,
the calendar screen and Home button, and the meal plan / recipe log (`meal_entries`, sharing rules,
slot templates, reminders, "Add to plan", mark-made logging, privacy policy). Phase 3 not started.
Decided 2026-09-26. Everything below ships over OTA — no native module, no permission, no rebuild.

One calendar screen inside the app showing everything ThatFridge knows about time: expiry dates,
meal plan, recipe logs, automation runs and item activity. It is our own calendar — not synced to
Apple/Google Calendar (a read-only `.ics` subscription feed off the same endpoint is a cheap
add-on later, see "Later").

## Decisions

1. **Household is the default, but the app never says so.** Non-subscribers effectively have a
   personal plan; Pro gets the household behaviour. No "household" label, toggle or paywall copy.
   Rule in "Sharing rules" below.
2. **Activity history = 180 days** (matches `app:prune-stale-data` and the privacy policy). Meal
   entries are user content: kept until the user deletes them.
3. **Entry point: Home**, a calendar button **directly under the notification bell** (right-aligned
   to the bell, on the fridge-selection row). Tapping it opens the calendar; **every day is
   tappable**. Also "Add to plan" on recipe screens.
4. **Meal slots are user-defined**; we only suggest templates.
5. **AI weekly planner ("plan my week around what's expiring") is later** — it spends AI credits,
   so it waits for the credit-scheme audit.

## What the calendar shows

| Kind | Source | Notes |
|---|---|---|
| `expiry` | `items.expiry_date`, via `ItemFreshness::effectiveExpiry` | opened items land on the opened date |
| `meal` | new `meal_entries` | planned / cooked / skipped; a cooked entry *is* the recipe log |
| `machine_scheduled` | `machines.next_run_at` + `MachineSchedule` | only schedule triggers can be projected forward |
| `machine_run` | `machine_runs` | status + what it did |
| `added` / `used` / `wasted` | `items.created_at`, `item_outcomes` | history capped at 180 days |

Recipe "made" today is only a counter (`recipes.made_count`); there is **no dated history to
backfill**, so recipe logs start empty when this ships.

## Data model

`meal_entries` (new): `id`, `user_id` (author), `fridge_id` (nullable), `date`, `slot` (string ≤40,
free label), `time` (HH:MM, nullable — only for a reminder), `recipe_id` (nullable), `title`
(nullable, free text when no recipe), `note`, `status` (`planned|cooked|skipped`), `cooked_at`,
timestamps. Index `(fridge_id, date)` and `(user_id, date)`. Deleting a recipe keeps the entry
(title copied at save time). "Mark as made" (`recipe/mark-made.tsx` → `RecipeController::markMade`)
creates a cooked entry for today, or flips the matching planned one.

Meal slots: the user's own ordered list in `users.preferences.meal_slots` (≤8 labels). First use
offers templates — *Breakfast / Lunch / Dinner / Snack*, *Dinner only*, *Meal-prep Sunday +
weekday lunches*, *Kids' lunchbox + dinner* — and the user can rename, add or remove freely.
Entries store the label text, so changing the list never rewrites history. Agenda order: `time`,
then the viewer's slot order, then label.

## API

- `GET /api/calendar?from&to&fridge&tz` — composed server-side so the effective-expiry logic lives
  in one place. Range ≤ 62 days, entries capped (~500), timestamps placed on the local day using
  the device's `tz`. Returns `entries[]`: `{id, kind, date, title, meta, refs, by?}`.
- `POST|PATCH|DELETE /api/meal-entries`, and `GET /api/meal-slots` / `PATCH` (preferences).
- AgentToolbox (later): `plan_meal`, `list_plan`.

## Sharing rules (household by default, undeclared)

- An entry with a `fridge_id` is visible to the **author always**, and to **other members of that
  fridge only while the fridge owner is Pro** (`User::isPro()` at read time — same gate as
  hosting a shared fridge, `FridgeJoinRequestController`). Members of a Pro-owned fridge can add,
  edit and delete that fridge's entries, like items and notes today.
- Otherwise the entry is personal. Nothing is deleted when Pro lapses; visibility just narrows.
- New entries default to the selected fridge; with "All fridges" selected, to the user's own
  fridge (or none = personal).
- UI never mentions "household". The only visible cue is attribution — "by @name" on an entry
  someone else made — which is also what makes the behaviour non-surprising.
- Assumption to confirm: a free *member* of a Pro-owned fridge participates (the owner's Pro is
  what enables it), matching how shared fridges already work.

## UI (mobile)

- **Button:** an icon button at the right end of Home's fridge-selection row, aligned under the
  notification bell (`app/(tabs)/home.tsx`; the row needs a right-hand slot next to
  `FridgeScopePicker`, so the picker shrinks rather than the button wrapping).
- **Calendar (`app/calendar.tsx`, opened as a modal from that button):** month grid, today
  highlighted, coloured dots per day for what's on it, month navigation by swipe/arrows, kind
  filter chips, and the existing fridge scope (`useScope`, same all-vs-one-fridge rule as Home).
  Custom grid — no new dependency.
- **Every day is tappable** — past, today, future, and the greyed days of neighbouring months.
  Tapping a day selects it and opens that day's detail (a bottom sheet over the grid): its
  entries grouped by kind (expiring items, meals by slot, automation runs, activity) and a "+"
  to plan a meal on that day. Empty days are tappable too (that's how you plan ahead); they show
  "Nothing planned" with the add button.
- **Rows** reuse `NotificationCard`. Tap a row: expiry → item, meal → edit sheet, run → Kitchen
  Lab detail. Adding a meal: slot picker, recipe picker from the recipe book, or free text.
- **Meal reminder:** local notification `kind: "meal"` at the entry's `time`, via
  `lib/localNotifications.ts` (respect the existing permission flow).

## Phases

1. **Read-only calendar (2–3 days) — BUILT.** (`CalendarService`, `CalendarController`, `app/calendar.tsx`,
   `components/calendar/*`, `lib/calendar.ts`; `used`/`wasted`/`added` are per-day counts because
   outcome rows keep no item name.) `GET /api/calendar` (expiry, machines, activity), the screen,
   the Home button. *Done when:* the endpoint respects fridge membership and `effectiveExpiry`;
   180-day cap; timezone placement tested; scope filter matches Home; every day cell opens its
   day detail (past, today, future, adjacent-month days); jest screen test.
2. **Meal plan + recipe log (~3 days) — BUILT.** (`MealEntry` + policy, `MealEntryController`,
   `PATCH /me/meal-slots`, `components/calendar/meal-form.tsx` inside the day sheet, `lib/mealPlan.ts`,
   `syncMealReminder`. Reminders are scheduled on the device that saves the entry only.) Migration, policy, CRUD, templates, "Add to plan",
   mark-made integration, meal reminders, sharing rules + attribution. *Done when:* the sharing
   rules are covered by tests (author / Pro-owner member / non-Pro owner / lapsed Pro), account
   deletion removes the user's entries, admin user-delete audit unaffected.
3. **AI + automation hooks (3–4 days).** Chat tools, Chef weekly planner (needs a `CreditCost`
   entry — after the credit audit), optional Kitchen Lab step.
4. **Later:** read-only `.ics` subscription feed from the same endpoint.

## Privacy / policy (same release as phase 2)

Add meal plans to "Content you create" and to the shared-fridge sentence ("people who share a
fridge can see its contents, notes, items **and meal plans**"). Mirror in the Malay PDPA notice;
add `meal_entries` to account deletion (`AuthController::destroy` / FK cascade) and check the store
privacy labels. Feedback signals (`AlgoFeedback`): plan added / cooked / skipped — structured only,
no titles or notes.

## Risks

- Timezones: `expiry_date` is a date, run/removal times are UTC timestamps → always convert with the
  device `tz`.
- Scope creep: phase 1 alone is useful; do not fold the AI planner into it.
- Silent sharing: attribution + the policy sentence are the guardrails; revisit if users are
  surprised.
- Load: index `items.expiry_date` if the composed query gets slow; `item_outcomes`
  (`user_id, created_at`) and `machine_runs (machine_id, created_at)` are already indexed.
