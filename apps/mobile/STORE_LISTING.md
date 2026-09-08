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

| Data type                                    | Collected?             | Linked to identity? | Used for tracking? | Notes                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------- | ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contact Info — Name**               | Yes                    | Yes                 | No                 | `name`, `username` at signup                                                                                                                                                                                                                                 |
| **Contact Info — Email Address**      | Yes                    | Yes                 | No                 | Required for login/account                                                                                                                                                                                                                                       |
| **Contact Info — Phone Number**       | No                     | —                  | —                 | Never collected                                                                                                                                                                                                                                                  |
| **Contact Info — Physical Address**   | No                     | —                  | —                 | Never collected                                                                                                                                                                                                                                                  |
| **User Content — Photos or Videos**   | Yes                    | Yes                 | No                 | Receipt/fridge-photo scanning (`ReceiptController`, `PhotoController`) — sent to OpenRouter for OCR/analysis                                                                                                                                                |
| **User Content — Other User Content** | Yes                    | Yes                 | No                 | Chat messages, recipe notes, fridge sticky notes                                                                                                                                                                                                                 |
| **User Content — Audio Data**         | No                     | —                  | —                 | Voice dictation (`expo-speech-recognition`) — `voice.ts`'s `start()` now sets `requiresOnDeviceRecognition: true` (fixed 2026-09-05), so audio never leaves the device. Only the resulting transcript is sent, already covered under Other User Content |
| **Identifiers — User ID**             | Yes                    | Yes                 | No                 | Backend user id + RevenueCat app-user id                                                                                                                                                                                                                         |
| **Identifiers — Device ID**           | Yes                    | Yes                 | No                 | Expo push token (`push_tokens` table) tied to the account                                                                                                                                                                                                      |
| **Purchases — Purchase History**      | Yes                    | Yes                 | No                 | RevenueCat subscription/entitlement status                                                                                                                                                                                                                       |
| **Usage Data — Product Interaction**  | Yes                    | Yes                 | No                 | Kitchen-score / streak / organizer-tally history stored per-user for app functionality (not analytics)                                                                                                                                                           |
| **Diagnostics — Crash Data**          | Once Sentry DSN is set | Not currently       | No                 | `sentry/sentry-laravel` is scaffolded but dormant (§2 of TO_DO.md) — answer **No** until a DSN is live, then revisit                                                                                                                                   |
| Health & Fitness                             | No                     | —                  | —                 | Never collected                                                                                                                                                                                                                                                  |
| Financial Info                               | No                     | —                  | —                 | Apple/Google handle payment directly; ThatFridge never sees card data                                                                                                                                                                                            |
| Location                                     | No                     | —                  | —                 | No location permission exists in the app                                                                                                                                                                                                                         |
| Sensitive Info                               | No                     | —                  | —                 | Never collected                                                                                                                                                                                                                                                  |
| Contacts                                     | No                     | —                  | —                 | No Contacts permission exists —`find-friend` is search-by-username, not a device contacts import                                                                                                                                                              |
| Browsing/Search History                      | No                     | —                  | —                 | Not tracked                                                                                                                                                                                                                                                      |
| Other Data                                   | No                     | —                  | —                 | —                                                                                                                                                                                                                                                               |

**"Is data used to track you?"** → **No** — no ad network, no data broker, no cross-app/cross-site
tracking SDK anywhere in `package.json`.

---

## 2. Store listing copy

### App Name

`ThatFridge` — unchanged, matches the bundle branding already live at thatfridge.com.

### Subtitle (30 char max)

`AI Fridge & Grocery Tracker`

### Promotional Text (170 char max, editable without a review — use for the trial/launch hook)

`Free 7-day trial. See what's in your fridge before you open the door, and never let good food go to waste again.`

*(ASCII only, straight apostrophe, no em dash — same reason as the description.)*

### Description (4000 char max)

**Plain ASCII only** — no emoji, no em dashes, no bullet glyphs, straight apostrophes. App
Store Connect rejected the earlier emoji/em-dash version with "invalid characters" (the cook
emoji `🧑‍🍳` is a zero-width-joiner sequence; ASC's description field also chokes on stray
U+200B pasted in from a drafting app). Paste this block as-is. If you re-add anything fancy,
paste through a plain-text editor first and re-verify.

```
Know what's inside before you even open the door.

ThatFridge tracks what's in your fridge, freezer, and pantry, and puts four AI crew members to work keeping it that way.

MEET THE CREW

Chef - suggests meals from what you already have, prioritizing what's closest to expiry.
Guardian - watches food safety and flags risky or uncertain items before they go bad.
Organizer - tells you where to store each item and keeps every zone tidy.
Shopkeeper - builds your next grocery list and tells you what not to rebuy.

WHAT YOU CAN DO

- Add items in seconds: scan a barcode, snap a receipt, or photograph your fridge and let AI read what's inside.
- Get expiry reminders before food goes bad, not after.
- Ask the crew anything about your fridge in plain language, like "what can I cook tonight?"
- Share a fridge with roommates or family so everyone sees the same live inventory.
- Track your Kitchen Score and build streaks for reducing food waste.
- Build a recipe book from what you cook, with photos and notes.

THATFRIDGE PRO

Unlock unlimited AI chat, receipt and photo bulk-add, and multiple shared fridges. Every plan starts with a 7-day free trial.

- ThatFridge Pro Monthly: auto-renews monthly after the free trial.
- ThatFridge Pro Yearly: auto-renews yearly after the free trial, save vs. monthly.

Payment is charged to your Apple ID account at confirmation of purchase. Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple ID account settings. See our Terms and Privacy Policy at thatfridge.com.

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

## 3. Guideline 4.2 rebuttal (draft, keep on hand — don't submit pre-emptively)

For App Review notes **only if** Apple flags the app as a "thin wrapper" under 4.2 Minimum
Functionality. Don't paste this in unprompted — most apps never see this guideline invoked;
submitting a defensive rebuttal nobody asked for just wastes a reviewer's time. Grounded in
`app.config.ts` / `package.json` — every capability named below is a real, shipped dependency,
not aspirational.

```
ThatFridge is a native iOS app built with Expo/React Native — there is no WebView, no wrapped
website, and no third-party app-building platform involved (Capacitor, Cordova, etc. were
deliberately never used). Every screen is native UI rendered through React Native's UIKit
bridge. The app makes substantive use of platform capabilities a website cannot provide:

- Native camera (expo-camera) for barcode scanning, with its own permission flow
- Native photo library access (expo-image-picker) for receipt scanning, fridge photos, and
  recipe photo/video attachments
- On-device speech recognition (Apple's Speech framework, forced on-device — no audio ever
  leaves the phone) for voice dictation in chat
- Local notifications, scheduled and delivered on-device for expiry/low-stock reminders
- Server-driven push notifications (APNs via Expo) for social activity — invites, fridge
  membership changes, shared notes
- Native haptic feedback (expo-haptics) throughout the interaction model — drag-and-drop
  reordering, destructive-action confirmation, move/assign gestures
- Native gesture-driven UI (react-native-gesture-handler + react-native-reanimated): drag items
  between categories, grab-to-dismiss bottom sheets, animated drag-and-drop
- Sign in with Apple and Google, both via native SDKs (expo-apple-authentication,
  @react-native-google-signin), not a web OAuth redirect
- Native in-app purchases via StoreKit (RevenueCat), with a native paywall UI
- Native network-state awareness (@react-native-community/netinfo) for offline handling
- expo-router's native navigation stack — native modal presentations, native tab bar, native
  back-gesture support throughout

Beyond the technical integration, the app provides functionality with no meaningful web
equivalent: AI-driven inventory management from photographed receipts and fridge contents,
personalized recipe/meal suggestions based on what's actually in the household's fridge right
now, multi-user shared-fridge collaboration with live sync, and a scoring/streak system that
tracks food-waste reduction over time. This is a full-featured household management tool, not a
marketing site or content wrapper.
```

---

## 4. Age rating questionnaire

App Store Connect → your app → **App Rating**. Apple's system was reworked in 2026 — bands are
now **4+, 9+, 13+, 16+, 18+, Unrated**, the questionnaire is split into "In-App Controls",
"Capabilities", and per-topic frequency (None / Infrequent / Frequent), and it re-computes many
former-4+ utilities upward. **Answers below were walked through against the live ASC
questionnaire on 2026-09-06 — the result was 9+ (see bottom).**

### In-App Controls

| Control           | Answer | Why                                                            |
| ----------------- | ------ | -------------------------------------------------------------- |
| Parental Controls | No     | No monitoring/restriction tools for guardians exist in the app |
| Age Assurance     | No     | No age-verification mechanism, no Declared Age Range API call  |

### Capabilities

| Capability                               | Answer        | Why                                                                                                                                                          |
| ---------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unrestricted Web Access                  | No            | No in-app browser, no WebView, no arbitrary URL navigation                                                                                                   |
| User-Generated Content                   | **Yes** | Fridge names, sticky notes, recipe notes, chat messages — only visible to people already approved into that specific shared fridge, never public            |
| Social Media                             | No            | No public feed, no discovery/redistribution/amplification — sharing is a closed, invite-only group, the opposite of "visibly spreads content to many users" |
| Social Media Disabled for Users Under 13 | No            | N/A — there is no social-media capability to disable                                                                                                        |
| Messaging and Chat                       | No            | The only "chat" is with the AI crew; no direct user-to-user messaging (shared fridge notes are a shared workspace, not DMs)                                  |
| Advertising                              | No            | No ad SDK anywhere in`package.json`; the subscription paywall is first-party IAP, not advertising                                                          |

### Content frequency

| Topic                                       | Answer        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violence (any)                              | None          | Nothing in the app depicts violence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sexual content or nudity                    | None          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Profanity or Crude Humor                    | None          | AI crew is a constrained food assistant; user notes are kitchen labels                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Horror/Fear Themes                          | None          | It's a fridge inventory app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Alcohol, Tobacco, or Drug Use or References | None          | All 11 recipes visible on the demo account vetted clean 2026-09-06 (the `DatabaseSeeder.php` curated set plus a few added on the account, incl. Chicken Rendang / Roti Canai — none reference alcohol, tobacco or drugs). Culinary ingredient mentions in a Food & Drink app aren't what this descriptor targets — matches every major recipe app. *(If a reviewer objects to an AI-suggested wine recipe, that's a conversation, not a rejection — don't pre-emptively take Infrequent, which would push to 13+.)* |
| Mature or Suggestive Themes                 | None          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Medical or Treatment Information            | None          | Guardian's flags are food spoilage/freshness, not health-condition or treatment guidance                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Health or Wellness Topics                   | **Yes** | Guardian gives food-safety recommendations; Chef recommends meals; Kitchen Score nudges a food-waste habit — lifestyle/self-care guidance. Benign descriptor, does not raise the band                                                                                                                                                                                                                                                                                                                                    |
| Simulated Gambling                          | None          | No betting/wagering mechanics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Contests                                    | None          | Kitchen Score / streaks / badges are personal and private — no leaderboard, no user-vs-user ranking (verified: no such code)                                                                                                                                                                                                                                                                                                                                                                                     |
| Gambling (real money)                       | No            | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Loot Boxes                                  | No            | Pro unlocks a fixed feature set; nothing randomized-for-purchase                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Calculated result: 9+** (walked through 2026-09-06). Under the reworked system, declaring
**User-Generated Content = Yes** floors a general-audience app around 9+ even when the UGC is
private and invite-only — this is expected, not a mistake in the answers, and many former-4+
utilities now land at 9+. **Do not lie the UGC answer down to chase 4+.**

- ASC only allows overriding *up*, never down — 9+ is the floor from these answers.
- **Do not** pick "Made for Kids" — that opts into the Kids Category's COPPA obligations
  (no third-party analytics, parental gates, restricted data collection); user accounts + AI
  chat + subscriptions would get it rejected from that category anyway.
- 9+ does not restrict downloads for the general audience and is not "mature" — leave it at the
  calculated 9+ and move on. If chasing 4+ is ever worth it, the only honest levers are the two
  `Yes` answers above (UGC, Health/Wellness); toggling them live in ASC shows which one holds
  the 9+ — but UGC is not negotiable, so 4+ is likely unreachable without removing shared notes.

---

## 5. App Review information

**Before submitting:** the reviewer account already exists — `keira@thatfridge.test`,
pre-seeded with a fridge + 7 curated recipes. The old `password123` was public (committed), so
it must be rotated. The demo password is now an env var, not a committed literal:

1. On the prod box, add to `/var/www/thatfridge-api/.env` (or wherever the app lives):
   `DEMO_USER_PASSWORD=<the new secret>`
2. Save that secret in the shared password manager.
3. Re-apply config + reseed the demo users (safe — `updateOrCreate` keyed on email, doesn't
   touch Keira's fridge/items):
   ```
   php artisan config:clear
   php artisan db:seed --force
   ```
4. Verify: `curl -sX POST https://api.thatfridge.com/api/login -H 'Content-Type: application/json' -d '{"email":"keira@thatfridge.test","password":"<new secret>"}'` returns a token.

### Demo account

- Email: `keira@thatfridge.test`
- Password: *(the `DEMO_USER_PASSWORD` value from the password manager — set before submitting)*

### Notes for the reviewer (draft — paste into App Store Connect → App Review Information → Notes)

> Before pasting: replace `[PASSWORD]` with the real `DEMO_USER_PASSWORD` (from the password
> manager) **in App Store Connect only** — do not commit it back into this file. The demo
> account's fridge, items and recipes were verified live on 2026-09-06 (fridge is currently
> named "Home Fridge"; rename it to something friendlier before submitting if you like — the
> notes below don't depend on the name).

```
ThatFridge is a household fridge, freezer and pantry inventory app with an AI "crew" (Chef,
Guardian, Organizer, Shopkeeper) that suggests meals from what you have, flags food about to
expire, and builds shopping lists. iOS only, English-language UI.

DEMO ACCOUNT (no sign-up required)
Email: keira@thatfridge.test
Password: [PASSWORD]

On first sign-in a short 3-slide intro carousel appears - tap "Skip" (top right) to go
straight to the app.

This account already has a shared fridge populated with items across the fridge, freezer and
pantry zones, plus recipes in the recipe book, so every core screen has real content on first
login.

WHAT TO TEST
- Home: AI crew tips based on the current inventory, and a Kitchen Score.
- Inventory: tap an item for its freshness / expiry detail. Add an item with the "Add" button -
  barcode scan and manual entry are free.
- Chat: ask a crew member something, e.g. "what should I cook tonight?" (free tier: 5 messages
  per week, shared across the whole crew).
- Recipes: sample recipes are visible in the recipe book from first login.

PRO FEATURES AND THE FREE TRIAL
Pro unlocks unlimited AI chat, receipt scanning, fridge-photo scanning, and multiple/shared
fridges. The app offers a 7-day free trial with no promo code needed - start it from
Profile tab -> Go Pro. In the App Store sandbox environment this grants all Pro features
immediately. (Receipt and fridge-photo scanning are Pro-only and will show an upgrade prompt
on the free tier; barcode scanning and manual add are always free; expiry-date photo scan and
AI icon generation are limited on the free tier and unlimited on Pro.)

SHARED CONTENT / USER-GENERATED CONTENT
Fridge names, sticky notes and recipe notes are visible only to members that a fridge owner has
explicitly invited and approved - there is no public feed, profile browsing or content
discovery. A user can block another user from that user's profile, which stops all contact in
both directions.

SIGN-UP (optional)
Not required for review. If you want to test account creation, Sign in with Apple and Sign in
with Google are both on the sign-in screen.
```
