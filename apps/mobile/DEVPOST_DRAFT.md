# ThatFridge — Devpost submission draft (RevenueCat Shipaton 2026)

Draft only — review, edit, and paste into Devpost's submission form. Placeholders in
[brackets] need a real value from you before submitting. Updated 2026-09-29 against the live
app (v1.3.x + OTA) and the official rules.

---

## Tagline (Devpost "elevator pitch", ≤200 characters)

Know what's in your fridge before it goes bad. A crew of four AI helpers tracks your food, warns
you before it spoils, and cooks with what you already have.

---

## Inspiration

Most households lose food the same quiet way: it goes bad before anyone remembers it's there.
Nobody means to waste it. Tracking a fridge from memory just stops working after a dozen items,
and nobody wants to type a spreadsheet every time they unpack groceries.

We wanted the tracking to disappear. Scan a receipt, snap the inside of the fridge, or just tell
the app what you bought, and let it carry the rest: a nudge before something turns, and meal
ideas built from what's actually in the house.

## What it does

ThatFridge is a native iOS and Android app for tracking what's in your fridge, freezer and
pantry, and acting on it before food goes to waste.

- **Adding food is fast.** Barcode scan, a photo of a receipt, a photo of the inside of your
  fridge, or a photo of a printed expiry date. AI reads it and fills in the items. Typing one in
  by hand gets an autofill for shelf life and details.
- **A crew of four AI helpers** (Chef, Guardian, Shopkeeper, Organizer) you can chat with in
  Quick Chat. They don't just answer. With 30 tools they can add and move items, tick off the
  shopping list, plan meals on the calendar, and save recipes. Paste a recipe link (a blog,
  TikTok or YouTube) and it becomes a recipe card. Pin an item, a fridge or "what's expiring" to a
  message so the crew knows exactly what you mean. The crew also remembers what you tell it,
  like allergies or who's vegetarian.
- **Reminders before food spoils.** Expiry, low-stock and meal reminders on the device, plus
  push notifications when someone in your household changes something.
- **Shared household fridges.** Everyone sees the same inventory, notes and shopping list, so
  nothing gets bought twice or forgotten at the back.
- **Kitchen Lab automations.** Describe a routine in plain words ("every Sunday, add anything
  running low to the shopping list"). The AI writes it once as a set of steps, you preview a dry
  run, and from then on it runs on a schedule, when an item is added, or when food is about to
  expire, without calling the AI again.
- **One calendar** for everything with a date: expiry dates, the meal plan, what you cooked, and
  automation runs.
- **Kitchen Score and Insights** show whether you're actually using what you buy.
- **Explore** has ready-made recipes, meal plans, automations and food icons to start from.

**Pricing (RevenueCat).** Every AI action costs a small, visible number of credits. Free
accounts get 50 credits a month and keep everything that doesn't need AI: tracking, reminders,
sharing a fridge someone else hosts. ThatFridge Pro ($2.99/month or $19.99/year, 7-day free
trial) gives 400 credits a month that roll over up to 800, more than one fridge, and hosting a
shared household fridge. Three one-off credit packs cover heavy months.

**For judges:** Pro has a 7-day free trial, so every premium feature can be tested from the
paywall at no charge. [If you'd rather hand out a promo code or a demo account, put it here.]

## How we built it

- **App:** Expo SDK 57 + React Native 0.86 with Expo Router, NativeWind and Reanimated 4. One
  codebase for iOS and Android. Saved data paints first on launch, so the app opens complete
  and works offline.
- **API:** Laravel (PHP 8.5) and Postgres on a DigitalOcean server in Singapore, close to our
  launch market. GitHub Actions runs the tests and deploys on every merge.
- **AI:** OpenRouter for chat and vision (Claude Haiku 4.5 powers the crew); fal.ai for
  pixel-art food icons. A crew reply is capped at 5 tool rounds and 10 tool calls, and anything
  that deletes data asks you first.
- **RevenueCat:**
  - The SDK runs both subscriptions and the three consumable credit packs.
  - The paywall is a RevenueCat Paywall, so its copy and layout change without an app release.
  - RevenueCat webhooks feed a server-side credit ledger. The server, not the app, decides
    your balance and whether you're Pro, and each grant is recorded once even if a webhook
    repeats.
  - Starting a trial grants no extra credits. The Pro credits arrive with the first paid
    renewal, so the trial can't be farmed for AI credits.
- **Shipping:** EAS Build for store builds (a version tag builds for TestFlight), EAS Update
  for over-the-air fixes between reviews, and a Filament admin panel to watch usage, AI cost
  and feedback.

## Challenges we ran into

- **Letting AI act on real data safely.** A helper that can delete your groceries must not do
  it on one vague sentence. Deletes ask first, and every reply has a hard budget of tool calls.
- **Pricing AI fairly.** Weekly caps felt arbitrary and "unlimited" wasn't honest. We moved to
  credits: every action shows its cost up front, failed scans are refunded, and the free tier
  stays useful without them.
- **Automations without an AI bill.** Running a model on every schedule tick would be slow and
  expensive. Kitchen Lab uses the AI once to write the automation, then checks it and runs it as
  plain rules.
- **Two stores, two rulebooks.** Account deletion, subscription disclosures, reporting user
  content and data-safety forms each had to be checked against Apple and Google separately.

## Accomplishments that we're proud of

- An AI crew with real tools on your own kitchen data, not a chatbot bolted on the side.
- A free tier that's genuinely useful, and pricing that shows the cost of every AI action.
- Shipping weekly after launch: [number] app versions and [number] over-the-air updates since
  the first public release.

## What we learned

The best way to change a habit is to make the good option the easy one. Every time we removed a
step (typing items, remembering dates, deciding what to cook), people used the app more.
[Swap in a real example from your analytics if you have one.]

## What's next

- Android fully live on Google Play (in closed testing now).
- Malay and Korean, then a Korean launch.
- Sharing recipes and automations with other households through Explore.

---

## Early and effective release (Grand Prize criterion)

> The rules ask: "when you first put a live, usable version in front of real users, why you
> shipped at that moment".

ThatFridge went live on the App Store on [date v1.3.0 went live — check App Store Connect]. We
shipped as soon as the core loop worked end to end — add food, get warned before it spoils, use
it up — together with the paywall and credit metering, so from day one the app could both help
people and pay for its own AI.

After launch we shipped small and often, over the air, between store reviews:

- **Faster, offline-safe start.** Saved data shows first; being offline no longer signs you out.
- **Quick Chat context.** Pin items, a day or "what's expiring" to a message; attach a photo or
  a PDF; the crew shows what it's doing while it works.
- **In-app calendar and meal plan**, plus "Ask Chef" to fill a week of meals.
- **Explore libraries** of recipes, meal plans, automations and icons.
- **Custom fields** ("Protein 25 g") that the crew and automations can read, sum and fill.
- **A simpler Settings and one Insights page**, merged from overlapping screens after a review.

[For each change you can back with data, add the result in one line, e.g. "after the faster
start, X% more people opened the app a second day". The admin panel's Insights has retention and
feature usage.]

## Growth by numbers

- **118 new users and 119 active users in the last 28 days** (RevenueCat, 2026-09-29).
- [Items tracked / items marked used vs thrown out — admin → Insights]
- [Retention: day-1 / day-7 — admin → Insights]
- [AI actions used — admin → AI cost report]
- [Revenue / subscribers / trials — RevenueCat, at submission time]

---

## Peace Prize impact statement

**The problem.** Households throw away more food than restaurants and shops combined. In 2022
the world wasted 1.05 billion tonnes of food, and 60% of it (631 million tonnes) was wasted at
home: about 79 kg per person every year, or more than a billion meals a day. Food loss and waste
produces 8–10% of global greenhouse gas emissions (UNEP Food Waste Index Report 2024). In
Malaysia, our launch market, SWCorp estimates 6,000 tonnes of **still-edible** food is thrown
away every day, up from 5,000 tonnes a year earlier (New Straits Times, June 2026).

**Why it happens.** Most of it isn't carelessness. It's visibility. Food gets pushed to the back,
bought twice because nobody checked, or forgotten until it's too late. That's a coordination
problem inside a household, and it's fixable.

**What ThatFridge does about it.**

- **It shows what's about to go bad**, before it does, and tells you in time to use it.
- **It turns "what's expiring" into a meal.** The crew suggests recipes from what you have,
  starting with what needs using first.
- **It works for the whole household.** A shared fridge means everyone sees the same food and
  the same shopping list, so there are fewer duplicates and fewer forgotten leftovers.
- **It keeps the good habit easy.** Scanning a receipt takes seconds, so tracking doesn't need
  willpower.

**Impact per household.** Using the global average of 79 kg per person a year, a household of
four wastes around 316 kg of food a year. Cutting that by a quarter saves about 79 kg of food a
year, and the money spent on it, for one household.

**Feasibility and reach.**

- It runs on phones people already own. No sensors, no smart fridge.
- The free tier covers the parts that cut waste (tracking, expiry reminders, shared fridges),
  so money isn't the barrier.
- AI costs are capped per user by credits, and the fixed running cost is about $50 a month.
  The free tier can stay free as the app grows.
- It's live on the App Store today and in closed testing on Google Play. Malay and Korean
  versions are next.

[Add the app's own numbers if you have them: items marked used instead of thrown out, from
admin → Insights. One real number is worth more to judges than a paragraph.]

Sources: UNEP Food Waste Index Report 2024; UNEP press release "World squanders over 1 billion
meals a day" (27 March 2024); New Straits Times, "Malaysians throw away 6,000 tonnes of edible
food daily" (15 June 2026, citing SWCorp).

---

## Submission checklist (from the official rules)

- [x] Demo video under 2:00, public on YouTube or Vimeo, showing the app running on a device
- [x] App Store URL: https://apps.apple.com/app/thatfridge/id6806239306
- [x] 1024×1024 app icon: `apps/mobile/assets/images/icon.png`
- [ ] At least one 1179×2556 screenshot **without a device frame** (a plain screenshot from an
  iPhone 15 / 15 Pro / 16 or the matching simulator is exactly this size)
- [ ] Free trial or promo code for judges (Pro's 7-day trial covers it; say so in the description)
- [ ] Fill the [bracketed] placeholders above
- [ ] **Submit before Sep 30, 11:45pm PT (Oct 1, 3:45pm KST).** Submit early; edit after.
