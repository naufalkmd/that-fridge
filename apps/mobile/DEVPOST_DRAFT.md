# ThatFridge — Devpost submission draft (RevenueCat Shipaton 2026)

Draft only — review, edit, and paste into Devpost's actual submission form. Placeholders in
[brackets] need a real value from you before submitting.

---

## Tagline (one-liner, shown under the project name)

Know what's inside before you open the door — an AI kitchen crew that tracks your fridge, beats
expiry dates, and cooks with what you already have.

---

## Inspiration

Every household loses money the same boring way: food goes bad before anyone remembers it's
there. Not because people don't care — because tracking a fridge by memory doesn't scale past a
few items, and nobody wants to type a spreadsheet every time they unpack groceries. We wanted
the tracking itself to disappear — scan a receipt, snap a photo, or just tell an AI what you
bought, and let the app carry the rest: expiry alerts before things turn, and recipe ideas built
from what's actually in the house instead of a fantasy pantry.

## What it does

ThatFridge is a native iOS/Android app (Expo + React Native) that tracks what's in your fridge,
freezer, and pantry, and does something with that knowledge instead of just logging it:

- **Add items fast** — manual entry, barcode scan, or bulk-add from a photo of a receipt or the
  inside of your fridge (AI vision extracts the items for you).
- **An AI "crew" of four specialists** (Chef, Guardian, Shopkeeper, Organizer) you chat with
  directly — ask what to cook tonight from what's on hand, get warned about what's about to
  expire, manage the shopping list, or have the crew tidy up your inventory. 27 tools under the
  hood, so the crew can actually *act* — add items, check off the shopping list, save a recipe —
  not just talk about it.
- **Expiry & low-stock reminders**, scheduled locally on-device.
- **Shared fridges** for a household — everyone sees the same inventory, notes, and shopping
  list in real time.
- **Kitchen Score & streaks** — a lightweight, honest way to see whether you're actually using
  what you buy before it spoils.
- **Metered AI usage via credits** (RevenueCat-powered) — every AI action costs credits, free
  accounts get a monthly allowance, ThatFridge Pro unlocks a larger one plus multi-fridge and
  household sharing. No vague "unlimited," no surprise bills — the cost of every action is
  visible up front.

## How we built it

- **Mobile**: Expo Router + React Native, one codebase targeting iOS and Android (plus a web
  build via react-native-web).
- **Backend**: Laravel API on a DigitalOcean VPS (Singapore), Postgres + Redis, deployed via
  GitHub Actions CI/CD.
- **AI**: OpenRouter routes chat/vision requests to LLM providers; fal.ai handles food-icon
  image generation. The AI crew's tool-calling loop is bounded (max rounds/calls per turn) so a
  single chat message can't runaway-spend credits.
- **Monetization**: RevenueCat end-to-end — subscriptions (ThatFridge Pro, monthly/yearly) and
  three consumable AI-credit packs, with a server-authoritative credit ledger so the app never
  trusts the client for entitlement or balance.
- **Release pipeline**: EAS Build + GitHub Actions ship both TestFlight and Google Play from one
  tagged release.

## Challenges we ran into

- Metering AI cost per-action (not per-subscription-tier) without making the pricing feel
  punitive — landed on a credit system with a visible cost per action and a generous free
  allowance, rather than hard weekly caps.
- Getting a tool-calling AI agent to safely *act* on a user's real data (add/edit/delete items)
  without it going rogue on a single ambiguous instruction — solved with confirm-first
  semantics on anything destructive and a bounded tool-call budget per turn.
- Shipping to both app stores from a single release pipeline while each store's review process
  has genuinely different requirements (account deletion, IAP discoverability, data-safety
  disclosures) that needed independent verification, not just a shared checklist.

## Accomplishments we're proud of

- A genuinely useful AI agent integration — not a chatbot bolted on the side, but four
  purpose-built specialists with real tool access to the user's own kitchen data.
- A monetization model that's honest about cost: every AI action shows what it costs before you
  spend it, and the free tier is real, not a bait-and-switch trial.
- Full cross-platform release automation (iOS + Android) from one repo, one CI pipeline.

## What's next

- Korean-market launch (localized policy + UI).
- A richer "what to eat" recommendation engine using real expiry-urgency ranking.
- Android Play Store general availability (currently in closed testing).

---

## Peace Prize impact statement

**Category fit: household food waste as an environmental and economic problem, solved at the
point where it actually happens — the fridge.**

Food waste isn't a production-chain problem alone; a large share of it happens *after* the
grocery trip, at home, because nobody notices something is about to spoil until it already has.
That's an entirely preventable failure of visibility, not a failure of intent — people don't
want to throw food away, they just don't see it going bad in time to act.

ThatFridge attacks exactly that visibility gap:

- **Environmental impact**: food that never spoils never becomes landfill methane. Every item a
  household actually uses instead of discards is emissions and resources (water, land, transport
  fuel) that were never wasted in the first place.
- **Economic impact**: the average household throws away a meaningful share of its grocery
  spend every month without tracking it. Expiry visibility turns that into real, felt savings —
  not an abstract "sustainability" pitch, but money back in a household's pocket.
- **Designed for real households, not individuals performing sustainability** — the shared-fridge
  feature exists because food waste is usually a *household* coordination failure (nobody knows
  what's already in the fridge, so it gets bought twice, or nobody remembers it's there so it
  spoils unseen). Solving it for one person solves it poorly; ThatFridge solves it for the whole
  household at once.
- **Low-friction by design**: the entire product thesis is that sustainable behavior only sticks
  when it's easier than the wasteful default. Scan a receipt instead of typing a list; get warned
  instead of having to remember; ask an AI what to cook instead of guessing — every design choice
  removes a reason not to bother.

[Add any real numbers you have or can estimate: e.g. average household food waste $/year in your
target market (Malaysia), and a rough "if even 1% of users cut waste by X%, that's Y kg CO2e /
$Z saved" back-of-envelope — judges respond well to one concrete number more than to prose.]

---

## Still needed before submitting (not written here)

- [ ] Demo video (≤2:00, YouTube/Vimeo, no copyrighted music/footage) — see the shot list I can
  draft separately if useful.
- [ ] App Store URL (once both stores are live)
- [ ] Devpost project logo/screenshots — can reuse the App Store screenshot set
- [ ] Team member info / links (GitHub, etc.) if Devpost asks
