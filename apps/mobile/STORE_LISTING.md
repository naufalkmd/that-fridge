# ThatFridge — App Store submission copy (draft, 2026-09-05)

Everything here is a **draft to paste into App Store Connect**, not something that ships in the
repo. Grounded in what the code actually does — see the "why" notes under each answer. Review
before submitting; nothing here is final until you've checked it against the real screens.

---

## 1. App Privacy ("nutrition label")

App Store Connect → your app → **App Privacy** → Get Started. Answer per data type below.
Everything is scoped to what the app + its three third-party services (OpenRouter for AI,
RevenueCat for subscriptions, Expo for push) actually touch — checked against
`backend/app/Models/User.php`, `app.config.ts` permission strings, and `package.json` deps
(no ad SDK, no analytics SDK, no Contacts/Location access exists in the app at all).

**"Do you or your third-party partners collect data from this app?"** → **Yes**

| Data type | Collected? | Linked to identity? | Used for tracking? | Notes |
|---|---|---|---|---|
| **Contact Info — Name** | Yes | Yes | No | `name`, `username` at signup |
| **Contact Info — Email Address** | Yes | Yes | No | Required for login/account |
| **Contact Info — Phone Number** | No | — | — | Never collected |
| **Contact Info — Physical Address** | No | — | — | Never collected |
| **User Content — Photos or Videos** | Yes | Yes | No | Receipt/fridge-photo scanning (`ReceiptController`, `PhotoController`) — sent to OpenRouter for OCR/analysis |
| **User Content — Other User Content** | Yes | Yes | No | Chat messages, recipe notes, fridge sticky notes |
| **User Content — Audio Data** | No | — | — | Voice dictation (`expo-speech-recognition`) — `voice.ts`'s `start()` now sets `requiresOnDeviceRecognition: true` (fixed 2026-09-05), so audio never leaves the device. Only the resulting transcript is sent, already covered under Other User Content |
| **Identifiers — User ID** | Yes | Yes | No | Backend user id + RevenueCat app-user id |
| **Identifiers — Device ID** | Yes | Yes | No | Expo push token (`push_tokens` table) tied to the account |
| **Purchases — Purchase History** | Yes | Yes | No | RevenueCat subscription/entitlement status |
| **Usage Data — Product Interaction** | Yes | Yes | No | Kitchen-score / streak / organizer-tally history stored per-user for app functionality (not analytics) |
| **Diagnostics — Crash Data** | Once Sentry DSN is set | Not currently | No | `sentry/sentry-laravel` is scaffolded but dormant (§2 of TO_DO.md) — answer **No** until a DSN is live, then revisit |
| Health & Fitness | No | — | — | Never collected |
| Financial Info | No | — | — | Apple/Google handle payment directly; ThatFridge never sees card data |
| Location | No | — | — | No location permission exists in the app |
| Sensitive Info | No | — | — | Never collected |
| Contacts | No | — | — | No Contacts permission exists — `find-friend` is search-by-username, not a device contacts import |
| Browsing/Search History | No | — | — | Not tracked |
| Other Data | No | — | — | — |

**"Is data used to track you?"** → **No** — no ad network, no data broker, no cross-app/cross-site
tracking SDK anywhere in `package.json`.

---

## 2. Store listing copy

### App Name
`ThatFridge` — unchanged, matches the bundle branding already live at thatfridge.com.

### Subtitle (30 char max)
`AI Fridge & Grocery Tracker`

### Promotional Text (170 char max, editable without a review — use for the trial/launch hook)
`Free 7-day trial. See what's in your fridge before you open the door — and never let good food go to waste again.`

### Description (4000 char max)

```
Know what's inside before you even open the door.

ThatFridge tracks what's in your fridge, freezer, and pantry — and puts four AI crew members
to work keeping it that way.

MEET THE CREW
🧑‍🍳 Chef — suggests meals from what you already have, prioritizing what's closest to expiry
🛡️ Guardian — watches food safety and flags risky or uncertain items before they go bad
📦 Organizer — tells you where to store each item and keeps every zone tidy
🛒 Shopkeeper — builds your next grocery list and tells you what not to rebuy

WHAT YOU CAN DO
• Add items in seconds — scan a barcode, snap a receipt, or photograph your fridge and let AI
  read what's inside
• Get expiry reminders before food goes bad, not after
• Ask the crew anything about your fridge in plain language — "what can I cook tonight?"
• Share a fridge with roommates or family — everyone sees the same live inventory
• Track your Kitchen Score and build streaks for reducing food waste
• Build a recipe book from what you cook, with photos and notes

THATFRIDGE PRO
Unlock unlimited AI chat, receipt & photo bulk-add, multiple shared fridges, and advanced
notification tuning. Every plan starts with a 7-day free trial.

• ThatFridge Pro Monthly — auto-renews monthly after the free trial
• ThatFridge Pro Yearly — auto-renews yearly after the free trial, save vs. monthly

Payment is charged to your Apple ID account at confirmation of purchase. Subscriptions
auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or
cancel anytime in your Apple ID account settings. See our Terms and Privacy Policy at
thatfridge.com.

Less guessing. Less waste. Just open the app before you open the door.
```

*(Word the Pro section to match whatever's actually live in App Store Connect once the
subscriptions are submitted — the product names/prices above are placeholders matching
TO_DO.md §3, not yet confirmed live in a real submission.)*

### Keywords (100 char max, comma-separated, no spaces needed after commas)
```
fridge,grocery,food tracker,expiry,meal planner,recipes,shopping list,pantry,leftovers,waste
```
(~94 chars — trim if App Store Connect counts differently than expected)

### Support URL
`https://thatfridge.com/support`

### Marketing URL (optional)
`https://thatfridge.com`

### Copyright
`© 2026 Muhammad Naufal Kamaruddin`

---

## Still needed (not something I can draft — needs real assets/device)

- App icon, 1024×1024, no transparency, no rounded corners (Apple adds the mask)
- iPhone 6.9" + 6.5" screenshots, 1179×2556, no device frame — capture from a real device/sim
  running the actual app, ideally the paywall + a couple of core screens (Home, Chat, Inventory)
- Age rating questionnaire (App Store Connect walks through this — answer based on actual
  content; ThatFridge has no UGC beyond fridge names/notes between people you've already
  approved into a shared fridge, no chat between strangers)
- App Review demo account + notes — the reviewer account already exists
  (`keira@thatfridge.test`, TO_DO.md §2) — **change its password before submitting**, then write
  a short "What to test" note pointing review at a pre-seeded fridge
