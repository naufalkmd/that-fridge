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
Unlock unlimited AI chat, receipt & photo bulk-add, and multiple shared fridges. Every plan
starts with a 7-day free trial.

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

App Store Connect → your app → **App Rating**. Apple's system was substantially reworked in
2026 — bands are now **4+, 9+, 13+, 16+, 18+, Unrated** (not the old 4+/9+/12+/17+), and as of
**September 2026** a new mandatory **Social Media** content descriptor was added, checking
whether the app has "the ability to redistribute, amplify, or interact with user-generated
content through a social feed or similar discovery method." **I can't verify the exact live
wording/flow of this questionnaire myself (too recent, changing) — sanity-check my answers
below against what ASC actually shows you before submitting.**

Reasoning, grounded in what the app actually does (checked against the codebase, not guessed):

| Question | Answer | Why |
| --- | --- | --- |
| Violence (cartoon/fantasy or realistic) | None | Nothing in the app depicts violence |
| Sexual content or nudity | None | — |
| Profanity or crude humor | None | AI crew responses are food-focused, no profanity |
| Alcohol, tobacco, or drug use/references | None | Checked all 7 seeded recipes (`DatabaseSeeder.php`) — none reference alcohol, tobacco, or drugs |
| Mature or suggestive themes | None | — |
| Horror or fear themes | None | — |
| Medical/treatment information | None | Guardian's food-safety flags are about freshness, not medical advice |
| Gambling or contests | None | — |
| Unrestricted web access | No | No in-app browser, no unrestricted web access anywhere |
| User-generated content | **Yes** | Fridge names, sticky notes, recipe notes — but only visible to people already approved into that specific shared fridge, never public |
| **Social Media** (new, 2026) | **No** | No public feed, no content discovery/redistribution/amplification mechanism — sharing is scoped to a closed group of approved fridge members you invited yourself, the opposite of the "social feed" this descriptor targets |
| Messaging/communication with other users | No | The only "chat" is with the AI crew; there's no direct messaging between two real users (fridge notes are shared-space, not DMs) |

**Expected result: 4+.** Nothing here should push it higher — this is a clean household
utility app with closed-group, approval-gated sharing, not an open social product.

---

## 5. App Review information

**Before submitting:** the reviewer account already exists — `keira@thatfridge.test` /
`password123` (TO_DO.md §2), pre-seeded with a fridge + 7 curated recipes. **⚠ Change this
password before submitting** (it's been sitting in a committed TO_DO.md, effectively public) —
update it directly on prod, then use the new one below.

### Demo account
- Email: `keira@thatfridge.test`
- Password: *(set a new one before submitting — don't reuse `password123`)*

### Notes for the reviewer (draft — paste into App Store Connect → App Review Information → Notes)

```
Demo account: keira@thatfridge.test / [password set at submission]

This account has a pre-seeded fridge ("Keira's Kitchen") with sample items across every storage
zone (fridge/freezer/pantry) and 7 curated recipes already in the recipe book, so every core
screen has real content on first login - no empty states to work around.

What to test:
- Home: shows the AI "crew" (Chef, Guardian, Organizer, Shopkeeper) with tips based on the
  seeded inventory, and a Kitchen Score.
- Inventory: tap any item to see freshness/expiry; try adding one manually (barcode/receipt/
  photo scanning require a Pro subscription - see below).
- Chat: ask any crew member a question, e.g. "what should I cook tonight?" (free tier: 5
  messages/week).
- Recipes: the 7 seeded recipes are visible in the recipe book from first login.

To test Pro features (unlimited AI chat, receipt/photo scanning, multiple/shared fridges): the
app offers a 7-day free trial with no promo code needed - starting the trial from the paywall
(Profile tab -> Upgrade) unlocks every Pro feature immediately in the App Store sandbox review
environment.

No account creation is required to review the app - the demo account above covers every core
flow. If you'd like to test sign-up instead, Sign in with Apple and Google are both available
on the sign-in screen.
```
