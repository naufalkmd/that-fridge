# Photo of fridge (kitchen scan) — plan

Status: phases 1–4 built on `feature/fridge-sweep` (2026-09-28), not yet device-checked or deployed.
Replaces the one-shot "Photo of fridge" add method.

## The problem

The job is not "photograph a fridge". It is: **turn whatever storage space the user points the
camera at into accurate inventory, without duplicating what is already tracked.**

The first sweep assumed a standard fridge (a fixed Door → Top → … → Freezer script), took the
item's location from that label, and treated every sweep as a first sweep. Real kitchens differ
along four axes:

| Axis | Varies by | Failure if ignored |
|---|---|---|
| Space | fridge, freezer, pantry/cupboard, a second fridge, a grocery haul on the counter | wrong location → wrong shelf life and reminders |
| Coverage | 1 shot or 10, overlapping shots, odd layouts | fixed labels; one item counted twice across shots |
| Visibility | opaque tubs, bags, items behind items, dark shelves | missed items; silent empty shots |
| History | first setup vs. re-scanning a tracked space | duplicates; used-up items never cleared |

## The design

One flow (shown in the Add menu as **Photo of fridge**, the name the store listing and ads use)
that behaves as *setup* on an empty space and as a *check-in*
on a tracked one — decided by the data, not a mode switch.

### 1. Space (per shot)
- A sticky chip row above the shutter: **Fridge · Freezer · Pantry · Groceries**. Each shot takes
  the current chip; switching mid-sweep is one tap, so one sweep can cover several spaces.
- The HUD hint follows the space ("Pantry · shot 2 — each shelf or cupboard"); no fixed script.
- The vision call also returns a `scene` guess per photo (`fridge | freezer | pantry | counter |
  unclear`). On the results screen a shot whose scene disagrees with its chip shows the chip in
  amber ("Looks like pantry") — tap it to change that shot's space. The user decides; the model
  only flags.
- Space → item location: Fridge/Freezer/Pantry map directly. **Groceries** (just bought, not yet
  put away) uses the model's per-item `storage` guess instead.
- With more than one fridge, the camera shows which fridge the sweep is for (defaults to the
  scoped fridge) and lets the user switch.

### 2. History: compare against inventory
For each item found in a Fridge/Freezer/Pantry shot, look for the same item already in that
fridge at that location (normalised name, then word containment: "milk" ↔ "whole milk"):
- **New** → ticked, will be added.
- **Already tracked** → shown as "In fridge", unticked (tap to add another batch anyway).
- **Tracked but not seen** in a space that was scanned → a separate "Not seen in this scan"
  list, each defaulting to **Still there**, with **Used** / **Tossed**. Nothing is removed unless
  the user taps. Removals go through the normal delete (so Kitchen Score, waste stats and undo
  history behave as elsewhere); the chosen outcome corrects the classifier's guess if they differ.
- Groceries shots are never compared (a haul is always new stock).
- Only spaces with at least one successful shot are checked, so a fridge-only sweep never asks
  about the pantry. A partial sweep (one shelf) can still list items that are simply out of
  frame — hence the "Still there" default.

### 3. Coverage
- Within a space, the same item from overlapping shots merges into one tile ("seen in 2 shots").
  Repeats inside one photo count as quantity.
- Up to **10** shots per sweep (was 6), each still one photo scan at 3 credits; the camera shows
  the running credit total.

### 4. Visibility
- A shot that comes back empty gets an amber thumbnail badge straight away and a results notice
  ("1 shot found nothing — too dark or too far?").
- The results grid ends with **"Add something the scan missed"**: type a name, it joins the list
  at the last shot's space.
- Low-confidence items keep the "?" marker.

## Where it lives
- Backend: `PhotoService` prompt returns `{scene, items[{…, storage, box}]}`; `PhotoController`
  adds `scene` to the response. Old clients read only `detected_items`, unchanged.
- Mobile: `src/app/sweep.tsx` (camera, reveal, results); pure logic in `src/lib/sweep.ts`
  (`buildSweepResults`, `matchInventory`, geometry) with tests in `src/lib/__tests__/sweep.test.ts`.

## Still open (owner decisions)
- Price: 3 credits per shot means a 10-shot kitchen sweep is 30 credits (of 50 free a month). A
  flat per-sweep price or a free first sweep is a `CreditCost` change — decide after the credit
  audit and real `AI costs` data (per-shot cost is on the admin AI costs page).
- Box accuracy of the default model (Haiku 4.5) vs. a Gemini model via
  `OPENROUTER_PHOTO_SCAN_MODEL` — test on real photos.
- Later: containers ("tub, contents unclear" → ask what's in it), video sweep, per-shelf
  categories.
