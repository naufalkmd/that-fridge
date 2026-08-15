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
{ "user": { "name": "Jordan Diaz", "email": "jordan@example.com" }, "token": "1|abc123..." }
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

---

### `POST /logout` 🔒

Revokes the token used to make this request. No body.

**200** `{ "message": "Logged out." }`

---

### `GET /me` 🔒

**200** `{ "user": { "name": "Jordan Diaz", "email": "jordan@example.com" } }`

**401** — missing/invalid/revoked token.

---

## Fridges

A fridge belongs to one user. Every endpoint below is scoped — a user can only see/touch their own fridges. Cross-user access returns **403**.

### `GET /fridges` 🔒

Returns all of the current user's fridges, fully nested (sections → items).

**200**
```json
{
  "data": [
    {
      "id": "1",
      "name": "Kitchen",
      "style": "photo",
      "photo_url": null,
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

### `POST /fridges` 🔒

**Body** `{ "name": "Garage", "style": "classic", "photo_url": "data:image/jpeg;base64,..." }` — `style` and `photo_url` optional.

**201** — single fridge object (same shape as above, `sections: []`).

### `GET /fridges/{fridge}` 🔒

**200** — single fridge, nested. **403** if not yours.

### `PATCH /fridges/{fridge}` 🔒

**Body** — any of `name`, `style`, `photo_url`.

**200** — updated fridge.

### `DELETE /fridges/{fridge}` 🔒

**204** — cascades: deletes all its sections and their items too.

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
{ "shelf_life_days": 3, "location": "pantry" }
```

Calls the same OpenRouter model as `/chat`. Without `OPENROUTER_API_KEY` configured, or if the call fails, falls back to a small static lookup table server-side (see `AgentService::fallbackItemSuggestion`) so the button still does something reasonable offline.

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
{ "expiryAlerts": true, "lowStock": true, "recipeTips": true, "weeklyDigest": true }
```

### `PATCH /notification-prefs` 🔒

**Body** — any subset of `expiryAlerts`, `lowStock`, `recipeTips`, `weeklyDigest` (booleans).

**200** — full updated prefs object.

---

## Notification events

Read-only history of things the freshness cron (below) has flagged, plus a way to mark one done. Scoped through the owning fridge — cross-user access returns **403**, same as fridges/sections/items.

### `GET /notification-events` 🔒

Returns all events across all of the current user's fridges, newest first.

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

`createdAt` is a Unix ms timestamp. `itemId` is nullable (present for `expiring` events, which are always tied to one item). Only the `expiring` kind is generated today — see the cron notes below.

### `PATCH /notification-events/{notificationEvent}` 🔒

**Body** `{ "done": true }`

**200** — updated event, same shape as above.

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

## Error shape

Validation errors (422):
```json
{ "message": "The name field is required.", "errors": { "name": ["The name field is required."] } }
```

Auth/authorization failures: **401** (missing/invalid token) or **403** (valid token, wrong owner) with `{ "message": "..." }`.
