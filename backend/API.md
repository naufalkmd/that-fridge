# ThatFridge API

Base URL (local dev): `http://127.0.0.1:8000/api`

## Auth

All endpoints except `register`/`login` require a Bearer token:

```
Authorization: Bearer <token>
Accept: application/json
```

Tokens come from Sanctum (personal access tokens, not cookie/SPA sessions) — needed because the frontend runs on a different origin/port than the API. See `README.md` for CORS setup.

---

### `POST /register`

Create an account and get a token back immediately (no separate login needed).

**Body**
```json
{ "name": "Jordan Diaz", "email": "jordan@example.com", "password": "at-least-8-chars" }
```

**201**
```json
{ "user": { "id": "5", "name": "Jordan Diaz", "email": "jordan@example.com" }, "token": "1|abc123..." }
```

**422** — validation failure (`email` already taken, `password` too short, etc.)

---

### `POST /login`

**Body**
```json
{ "email": "jordan@example.com", "password": "at-least-8-chars" }
```

**200** — same shape as register.

**422** — `{"message": "...", "errors": {"email": ["These credentials do not match our records."]}}`

A password login against a social-only account (no password set) returns the same **422**.

---

### `POST /auth/apple` · `POST /auth/google`

Sign in with Apple / Google Sign-In. The app verifies nothing itself — it forwards the identity token and the server validates the signature, issuer, audience (`APPLE_CLIENT_IDS` / `GOOGLE_CLIENT_IDS`) and expiry against the provider's JWKS.

**Body** — Apple: `{ "identityToken": "<JWT>", "name": "Ada Lovelace" }` (`name` optional, only sent on the first-ever Apple authorization). Google: `{ "idToken": "<JWT>" }`.

Resolution: reuse the account already linked to this provider id → else link one that shares the **verified** email → else create a fresh passwordless account (username auto-generated, `email_verified_at` set when the provider vouched for the address; Apple "Hide My Email" / no-email accounts get a synthetic `<provider>_<sub>@users.thatfridge.app` address).

**200** (existing account) / **201** (new account) — same `{ user, token }` shape as register.

**422** — `{"errors": {"token": ["..."]}}` when the token fails verification.

---

### `POST /logout` 🔒

Revokes the token used to make this request. No body.

**200** `{ "message": "Logged out." }`

---

### `GET /me` 🔒

**200** `{ "user": { "id": "5", "name": "Jordan Diaz", "email": "jordan@example.com" } }`

**401** — missing/invalid/revoked token.

---

## Fridges

A fridge has one **owner** (`fridges.user_id`) plus zero or more **members**, tracked in
`fridge_members` (`role`: `owner` | `member` — the owner is always also a member row, kept in
sync automatically whenever a fridge is created). Every endpoint below is scoped to fridges
the current user is a **member** of (owned or joined) — a true non-member gets **403**.
Day-to-day management (view, rename/restyle, sections, items) is open to any member;
destructive/membership actions (delete the fridge, regenerate the invite code, remove a
member) are **owner-only**.

### `GET /fridges` 🔒

Returns every fridge the current user is a member of (owned or joined), fully nested
(sections → items).

**200**
```json
{
  "data": [
    {
      "id": "1",
      "name": "Kitchen",
      "style": "photo",
      "photo_url": null,
      "invite_code": "7F3KQXRT",
      "role": "owner",
      "member_count": 2,
      "sections": [
        {
          "id": "1",
          "name": "Top shelf",
          "items": [
            {
              "id": "1",
              "name": "Milk",
              "icon": "milk",
              "nutrition_category": "dairy",
              "freshness": 50,
              "days": 4,
              "note": null,
              "location": "fridge"
            }
          ]
        }
      ]
    }
  ]
}
```

`freshness` (0–100, nullable) and `days` (nullable) are **computed on read** from `expiry_date` + `shelf_life_days` — they are not stored columns. `freshness` is null if the item has no `expiry_date` or no shelf-life value (own or from its linked product).

`role` is the *current user's* role on this fridge. `invite_code` is always included for any
member (any member can share it to bring in more people, not just the owner) — only
regenerating it is owner-restricted.

### `POST /fridges` 🔒

**Body** `{ "name": "Garage", "style": "classic", "photo_url": "data:image/jpeg;base64,..." }` — `style` and `photo_url` optional.

**200** — single fridge object (same shape as above, `sections: []`, `role: "owner"`). A
unique `invite_code` is generated automatically.

### `POST /fridges/join` 🔒

Join an existing fridge via its invite code — the code itself is the access control, same
trust model as sharing a link. Case-insensitive.

**Body** `{ "code": "7f3kqxrt" }`

**200** — the joined fridge (`role: "member"`), same shape as above. **422** if the code
doesn't match any fridge, or the user is already a member of it.

### `GET /fridges/{fridge}` 🔒

**200** — single fridge, nested. **403** if not a member.

### `PATCH /fridges/{fridge}` 🔒

**Body** — any of `name`, `style`, `photo_url`. Any member, not just the owner.

**200** — updated fridge.

### `DELETE /fridges/{fridge}` 🔒

Owner only — **403** for a non-owner member.

**204** — cascades: deletes all its sections/items and its `fridge_members` rows too.

### `GET /fridges/{fridge}/members` 🔒

List everyone with access, owner first. Any member can view this, not just the owner.

**200**
```json
{
  "data": [
    { "id": "5", "name": "Jordan", "email": "jordan@example.com", "role": "owner", "joinedAt": 1734000000000 },
    { "id": "9", "name": "Riley", "email": "riley@example.com", "role": "member", "joinedAt": 1734100000000 }
  ]
}
```

### `POST /fridges/{fridge}/invite-code/regenerate` 🔒

Owner only. Replaces the fridge's invite code — the old code stops working immediately (one
active code per fridge, no history of past codes).

**200** `{ "invite_code": "9KQZ2LMP" }`. **403** for a non-owner member.

### `DELETE /fridges/{fridge}/members/{user}` 🔒

Owner only, removes another member. **422** if `{user}` is the owner (delete the fridge
instead — no ownership transfer in v1). **403** for a non-owner member.

**204**

### `POST /fridges/{fridge}/leave` 🔒

Leave a fridge you're a member of but don't own. **422** if the current user is the owner.

**204**

---

## Sections

Always created/modified under a parent fridge; ownership is enforced via that fridge.

### `POST /fridges/{fridge}/sections` 🔒

**Body** `{ "name": "Drinks shelf", "position": 0 }` — `position` optional, default `0`.

**201**
```json
{ "id": "1", "name": "Drinks shelf", "items": [] }
```

### `PATCH /sections/{section}` 🔒

**Body** — any of `name`, `position`.

**200** — updated section.

### `DELETE /sections/{section}` 🔒

**204** — cascades to its items.

---

## Items

Always created/modified under a parent section. **This is the contract Track B's ingestion endpoints (manual entry, barcode, receipt scan, photo scan) write through.**

### `POST /sections/{section}/items` 🔒

**Body**
```json
{
  "product_id": null,
  "name": "Milk",
  "icon": "milk",
  "nutrition_category": "dairy",
  "location": "fridge",
  "quantity": 1,
  "expiry_date": "2026-08-01",
  "shelf_life_days": 8,
  "note": null,
  "source": "manual"
}
```

| field | required | notes |
|---|---|---|
| `product_id` | no | must exist in `products` if given |
| `name` | yes | |
| `icon` | yes | free string, matches frontend icon key |
| `nutrition_category` | no | one of `protein`, `vegetables`, `fruit`, `grains`, `dairy`, `other_extras` — a lightweight food-group tag (not macro/nutrient tracking), auto-guessed from `icon` client-side but user-editable. Feeds the Food Balance goal metric's variety calculation; `other_extras` (sauces/snacks/condiments/drinks/desserts) is deliberately excluded from that calculation so it can't inflate the score |
| `category_id` | no | id of one of the caller's [categories](#categories) (or `null`). A free user-defined organisational label for the Inventory filter bar — **unrelated** to `nutrition_category` and the scores it feeds |
| `location` | no | `fridge` \| `freezer` \| `pantry` |
| `quantity` | no | default `1` |
| `expiry_date` | no | `YYYY-MM-DD` |
| `shelf_life_days` | no | used with `expiry_date` to compute `freshness` |
| `note` | no | |
| `source` | no | `manual` \| `barcode` \| `receipt` \| `photo` \| `voice` |

**201** — item object (same shape as nested items above, with computed `freshness`/`days`).

### `PATCH /items/{item}` 🔒

**Body** — any subset of the fields above.

**200** — updated item.

### `DELETE /items/{item}` 🔒

**204**

### `PATCH /items/bulk-category` 🔒

Assign one category (or `null` to clear) to many items at once — the Inventory multi-select
"Move to…" action. Items the caller isn't a member of the fridge for are silently skipped.

**Body**: `item_ids` (array of ids, required), `category_id` (id of a caller's category, or `null`).

**200** — `{ "updated": <count> }`

---

## Categories

User-defined organisational labels for the Inventory filter/grouping bar. Private per user,
independent of `items.nutrition_category` and the scores/badge that field feeds.

### `GET /categories` 🔒

**200** — `{ "data": [ { "id", "name", "color", "position" }, … ] }`, ordered by `position` then `id`.

### `POST /categories` 🔒

**Body**: `name` (required, ≤40 chars, unique per user), `color` (optional string).

**201** — the category object. `position` is set to max + 1.

### `PATCH /categories/{category}` 🔒

**Body** — any subset of `name`, `color`, `position`.

**200** — updated category.

### `DELETE /categories/{category}` 🔒

**204**. Items pointing at it fall back to "Uncategorized" (`category_id` → `null`).

---

## Item detail suggestions

### `POST /items/suggest-details` 🔒

Backs the Add-item form's "Auto-fill" button. Stateless — the item doesn't need to exist yet, since this runs while the form is still being filled in.

**Body**
```json
{ "name": "Sourdough bread", "icon": "bread" }
```
`icon` is optional.

**200**
```json
{ "shelf_life_days": 3, "location": "pantry", "nutrition_category": "grains" }
```

`nutrition_category` is one of the six `Item` food groups (`protein`, `vegetables`, `fruit`, `grains`, `dairy`, `other_extras`) or **null** when it can't be guessed — the app fills the food-group chips with it.

Calls the same OpenRouter model as `/chat`. Without `OPENROUTER_API_KEY` configured, or if the call fails, falls back to a small static keyword lookup server-side (see `AgentService::fallbackItemSuggestion` / `guessNutritionCategory`) so the button still does something reasonable offline.

---

## Shopping list

Flat list, scoped directly to the user (not nested under a fridge).

### `GET /shopping-items` 🔒

**200**
```json
{ "data": [{ "id": "1", "name": "Eggs", "icon": "egg", "section": "Dairy", "checked": false }] }
```

### `POST /shopping-items` 🔒

**Body** `{ "name": "Eggs", "icon": "egg", "section": "Dairy", "checked": false }` — `icon`/`checked` optional (`checked` defaults `false`).

**201** — shopping item object.

### `PATCH /shopping-items/{shoppingItem}` 🔒

**Body** — any subset of `name`, `icon`, `section`, `checked`. Toggling done state is just `{ "checked": true }`.

**200** — updated shopping item.

### `DELETE /shopping-items/{shoppingItem}` 🔒

**204**

---

## Notification preferences

Singleton per user — no id in the URL. First `GET`/`PATCH` auto-creates the row with defaults (all `true`) if it doesn't exist yet.

### `GET /notification-prefs` 🔒

**200**
```json
{ "expiryAlerts": true, "lowStock": true, "recipeTips": true, "weeklyDigest": true, "crewActionsEnabled": false, "social": true }
```

`crewActionsEnabled` gates shared-fridge item/note activity (`itemAdded`, `itemUsed`, `note`) and defaults **off**. `social` gates invites/join-requests/approvals/members (`invite`, `joinRequest`, `requestApproved`, …) and defaults **on**. When a pref is off the matching `notification_events` row is never created (same as the expiry cron).

### `PATCH /notification-prefs` 🔒

**Body** — any subset of `expiryAlerts`, `lowStock`, `recipeTips`, `weeklyDigest`, `crewActionsEnabled`, `social` (booleans).

**200** — full updated prefs object.

---

## Notification events

History of things worth telling the user about — the freshness cron (below), plus **activity events** raised in real time when someone acts on a shared fridge or an invitation. Mark one done with the `PATCH` below.

Two scopes, unioned in the feed:
- **Personal** — `user_id` is set. Addressed to one person (an invite, an approval, "you were removed"). Visible to that user even before they're a member of the fridge it's about.
- **Fridge-wide** — `user_id` is null. Visible to every current member (the expiry/low-stock cron writes these).

Activity kinds and what raises them:

| kind | raised when | recipient | pref |
|------|-------------|-----------|------|
| `invite` | owner invites a user | invitee | `social` |
| `joinRequest` | user asks to join | fridge owner | `social` |
| `requestApproved` | owner approves a request / invitee's pending request is auto-accepted | requester | `social` |
| `requestDeclined` | owner declines a request | requester | `social` |
| `inviteAccepted` | invitee accepts | fridge owner | `social` |
| `inviteDeclined` | invitee declines | fridge owner | `social` |
| `memberLeft` | member leaves | fridge owner | `social` |
| `removed` | owner removes a member | removed member | `social` |
| `itemAdded` | item added to a fridge with ≥2 members | other members | `crewActionsEnabled` |
| `itemUsed` | item quantity hits 0 in a fridge with ≥2 members | other members | `crewActionsEnabled` |
| `note` | note added to a shared fridge | other members | `crewActionsEnabled` |

Every event also queues a push (`SendPushNotification`) to the recipient's registered devices via Expo.

### `GET /notification-events` 🔒

Returns the current user's personal events plus fridge-wide events for fridges they belong to, newest first, capped at 200.

**200**
```json
{
  "data": [
    {
      "id": "1",
      "fridgeId": "3",
      "fridgeName": "Kitchen",
      "itemId": "12",
      "kind": "expiring",
      "message": "\"Milk\" expires in 1 day(s)",
      "createdAt": 1785949268000,
      "done": false
    }
  ]
}
```

`createdAt` is a Unix ms timestamp. `itemId` is nullable (present for `expiring`/`itemAdded`/`itemUsed`).

### `PATCH /notification-events/{notificationEvent}` 🔒

**Body** `{ "done": true }`

**200** — updated event, same shape as above. Allowed for the event's target user (personal) or any member of its fridge (fridge-wide); anyone else gets **403**.

---

## Push tokens

Device registration for Expo push. The app posts its `ExponentPushToken[…]` on sign-in and deletes it on sign-out.

### `POST /push-tokens` 🔒

**Body** `{ "token": "ExponentPushToken[…]", "platform": "ios" | "android" | null }`

Idempotent — re-posting the same token refreshes it; a token that belonged to another user moves to the caller (one device, one active account).

**204**

### `DELETE /push-tokens` 🔒

**Body** `{ "token": "ExponentPushToken[…]" }` — only removes a token owned by the caller.

**204**

---

## Usage history

Tracks items the user has used up (see `POST /usage-history`), scoped per user. This is what backs the "AI Data & Memory" screen's "Personalization Memory" section, and is fed back into the Shopkeeper agent's prompt as real context (see `AgentService::getSystemPrompt`'s `$usageContext`) — not just a locally-displayed log.

### `GET /usage-history` 🔒

Newest-used first.

**200**
```json
{
  "data": [
    { "id": "3", "key": "bananas", "name": "Bananas", "icon": "banana", "category": "fruit", "count": 1, "freshUseCount": 1, "freshnessSum": 80, "freshnessSampleCount": 1, "lastAt": 1786036186000 }
  ]
}
```

### `POST /usage-history` 🔒

Records that an item was used up (consumed) — **not** called for items thrown away wasted; the frontend only calls this from its "Used it up" action (and "Mark as made" on a recipe, which is the same action run per matched ingredient), never from "Throw away". This is what keeps this table an honest consumption signal, used by both the `items_rescued`/`freshness_at_use` [user goal](#user-goal) metrics and the Food Balance score's variety calculation. Upserts by a normalized `key` (lowercased, trimmed `name`) scoped to the user — an existing entry gets `count` incremented and `last_used_at` bumped rather than a duplicate row being created.

**Body**
```json
{ "name": "Bananas", "icon": "banana", "category": "fruit", "daysRemaining": 2, "freshness": 80 }
```
`category`, `daysRemaining`, and `freshness` are all optional — fed straight from the frontend's `Item.nutritionCategory`/`Item.days`/`Item.freshness` at the moment the item was removed, not invented. `category` is one of the [nutrition categories](#items) and is overwritten on every call (like `name`/`icon` — it reflects the item's category the most recent time it was used, not a history); it feeds the Food Balance score's variety grouping (`other_extras` is excluded from that calculation). `daysRemaining`/`freshness` back the goal metrics as described there: a non-negative `daysRemaining` increments `freshUseCount`, and `freshness` adds to a running `freshnessSum`/`freshnessSampleCount`. All three are all-time cumulative — there's no per-event history, just one row per distinct item name — so they answer "since you started tracking," not a specific week/month.

**200** — the created/updated entry:
```json
{
  "id": "3", "key": "bananas", "name": "Bananas", "icon": "banana", "category": "fruit",
  "count": 1, "freshUseCount": 1, "freshnessSum": 80, "freshnessSampleCount": 1,
  "lastAt": 1786036186000
}
```

### `DELETE /usage-history/{usageHistory}` 🔒

Removes one entry. **204**.

### `DELETE /usage-history` 🔒

Clears every entry for the current user. **204**.

---

## Recipes

A recipe with `user_id: null` is curated (visible/read-only-ish to everyone); a set `user_id` is a custom recipe, visible and editable only by its owner. `ingredients` is an array of `{name, icon}`; `steps` is an array of strings; `attachments` is an array of `{type: "image"|"video", url}`.

### `GET /recipes` 🔒

Every curated recipe plus the current user's own. **200**, array of recipe objects (see shape below).

### `POST /recipes` 🔒

**Body**: `name` (string), `minutes` (integer 1-1440), `category` (nullable, one of `breakfast`\|`lunch`\|`dinner`\|`dessert`\|`snack`\|`quick` — the user's own organizational tag, shown in Food Hub's filter chips), `ingredients` (array, each `{name, icon}` required), `steps` (array of strings), `attachments` (optional array).

Also runs the one-time "What Should I Eat?" tagging call (`AgentService::tagRecipe` — same OpenRouter-or-mock-fallback pattern as `POST /items/suggest-details`) and persists its result alongside creation. **Not** re-run on `PATCH` — tags are advisory, not correctness-critical.

**201**:
```json
{ "data": {
  "id": "1", "name": "Weeknight Pasta", "minutes": 20, "category": null,
  "ingredients": [{ "name": "Pasta", "icon": "leftovers" }], "steps": ["Boil it", "Eat it"], "attachments": [],
  "mealType": "dinner", "vibes": [], "foodFocus": ["balanced"], "madeCount": 0,
  "isCustom": true, "isFavorite": false
} }
```

### `PATCH /recipes/{recipe}` 🔒 · `DELETE /recipes/{recipe}` 🔒

Owner only. Same body fields as `POST` (all optional on `PATCH`). Tags (`mealType`/`vibes`/`foodFocus`) are untouched by an update.

### `POST /recipes/{recipe}/favorite` 🔒 · `DELETE /recipes/{recipe}/favorite` 🔒

Any visible recipe (curated or own). Toggles the current user's favorite. **200**, updated recipe.

### `POST /recipes/attachments` 🔒 · `POST /recipes/import-link` 🔒

Reference-media upload and link-import parsing for the recipe form — unrelated to tagging/suggestions, documented here only for completeness of the Recipes surface.

---

## "What Should I Eat?"

A floating-button feature on the Food Hub Recipes tab: pick a meal type + vibes + food focus, get ranked recipes from the user's own visible collection, split into an **exact** tier and a **similar** tier rather than one flat list — each shown 3 at a time with its own Shuffle button to page through the rest. `meal_type`/`vibes`/`food_focus` are the recipe's stored tags (see above); `something_new` and `use_it_up` are **not** tags — they're computed live, per request, against `made_count` and the user's current inventory, so they can't go stale between tagging and query time.

### `GET /recipes/suggest` 🔒

**Query** (all optional):
- `meal_type` — one of `breakfast`\|`lunch`\|`dinner`\|`snack`. Hard filter for the `exact` tier (exact match), also scored (see below).
- `vibes[]` — any of `comfort`\|`light_fresh`\|`quick_easy` (matched against the recipe's stored `vibes`) plus `something_new` (recipe's `madeCount === 0`) and `use_it_up` (ingredient icons overlap the user's own items that have an `expiry_date` set, weighted by urgency: 0 days left = weight 3, 3+ days left = weight 0). Scored, not filtered — every selected vibe adds to one combined score per recipe.
- `food_focus[]` — any of `high_protein`\|`high_veg`\|`low_carb`\|`balanced`. Hard filter for `exact` (at least one overlap with the recipe's stored `foodFocus`) **and** scored (one point per overlapping tag) — a food-focus-only search (no vibes picked) still has something to award points for, instead of every surviving candidate landing on a flat 0 and getting dropped.

**`exact`** honors every hard filter and only includes recipes that also score above 0. **`similar`** is what dropping a hard filter turns up beyond that — `food_focus` is dropped first, then `meal_type` too — real recipes that share the selected vibes/food_focus without fully satisfying the exact combination. Both tiers score against the **original** selection (relaxing which filter is *applied* doesn't change what's being *scored for*), and `similar` always excludes anything already in `exact`. A bare `meal_type`-only search (no vibes, no food_focus) never gets a `similar` tier — there's nothing left to judge similarity by once the one filter picked is gone. Each tier is capped at 12 (`RecipeController::SUGGEST_MAX_RESULTS`), sorted by score descending — the frontend shows 3 at a time per tier and shuffles through the remainder client-side rather than re-querying.

**200**:
```json
{
  "exact": [ /* up to 12 recipe objects, same shape as GET /recipes */ ],
  "similar": [ /* up to 12 more, scored the same way but outside the exact filter set */ ],
  "exhausted": false
}
```
`exhausted: true` means both tiers came up empty; the frontend falls back to the existing Chef chat flow rather than this endpoint inventing a second recipe-generation path — sending a message built from whichever `meal_type`/`vibes`/`food_focus` were selected (e.g. "Can you suggest a dinner recipe that's comforting, high in protein, using what's in my fridge?"), so Chef's answer still honors the user's picks even outside the tagged-recipe pool. The same fallback is offered even when `exact`/`similar` aren't empty, in case none of the shown/shuffled matches actually appeal.

Deliberately **not** wrapped in the standard `{"data": ...}` Resource envelope — `apiFetch` on the frontend unwraps a top-level `data` key automatically, which would strip the sibling `exhausted` flag (and the second `similar` list).

### `POST /recipes/{recipe}/mark-made` 🔒

Increments the recipe's `madeCount` by 1. Called once per recipe whenever the existing Mark-as-made flow (see [Items](#items)) is confirmed against it. Any visible recipe (curated or own) — it's a plain shared counter, not per-user state. **200**, updated recipe.

---

## User goal

A single, editable goal per user (singleton — no id in the URL, same pattern as [Notification preferences](#notification-preferences)). First `GET`/`PATCH` auto-creates the row with a default goal if it doesn't exist yet, so every user always has one.

### `GET /user-goal` 🔒

**200** (or **201** the very first time, since `firstOrCreate()` creates the row)
```json
{ "metricType": "waste_rate", "targetValue": 20, "period": "weekly", "isActive": true, "updatedAt": 1786036186000 }
```

Default for new users: `metricType: "waste_rate"`, `targetValue: 20`, `period: "weekly"`, `isActive: true`.

### `PATCH /user-goal` 🔒

**Body** — any subset of `metricType`, `targetValue`, `period`, `isActive`.

| field | notes |
|---|---|
| `metricType` | one of `waste_rate`, `items_rescued`, `freshness_at_use` (see below) |
| `targetValue` | integer ≥ 1. Capped at 100 for `waste_rate`/`freshness_at_use` (both 0-100 scales) — no cap for `items_rescued` |
| `period` | `weekly` \| `monthly` — descriptive intent; see the per-metric notes below for what's actually period-bound |
| `isActive` | `false` = user has turned off/skipped goal tracking, without losing their chosen metric/target |

**200** — updated goal, same shape as `GET`.

**422** — an unsupported `metricType` (including `money_saved` — see below) or an out-of-range `targetValue`, in the standard [validation error shape](#error-shape).

#### Supported metrics

- **`waste_rate`** — % of currently-owned items past their `expiry_date` right now, out of all owned items (`Item.days < 0` — the one unambiguous "still here past its date" signal; see [Items](#items)). Computed live from current inventory on every read, so `period` doesn't change how it's measured — it's always "right now," not a weekly/monthly rate.
- **`items_rescued`** — count of items removed via `POST /usage-history` while still within their date (`daysRemaining >= 0` at the time), summed across `freshUseCount`. **All-time since tracking began**, not strictly per-`period` — `usage_history` has no per-event timestamp log, only a cumulative count per item name, so a real "this week" figure isn't available yet.
- **`freshness_at_use`** — weighted average of `freshness` values recorded via `POST /usage-history` at the moment items were used (`freshnessSum` / `freshnessSampleCount`). Same **all-time** caveat as `items_rescued`.
- **`money_saved` is not supported.** There's no price data anywhere in the schema (no `price` column on `products`, `items`, or `receipt_line_items`, and receipt/photo scanning doesn't capture cost) — offering this metric would mean inventing a number, so it's intentionally left out until real price data exists.

---

## Score snapshots

Read-only weekly history of the "Your Kitchen This Week" scores (Waste Saver / Food Balance — see the [Kitchen score cron](#kitchen-score-cron-not-an-http-endpoint) below), used to compute the Waste Saver streak and a week-over-week trend on the frontend. Rows are written exclusively by that cron, never by a client request — so a week only has a row if the cron actually computed one, which is what makes a missing week correctly read as a broken streak instead of a guess.

### `GET /score-snapshots` 🔒

**Query** — `weeks` (optional, default 12, max 52): how many of the most recent weeks to return.

**200**
```json
{ "data": [
  { "weekOf": "2026-08-03", "wasteScore": 82, "balanceScore": 61 },
  { "weekOf": "2026-08-10", "wasteScore": 88, "balanceScore": null }
] }
```
Ordered oldest first. `balanceScore` is `null` for a week where Food Balance didn't have enough recent usage-history entries to say anything (same "not enough data" case the live score card shows).

---

## Badges

One-time unlocks for specific anti-waste actions, not just score thresholds. `badgeKey` is one of `rescued_10`, `first_link_recipe`, `full_week_variety`, `zero_waste_week` (see `App\Services\BadgeService::BADGES` for the canonical threshold map — mirrored in the frontend's `BADGE_CATALOG` for display copy).

| `badgeKey` | target | earned when |
|---|---|---|
| `rescued_10` | 10 | Marked "used" via the Mark-as-made recipe flow 10 times while the item was still within 3 days of expiry (client-reported, one `progress` call per rescue) |
| `first_link_recipe` | 1 | Imported a recipe via the "paste a link" flow at least once |
| `full_week_variety` | 1 | The live Food Balance score's variety hit all 5 counted food groups at least once |
| `zero_waste_week` | 1 | A weekly kitchen-score snapshot landed with zero overdue items — awarded by the cron itself, never by a client call |

### `GET /badges` 🔒

**200** — always all 4 keys (create-on-read the first time), regardless of progress.
```json
{ "data": [
  { "badgeKey": "rescued_10", "progress": 3, "target": 10, "earnedAt": null },
  { "badgeKey": "first_link_recipe", "progress": 1, "target": 1, "earnedAt": 1786036186000 }
] }
```

### `POST /badges/{badgeKey}/progress` 🔒

**Body**: `{ "incrementBy": 1 }` — only `1` is accepted; each call represents one real occurrence of the action, not a client-chosen jump.

**200** — the updated badge row, same shape as `GET`. Idempotent past the threshold: once `earnedAt` is set, further calls leave `progress`/`earnedAt` unchanged rather than accumulating past `target`.

**404** — unknown `badgeKey`.

---

## Organizer tally

Cumulative, all-time counts backing the "Tidiness" score — how many items Organizer has checked across every sweep, and how many of those were already in the location Organizer would have suggested. One row per user (`firstOrCreate`-on-read, like User goal). Never resets; a bad week doesn't erase past good habits, mirroring how the other three sub-scores read "recent behavior" rather than "right now only."

### `GET /organizer-tally` 🔒

**200** (or **201** the very first time, since `firstOrCreate()` creates the row)
```json
{ "data": { "itemsCheckedTotal": 42, "itemsCorrectTotal": 35, "lastCheckedAt": 1786036186000 } }
```
A fresh account reads `{ "itemsCheckedTotal": 0, "itemsCorrectTotal": 0, "lastCheckedAt": null }` — the frontend treats `itemsCheckedTotal === 0` as "not enough data yet", same as Waste Saver/Food Balance before their own minimums are met.

### `POST /organizer-tally/increment` 🔒

Called once per full Organizer sweep (`checkOrganizerMoves()` on the frontend, after every item in the active fridge has been checked against its AI-suggested location) — not per item.

**Body**:
```json
{ "checked": 6, "correct": 5 }
```

| field | notes |
|---|---|
| `checked` | integer, `min:1` — how many items were checked this sweep |
| `correct` | integer, `min:0`, must not exceed `checked` — how many were already in the right spot |

**200** — the updated, cumulative tally, same shape as `GET`.

**422** — `correct` greater than `checked`, in the standard [validation error shape](#error-shape).

---

## Freshness cron (not an HTTP endpoint)

`app:check-item-freshness` runs daily at 07:00 (`routes/console.php`). Scans all items with an `expiry_date` within 3 days (or already past), and for each one:

- skips it if the owning user has `expiryAlerts` off
- skips it if an undone `expiring` notification already exists for that item (no duplicate spam)
- otherwise creates a `notification_events` row: `{ fridge_id, item_id, kind: "expiring", message, done: false }`, readable via `GET /notification-events` above

Run manually any time with:
```bash
php artisan app:check-item-freshness
```

**Not yet built:** `lowStock`/`recipe` kinds are not generated yet — `lowStock` needs a "usual quantity" baseline that doesn't exist (deferred `usage_history` feature), and `recipe` suggestions haven't been scoped. The frontend's Home screen still shows its own locally-computed low-stock/recipe tip cards, but those are session-only (no persisted notification behind them) until this is built.

---

## Kitchen score cron (not an HTTP endpoint)

`app:snapshot-kitchen-scores` runs weekly, Monday at 07:30 (`routes/console.php`). For every user, computes the same Waste Saver / Food Balance scores the frontend shows live (`App\Services\KitchenScoreService` — a deliberately-kept-in-sync PHP port of `frontend/lib/thatfridge/scoring.ts`'s `computeWasteSaverScore`/`computeFoodBalanceScore`), independent of whether that user opened the app that week:

- if the user has no items and no usage history at all, skips them entirely rather than storing a fabricated score — a missing week already reads as a broken streak on the frontend
- otherwise upserts a `weekly_score_snapshots` row keyed on `(user_id, week_of)` — re-running mid-week updates the existing row rather than duplicating it
- when the computed `overdueCount` is 0, awards the `zero_waste_week` badge (see [Badges](#badges))

Run manually any time with:
```bash
php artisan app:snapshot-kitchen-scores
```

---

## Error shape

Validation errors (422):
```json
{ "message": "The name field is required.", "errors": { "name": ["The name field is required."] } }
```

Auth/authorization failures: **401** (missing/invalid token) or **403** (valid token, wrong owner) with `{ "message": "..." }`.
