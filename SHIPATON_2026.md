# ThatFridge × RevenueCat Shipaton 2026

How the hackathon rules map to ThatFridge, what we have to add, and which prizes to aim at.

Source: <https://revenuecat-shipaton-2026.devpost.com/> and its Rules page. Read those for the
authoritative text — this doc is our working interpretation, dated **2026-08-27**.

---

## TL;DR

- **We qualify** — ThatFridge has never been publicly released on any app store. The rule is
  "first public release must happen during the submission window (Aug 1 – Sep 30, 2026)."
  A project that already existed in development is fine.
- **Hard deadline: Sep 30, 2026, 11:45pm PDT.** The app must be **fully published and live**
  (Apple review passed) by then — not just submitted. Apple review can take days.
- **Mandatory:** integrate the **RevenueCat SDK** to power **at least one in-app purchase**
  (or serve ads via RevenueCat Ads). ThatFridge currently has zero monetization — this is new
  scope on top of `APP_STORE_LAUNCH_PLAN.md`.
- **iOS is an eligible platform**, so our iOS-first plan stands. Android/Samsung optional.
- Our realistic targets: **Peace Prize**, **Design Award**, **#BuildInPublic** ($30k) — not the
  revenue-based Grand Prize (an app that's ~1–2 weeks live can't show real growth numbers).

---

## 1. Eligibility check

| Rule | ThatFridge |
|---|---|
| First public store release during Aug 1 – Sep 30, 2026 | ✅ Never released. Must **not** push to TestFlight *public* link or store before we're ready — private TestFlight is fine. |
| Brand-new app, not an update to a released app | ✅ New. |
| Age of majority; not in a sanctioned country; not RevenueCat/sponsor staff | ✅ (confirm per team member) |
| Original work, solely owned by the team | ✅ Our repo, our code. |
| No prior financial support from RevenueCat/sponsors | ✅ |
| Team size | No cap. Multiple people allowed; one person/org submits on Devpost. Our 4 is fine. |

**One watch-out:** the web app at `apps/web` is *not* a store release, so it doesn't disqualify
us. Keep it that way — don't market ThatFridge as "launched" anywhere before the store goes live.

---

## 2. Hard requirements → our gap

| Requirement | Status | Owner |
|---|---|---|
| RevenueCat SDK integrated, powering ≥1 IAP | ❌ not started | Mobile |
| A paywall screen in the app | ❌ | Mobile + UI |
| ≥1 real IAP product configured in App Store Connect | ❌ | Release |
| **Paid Apps Agreement + banking + tax** active in App Store Connect | ❌ — **has lead time, blocks IAP testing** | Release |
| App fully published & live on the App Store by Sep 30 | ❌ (covered by main plan) | Release |
| Free trial **or** judge promo code for premium features | ❌ | Release |
| Devpost writeup + <2-min demo video (YouTube/Vimeo, no copyrighted material) | ❌ | Release |
| 1024×1024 icon | ❌ (needed for store anyway) | UI |
| ≥1 screenshot at **1179×2556**, no device frame | ❌ | UI |
| Public demo/growth effort (for Grand Prize only) | out of scope | — |

---

## 3. Monetization design — "ThatFridge Pro"

Minimum to satisfy the rule is one IAP. Make it a **monthly auto-renewing subscription** with a
**7-day free trial** (also satisfies the "free trial for judges" requirement — no promo codes to
manage).

**Free tier:** 1 fridge, manual + barcode item add, expiry notifications, shopping list.

**Pro (`thatfridge_pro_monthly`, ~$3.99/mo, 7-day trial):**
- Unlimited AI chat / "what to eat" suggestions (free tier capped, e.g. 5/week)
- Receipt & photo scanning for bulk item add
- Multiple / shared fridges beyond the first
- Advanced notification tuning

Pick whichever subset is cheapest to gate — the gate just has to be real and visible, not the
feature list. **Gating a couple of existing AI endpoints behind an entitlement check is the
smallest lift.**

**RevenueCat setup:**
- `react-native-purchases` + `react-native-purchases-ui` (Expo config plugin; needs a dev build,
  which we already require — not Expo Go).
- One **entitlement**: `pro`. One **offering** with the monthly package.
- Paywall: use RevenueCat's `RevenueCatUI.presentPaywall()` prebuilt paywall for speed, themed
  to our palette. Custom paywall only if time allows.
- Gate: `Purchases.getCustomerInfo()` → `entitlements.active["pro"]`; wrap gated screens/actions.

---

## 4. Prize categories we target

| Category | Prize | Why us | Effort |
|---|---|---|---|
| **Peace Prize** (social impact) | $15–20k | Household food-waste reduction is the core product thesis — expiry tracking, use-it-up suggestions, "know before you open the door." Strong, honest narrative. | Low — it's already the pitch |
| **#BuildInPublic** | $30k (2nd-largest prize) | We already have a detailed plan, a progress log, and clean git history. Post regular updates (X/threads/dev log) through the sprint. Judged on journey documentation, not revenue. | Low–medium — discipline, not code |
| **Design Award** | $15–20k | "Dark neon pixel tech" visual system, pixel font, the AI-crew concept. Distinctive. | Medium — the native port has to actually look as good as the web app |
| Grand Prize | $100k | Needs install/MRR/growth numbers over a sustained period. Not realistic 1–2 weeks post-launch. | Don't chase — but the work overlaps |
| OneSignal (retention/push) | $25k | We're building expiry/low-stock notifications. If we route them through OneSignal instead of local-only, this opens up. | Medium — swaps our notification approach |
| Catvertising (RevenueCat Ads) | $15–20k | Would mean adding RevenueCat Ads. Off-thesis for a paid utility app. | Skip |

**Recommendation:** commit to **Peace Prize + #BuildInPublic + Design**. Consider **OneSignal**
only if push is going server-driven anyway.

---

## 5. Impact on the 3-week plan

New work to fold into `APP_STORE_LAUNCH_PLAN.md`:

### Added to MVP scope (§2 of the plan)
- Paywall screen + `pro` entitlement gating on the AI features
- RevenueCat SDK + config plugin in the dev build
- Settings: "Manage subscription" / restore purchases (Apple requires restore)

### Added to Member A (Release) track
- App Store Connect: **Paid Apps Agreement, banking, tax forms** — do this **the same day as
  Developer Program enrollment**. IAPs can't even be tested until it's active.
- Create `thatfridge_pro_monthly` subscription product + 7-day intro trial
- RevenueCat dashboard: project, iOS app, entitlement `pro`, offering, link the App Store
  shared secret + App Store Connect API key
- Devpost submission: writeup, 2-min demo video, screenshots, icon

### Added to Member B (Mobile)
- `npx expo install react-native-purchases react-native-purchases-ui` + config plugin
- `Purchases.configure()` on launch with the RevenueCat API key (`EXPO_PUBLIC_RC_IOS_KEY`)
- `usePro()` hook → `entitlements.active.pro`

### Revised timeline
- **Pull App Store submission earlier**: target **store-submit by ~Sep 15**, leaving ~2 weeks
  of review + resubmit buffer before Sep 30. The plan's "submit Day 12" already lands around
  there if we start now.
- Paywall + RevenueCat: Week 2 of the plan (alongside secondary screens).
- #BuildInPublic posts: start this week, cadence 2–3×/week.

---

## 6. Submission asset checklist

- [ ] App **live** on the App Store (v1.0.0, approved)
- [ ] RevenueCat SDK powering the `thatfridge_pro_monthly` purchase — verified with a sandbox buy
- [ ] 7-day free trial active (doubles as judge access) — or a promo code generated
- [ ] Devpost project page: text description of features
- [ ] Demo video: ≤ 2:00, on YouTube/Vimeo, public, no copyrighted music/footage
- [ ] App Store URL on the submission
- [ ] Icon 1024×1024
- [ ] ≥ 1 screenshot 1179×2556, **no device frame**
- [ ] #BuildInPublic: link to the public build thread / dev log
- [ ] Peace Prize: short impact statement (food waste → household savings + environmental)
- [ ] Submitted on Devpost before **Sep 30, 2026, 11:45pm PDT**

---

## 7. Risks specific to the hackathon

1. **App Store Connect financials lead time** — Paid Apps Agreement + banking + tax can take
   days and needs the account holder's real tax info. If it's not active, IAP testing is
   blocked and the RevenueCat requirement can't be met. **Start day one, same as enrollment.**
2. **Apple review + IAP review** — apps with subscriptions get extra scrutiny (restore button,
   clear pricing, terms, no dark patterns). Build the paywall to Apple's
   [Schedule 2 / 3.1.2](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
   rules from the start.
3. **"First public release" timing** — do not open a public TestFlight link, ProductHunt, or
   press before the store listing is live, or we risk the "not brand-new" disqualification.
4. **Deadline is a wall** — Sep 30, no extensions. A rejection on Sep 28 could end the run.
   Hence the pull-submission-earlier recommendation.
5. **Scope tension** — the paywall is now mandatory, so something in the §2 OUT list stays out.
   Don't trade paywall time for a nice-to-have screen.

---

## 8. Do this week

1. Confirm each team member's eligibility (age of majority, country, not sponsor staff).
2. **Member A:** start Apple Developer enrollment **and** the Paid Apps Agreement / banking / tax
   in App Store Connect on the same day.
3. **Member A:** create the RevenueCat account + project (free).
4. Decide the Pro gate (recommend: cap free-tier AI chat + lock receipt/photo scan).
5. **Member B:** add `react-native-purchases` to the dev build once EAS is set up.
6. Start the **#BuildInPublic** thread — the scaffold + plan + progress log are good first posts.
7. Pick the Devpost submitter and create the draft project page now (you can edit until the
   deadline).
