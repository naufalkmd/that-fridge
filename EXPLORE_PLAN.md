# Explore — plan

Status: **not started** (2026-09-26). Asked for as a Settings row; it needs its own design because it is
a search product plus a user-contribution system. Recommendation: ship Phase 1 after the Sep 30
Shipaton deadline, not before.

## What was asked

One **Explore** page (Profile → Settings → Explore) that:

- has a search box with a really good search algorithm across everything below;
- shows the libraries underneath it: **food icons**, **recipes**, **Machines** (Kitchen Lab automations),
  **meal plans**;
- is **organised from the admin panel** (what is featured, order, hidden);
- lets **users contribute to each library** so others can use what they shared.

## What exists today

| Library | Today | Gap |
|---|---|---|
| Food icons | `shared_icons` (curated pack, no user id), `generated_icons` (per user), Filament `SharedIconResource` / `GeneratedIconResource` | no user "share this icon" action; no search |
| Recipes | `recipes`: curated (no `user_id`) + a user's own; Filament `RecipeResource` | no sharing of a user's recipe; search is per-list only |
| Machines | static `MACHINE_TEMPLATES` inside the app (`lib/machineTemplates.ts`) | not server-side, so no admin control and no contributions |
| Meal plans | `meal_entries` only (personal / shared fridge) | no "plan template" concept at all |

## Phase 1 — Explore, read-only, admin-curated (about 3-4 days)

- `explore_items` table: `type` (icon | recipe | machine | meal_plan), `ref_id` or an inline JSON
  payload, `title`, `blurb`, `tags`, `featured`, `position`, `status` (draft | published | hidden).
  Recipes/icons point at their rows; Machines and meal-plan templates carry their payload (a
  `MachineDraft`, or a list of `{day_offset, slot, title}`).
- `GET /explore?q=&type=` — server-side search (Postgres `pg_trgm` + full-text on title/blurb/tags, ranked:
  exact > prefix > trigram > tag; typo-tolerant; SQLite fallback for tests) and `GET /explore/featured`.
- Mobile `explore.tsx`: search on top, a chip per library, featured rows below. Use = **Copy to mine**
  (recipe → my recipes, icon → picker, Machine → Kitchen Lab review screen, meal plan → applies to a chosen
  week). No AI credits are spent.
- Admin: Filament `ExploreItemResource` (feature, reorder, hide, edit tags) and a bulk "publish curated
  recipes / shared icons / templates" action to seed it. Move `MACHINE_TEMPLATES` server-side here.

## Phase 2 — user contributions (about 4-5 days, needs moderation first)

- "Share to Explore" on my recipe / Machine / meal plan / generated icon. A submission is a
  `pending` `explore_items` row (owner kept, copy-on-share so later edits don't change what others got).
- Moderation queue in the admin panel (approve / reject / remove; audit-logged like the other admin actions).
- **App Store guideline 1.2 (user-generated content)** is the blocker: shared content must have
  a way to **report** it, a way to **block** the contributor (the `Block` model exists for friends),
  filtering/moderation before it shows, and published contact details. Without these, a build with public
  sharing risks rejection. Also: the Terms already grant the icon licence (§4); add the same for
  recipes / Machines / meal plans, and update the privacy policy (public profile name on shared items).
- Rate limits and size caps per contribution; Machines are re-validated with `MachineDraftValidator`
  before they can be published (a shared Machine can only run tools a user could already run).

## Decisions needed

1. Attribution: show the contributor's username, or publish anonymously?
2. Are contributions free for everyone, or a Pro perk?
3. Approve every submission by hand at first, or auto-publish after a report threshold?

## Not in scope

Ratings, comments, following contributors, AI-generated Explore feeds.
