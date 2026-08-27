# ThatFridge × RevenueCat Shipaton 2026

How the hackathon rules map to ThatFridge, what we still have to add, and which prizes to aim at.
This is the companion to [`APP_STORE_LAUNCH_PLAN.md`](APP_STORE_LAUNCH_PLAN.md) — the launch plan
owns the build; this doc owns the hackathon-specific requirements and deadline.

Source: <https://revenuecat-shipaton-2026.devpost.com/> and its Rules page — read those for the
authoritative text; this is our working interpretation.

_Last updated: 2026-08-27._
Legend: ✅ done · 🟡 partial · ⬜ not started · 🔒 blocked on external setup

---

## 1. TL;DR

- **We qualify.** ThatFridge has never been publicly released on any app store. The rule: the
  first public release must happen during the submission window (**Aug 1 – Sep 30, 2026**). A
  project that already existed in development is fine.
- **Hard deadline: Sep 30, 2026, 11:45 pm PDT.** The app must be **fully published and live**
  (Apple review passed), not just submitted. Review can take days — submit early.
- **Mandatory:** the **RevenueCat SDK** powering **≥1 in-app purchase** (or RevenueCat Ads).
  ThatFridge has no monetization yet — this is the main net-new scope.
- **iOS is eligible**, so the iOS-first plan stands. Android / Samsung optional.
- **Realistic prize targets:** Peace Prize, Design Award, #BuildInPublic — **not** the
  revenue-based Grand Prize (an app ~2 weeks live can't show real growth numbers).

**Where we are:** the app's core loop is code-complete (see the launch plan §1). The
RevenueCat integration, the paywall, and every account/store step below are **not started** and
are the critical path.

---

## 2. Eligibility check

| Rule | ThatFridge |
|---|---|
| First public store release during Aug 1 – Sep 30, 2026 | ✅ never released. Keep it that way — no public TestFlight link or store listing before we're ready (private TestFlight is fine) |
| Brand-new app, not an update to a released one | ✅ new |
| Age of majority; not in a sanctioned country; not RevenueCat/sponsor staff | 🟡 confirm per team member |
| Original work, solely owned by the team | ✅ |
| No prior financial support from RevenueCat / sponsors | ✅ |
| Team size | no cap; one person / org submits on Devpost. Our 4 is fine |

**Watch-out:** the web app at `apps/web` is not a store release, so it doesn't disqualify us —
but don't market ThatFridge as "launched" anywhere before the store listing is live.

---

## 3. Hard requirements → status

| Requirement | Status | Owner |
|---|---|---|
| RevenueCat SDK integrated, powering ≥1 IAP | 🟡 code done (`pro.tsx`); needs dashboard + a dev build | B |
| Paywall screen in the app | ✅ `paywall.tsx` — hosted paywall + custom fallback | B |
| ≥1 real IAP product in App Store Connect | 🔒 | A |
| Paid Apps Agreement + banking + tax active (blocks IAP testing) | 🔒 | A |
| App fully published & live by Sep 30 | ⬜ (launch plan) | A |
| Free trial **or** judge promo code for premium features | ⬜ | A |
| Devpost writeup + ≤2-min demo video (YouTube/Vimeo, no copyrighted material) | ⬜ | D |
| App icon 1024×1024 | ⬜ (needed for the store anyway) | C/D |
| ≥1 screenshot 1179×2556, no device frame | ⬜ | D |
| In-app account deletion (Apple 5.1.1(v), also good hygiene) | ✅ backend + UI done | — |
| Public growth effort (Grand Prize only) | out of scope | — |

---

## 4. Monetization design — "ThatFridge Pro"

The minimum is one IAP. We ship **two auto-renewing subscriptions** — `monthly` and `yearly` —
both with a **7-day free trial** (the trial doubles as judge access, so no promo codes).

**Free tier:** 1 fridge, manual + barcode add, expiry notifications, shopping list,
**5 AI chat messages / week**.

**Pro** (`thatfridge_pro` entitlement):

- Unlimited AI chat / "what to eat"
- Receipt & photo scanning for bulk add *(not yet in the app)*
- Multiple / shared fridges beyond the first *(not yet gated)*
- Advanced notification tuning *(not yet gated)*

**Implemented so far:** the AI-chat weekly cap is the live gate (`src/lib/chatQuota.ts` — a
client-side ISO-week counter in SecureStore; move server-side post-launch). Hitting the cap
routes to `/paywall`.

**RevenueCat wiring (done — `src/lib/pro.tsx`, `src/app/paywall.tsx`):**

| Piece | Value |
|---|---|
| SDK | `react-native-purchases` + `react-native-purchases-ui` v10 (autolinked; needs a dev build) |
| API key | `EXPO_PUBLIC_RC_IOS_KEY` in `apps/mobile/.env` (publishable; test-store key for now) |
| Entitlement | `thatfridge_pro` |
| Products / packages | `monthly`, `yearly` in the current offering |
| Paywall | `RevenueCatUI.presentPaywall()` (hosted) with a **custom fallback** in `paywall.tsx` for before the dashboard paywall is configured |
| Customer Center | `RevenueCatUI.presentCustomerCenter()` from Profile → "Manage subscription" |
| Identity | `Purchases.logIn(user.id)` so entitlements follow the account |
| Restore | Profile + paywall (Apple requires it) |

**Still needed in the RevenueCat dashboard + App Store Connect** (Member A):

1. App Store Connect: `thatfridge_pro_monthly` + `thatfridge_pro_yearly` subscription products
   (one group), 7-day intro offer, Paid Apps Agreement active.
2. RevenueCat: entitlement `thatfridge_pro`; offering `default` with packages `monthly` +
   `yearly` mapped to those products; a Paywall design on that offering; the App Store shared
   secret + App Store Connect API key.
3. Swap the test-store key for the real `appl_…` App Store key in `.env` / EAS env.

---

## 5. Prize targets

| Category | Prize | Why us | Effort |
|---|---|---|---|
| **Peace Prize** (social impact) | $15–20k | Household food-waste reduction *is* the product thesis — expiry tracking, use-it-up, "know before you open the door" | low — already the pitch |
| **#BuildInPublic** | $30k | We have a detailed plan, a live progress log, clean git history. Post updates 2–3×/week. Judged on the journey, not revenue | low–medium — discipline, not code |
| **Design Award** | $15–20k | "Dark neon pixel tech" system, pixel font, the AI-crew concept | medium — the native port must look as good as the web app |
| Grand Prize | $100k | Needs sustained install / MRR / growth numbers — not realistic ~2 weeks live | don't chase; work overlaps |
| OneSignal (retention / push) | $25k | Our notifications could route through OneSignal instead of local-only | medium — only if push goes server-driven |
| Catvertising (RevenueCat Ads) | $15–20k | Off-thesis for a paid utility app | skip |

**Commit to: Peace Prize + #BuildInPublic + Design.** Consider OneSignal only if push goes
server-driven anyway.

---

## 6. Submission checklist

- [ ] App **live** on the App Store (v1.0.0, approved)
- [ ] RevenueCat SDK powering `thatfridge_pro_monthly` — verified with a sandbox purchase
- [ ] 7-day free trial active (doubles as judge access), or a promo code generated
- [ ] Devpost project page: feature description
- [ ] Demo video ≤ 2:00, public on YouTube/Vimeo, no copyrighted music/footage
- [ ] App Store URL on the submission
- [ ] Icon 1024×1024
- [ ] ≥1 screenshot 1179×2556, no device frame
- [ ] #BuildInPublic: link to the public thread / dev log
- [ ] Peace Prize: short impact statement (food waste → household savings + environmental)
- [ ] Submitted on Devpost before **Sep 30, 2026, 11:45 pm PDT**

---

## 7. Hackathon-specific risks

1. **App Store Connect financials lead time** — Paid Apps Agreement + banking + tax take days
   and need real tax info. Until active, IAPs can't be tested and the core requirement can't be
   met. Start it the same day as Developer Program enrollment.
2. **Subscription review scrutiny (Guideline 3.1.2)** — restore button, clear pricing, terms,
   no dark patterns. Build the paywall to spec from the start.
3. **"First public release" timing** — no public TestFlight link, ProductHunt, or press before
   the store listing is live, or risk the "not brand-new" disqualification.
4. **The deadline is a wall** — Sep 30, no extensions. A rejection on Sep 28 could end the run.
   Submit ~2 weeks early.
5. **Scope tension** — the paywall is mandatory, so something in the launch plan's OUT list
   stays out. Don't trade paywall time for a nice-to-have screen.

---

## 8. Do now

1. Confirm each team member's eligibility (age of majority, country, not sponsor staff).
2. **Member A:** start Apple Developer enrollment **and** the App Store Connect Paid Apps
   Agreement / banking / tax the same day.
3. **Member A:** create the RevenueCat account + project (free).
4. Lock the Pro gate — recommended: cap free-tier AI chat + lock receipt/photo scan.
5. **Member B:** once EAS + the Apple account exist, add `react-native-purchases` and wire
   `usePro()` + the paywall.
6. **Member D:** create the Devpost draft (editable until the deadline) and start the
   #BuildInPublic thread — the monorepo scaffold, the plan, and the progress log are good first
   posts.
