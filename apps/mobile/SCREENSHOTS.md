# ThatFridge — App Store screenshot plan (draft, 2026-09-06)

The marketing screenshot set for the App Store product page. Companion to `STORE_LISTING.md`
(copy) and `RELEASE.md` (build mechanics). Nothing here ships in the app — it's a build sheet
for the 10 PNGs uploaded to App Store Connect (per localization).

Grounded in the real screens: `src/app/(tabs)/home.tsx`, `chat.tsx`, `inventory.tsx`,
`eat.tsx`, `add.tsx`, `paywall.tsx`, and the theme in `apps/web/lib/thatfridge/theme.ts`.

---

## 1. Hard spec (verified against Apple's 2026 requirements — re-check before upload)

| Field | Value |
| --- | --- |
| Size | **1320 × 2868 px**, portrait, 6.9" slot only — Apple auto-scales it down to every smaller iPhone size (matches TO_DO.md) |
| Format | PNG or JPEG, **RGB, no alpha channel**, flattened |
| Count | 3-10 per localization. **Plan: 10 frames — the full slot.** First 2-3 are what shows in search results; frame 1 is a brand Intro, so frame 2 (Home) does the heavy lifting there |
| Device source | iPhone 16 Pro Max simulator renders at exactly 1320×2868 @ 6.9" — no scaling math |
| Localizations | `en-US` (default), `ko` (**required** — Korean downloads depend on it), `ms` (nice-to-have). Same layouts, translated captions + re-seeded Korean UI is *not* needed (v1 UI is English-only — locked decision), so `ko`/`ms` screenshots reuse the English app screens with translated **caption bands only** |

> Device frames: Apple *allows* them, but TO_DO.md commits to a frameless treatment. Plan
> below is frameless — the screen sits in a rounded card, caption band above. If that changes,
> the only delta is wrapping each screen bitmap in an iPhone 16 bezel PNG.

---

## 2. Frame design system

One template, 10 fills. All frames share it so the set reads as a series in the gallery strip.
Frame 1 (Intro) is the one exception — no screen bitmap, a centered brand lockup instead (§3).

```
┌───────────────────────────┐  1320 × 2868
│   caption band  ~34%       │  bg: #0a0a0c (canvas) with a faint
│                            │  radial glow in #26c6da at ~10% opacity
│   ▸ EYEBROW (pixel, 11px    │  behind the headline only
│     equiv, #26c6da, caps)  │
│   Headline — 2 lines max,   │  headline: system, 800 weight, ~64px,
│   #eaeaec, tight leading    │  #eaeaec  (NOT PixelMix — unreadable at
│   Subhead — 1 line, ~26px,  │  headline size; PixelMix only for the
│   #eaeaec @ 58% (muted)     │  tiny eyebrow + the wordmark)
│                            │
├───────────────────────────┤
│                            │
│   screen bitmap, ~62%       │  device screen, corner radius 44px,
│   full-width minus 96px      │  1px hairline rgba(255,255,255,0.09),
│   side margin, bleeds off     │  soft shadow. Bleeds off the bottom
│   the bottom edge            │  edge on frames 2-4 (energy), fully
│                            │  contained on 5-10.
└───────────────────────────┘
```

- **Palette**: see §2a — every value is lifted from the shipped app, not invented for the store.
- **Wordmark**: the Intro frame carries the full lockup (Logo + `ThatFridge` in PixelMix,
  centered). Everywhere else, a small muted `ThatFridge` sits in the bottom-left corner of the
  caption band — present but quiet, so the whole strip reads as one brand.
- **Eyebrow** uses PixelMix (this is the one place small pixel text is legible and on-brand).
  On the four Crew frames the eyebrow is the crew member's name, tinted their accent color.
- No stock photos, no emoji in the caption band. The screens already carry the fridge photos.

---

## 2a. Color theme (pulled from the actual app)

Single source of truth: `apps/mobile/tailwind.config.js` ⇄ `apps/web/lib/thatfridge/theme.ts`
("dark neon pixel tech"). Frequency counts below are `grep` hits across `apps/mobile/src` — they
show what the app actually leans on.

### Core — structure & text

| Token | Hex / value | In the app | Use in the frames |
| --- | --- | --- | --- |
| `canvas` | `#0a0a0c` | every screen background, splash screen (72 hits — the dominant color) | caption-band background, and the page behind the screen card |
| `surface` | `#131316` | cards, sheets, the floating tab bar | card fills if a frame needs a callout chip |
| `surface2` | `#1a1a1f` | insets, raised pills, avatar bubbles | — |
| `ink` | `#eaeaec` | primary text (50 hits) | **headline** |
| `muted` | `rgba(234,234,236,0.58)` | secondary text | **subhead** |
| `faint` | `rgba(234,234,236,0.34)` | tertiary text, dismissed states | corner **wordmark**, footnotes |
| `hairline` | `rgba(255,255,255,0.09)` | every card/border edge (33 hits) | 1px border on the screen card |
| `hairline-strong` | `rgba(255,255,255,0.18)` | dashed "add" borders, pagination dots | — |
| spinner grey | `#8a8a90` | `RefreshControl` tint only | ignore |

### Brand accent

| Token | Hex / value | In the app | Use in the frames |
| --- | --- | --- | --- |
| `accent` | `#26c6da` (turquoise) | primary CTAs, active tab, Kitchen Score puck, corner brackets, brand moments (37 hits) | **eyebrow** on non-crew frames; the glow; Intro lockup underline/dot |
| accent glow | `#26c6da` @ 0.10–0.12 alpha | already used behind Kitchen Score streak / selected rows (`rgba(38,198,218,0.1)`) | the radial glow behind every headline |
| Android icon bg | `#1aa9bd` | adaptive-icon background only (`app.config.ts`) | do not use in frames — it's a deeper teal, off-system |

> The accent is turquoise, **not** amber. `theme.ts` keeps `amber: "#26c6da"` as a legacy key
> name — the value is the turquoise. Don't let the key name mislead the design.

### Status / freshness (also used as semantic fills on cards)

| Token | Hex | Meaning in the app |
| --- | --- | --- |
| `good` | `#39e07f` | fresh item, healthy score, positive delta |
| `warn` | `#f5a623` | expiring-soon band, mid score |
| `bad` | `#ff5567` | expired item, low score, destructive action, unread dot |

These carry real meaning on the **Inventory** and **Kitchen Score** frames — don't recolor those
screens; let the green/amber/red read as-is.

### Crew (agent identity — use as the eyebrow tint on frames 7–10)

| Crew member | Hex | Notes |
| --- | --- | --- |
| Chef | `#f5a623` | same value as `warn` — amber, its own identity color |
| Guardian | `#ff5f56` | coral-red, distinct from `bad` `#ff5567` by a hair (keep both exact) |
| Organizer | `#3d6fe0` | deep blue — distinct from generic `blue` `#5b8dee` and from the turquoise accent |
| Shopkeeper | `#39e07f` | same value as `good` — green |
| `blue` (generic) | `#5b8dee` | info/links, Home "Items" stat — not a crew color |

### Secondary accents (present but minor — mostly avoid in frames)

| Hex | Where | Frames |
| --- | --- | --- |
| `#a78bfa` | the Pro star badge only (`home.tsx` `PRO_PURPLE`) | only if a frame is explicitly about Pro |
| `#7a5cc9` | AI autofill / icon-generation accent (`add.tsx`, `icon-picker.tsx`) | fine on the Add frame if that flow is shown |
| `#b5702f` | Pantry / grains food-tag color | leave on-screen, don't pull into captions |
| `#7a5cb0` | snack / "other" food-tag color | same |

### Geometry & type (for the frame template)

- Corner radii: `sm 6` · `md 8` · `lg 10` · `xl 14`. Screen card in the frame uses the device's
  own ~44px radius; caption chips use `xl` (14).
- Pixel font: **PixelMix** — eyebrow + wordmark only (it's unreadable at paragraph or headline
  size, by design — see `components/brand.tsx`).
- Headline: system font, weight 800.

### One-line summary for a designer

> Near-black `#0a0a0c` ground · off-white `#eaeaec` text · turquoise `#26c6da` accent + faint
> glow · green/amber/red `#39e07f` / `#f5a623` / `#ff5567` for status · four crew tints
> `#f5a623` / `#ff5f56` / `#3d6fe0` / `#39e07f` · PixelMix for the eyebrow and wordmark, system-800
> for headlines.

---

## 3. Shot list

Order is the upload order. Captions echo `STORE_LISTING.md` §2 so the page is consistent.
This is the full 10-slot set — no room left for the optional frames without a swap (see below).

| # | Screen | Seeded state to capture | Eyebrow | Headline | Subhead |
| --- | --- | --- | --- | --- | --- |
| 1 | **Intro** (no screen — brand key art) | Centered Logo + `ThatFridge` PixelMix lockup; the fridge-hero photo sits behind at ~8% opacity; turquoise glow | AI FRIDGE & GROCERY TRACKER | Open the app before you open the door | Track your fridge, freezer, and pantry — with an AI crew that keeps it that way |
| 2 | **Home** (`(tabs)/home.tsx`) | Keira's Kitchen active, fridge hero photo, Overview stats reading real numbers (items / expiring / suggestions), crew scene visible | KNOW BEFORE YOU OPEN | Everything in your fridge, one glance | Items, expiry, and what to cook — the moment you open the app |
| 3 | **Add sheet** (`add.tsx`) | The 4-option add screen: Scan receipt / Scan barcode / Photo of fridge / Add manually | ADD IN SECONDS | Scan a receipt. Snap your fridge. Done. | AI reads what's inside so you don't type it in |
| 4 | **Inventory** (`(tabs)/inventory.tsx`) | List scrolled to show a mix of fresh / expiring-soon / expired items — **needs a near-expiry item added first** so the freshness bars show amber and red, not all green | NEVER LOSE TRACK | Every item, every expiry date | Freshness at a glance — reminders before food goes bad, not after |
| 5 | **Chat** (`(tabs)/chat.tsx`) | A sent message "What can I cook tonight?" with Chef's reply listing 2-3 real recipes from seeded stock | ASK THE CREW | Ask your fridge anything | Plain-language answers from what's actually on your shelves right now |
| 6 | **Kitchen Score** (Home `KitchenScore` card / `badges.tsx`) | Score puck with a non-trivial streak and the weekly breakdown bars (waste / balance / organizer / shopkeeper) | BUILD THE HABIT | Turn less food waste into a streak | A weekly Kitchen Score for waste, balance, organizing, and shopping |
| 7 | **Crew · Chef** (`(tabs)/eat.tsx` → Recipes tab) | Recipes tab, Chef panel showing suggestions ranked with the closest-to-expiry first, Chef score meter. Accent `#f5a623` | CHEF | Four AI crew members working your kitchen | Chef suggests meals from what you already have — closest to expiry first |
| 8 | **Crew · Guardian** (`eat.tsx` → Guardian tab) | `GuardianPanel` with food-safety flags on risky / uncertain seeded items. Accent `#ff5f56` | GUARDIAN | Guardian flags what's about to turn | Food-safety checks on risky or uncertain items, before they go bad |
| 9 | **Crew · Organizer** (`eat.tsx` → Organizer tab) | `OrganizerPanel` with storage zones and a completed "misplaced items" sweep result. Accent `#3d6fe0` | ORGANIZER | Organizer keeps every shelf sorted | Tells you where each item goes — and sweeps for anything out of place |
| 10 | **Crew · Shopkeeper** (`eat.tsx` → Shopping tab) | Shopping list with a few items and the "don't rebuy" hints visible. Accent `#39e07f` | SHOPKEEPER | Shopkeeper runs your grocery list | Builds your next list — and tells you what not to rebuy |

### Optional frames (only by swapping one out — the set is already at Apple's max of 10)

| Swap in | Screen | State | Eyebrow | Headline | Subhead |
| --- | --- | --- | --- | --- | --- |
| for #9 or #10 | **Shared fridge** (`fridges.tsx` / home hero with the shared badge) | A second fridge with the "people" shared badge, or the members list | SHARE A SHELF | One fridge, everyone in sync | Roommates and family see the same live inventory |
| as a new #10 (drop Shopkeeper) | **Paywall** (`paywall.tsx`) | The benefits list + "7-day free trial, then …" pricing row | THATFRIDGE PRO | Start with a 7-day free trial | Unlimited AI chat, receipt & photo add, and shared fridges |

> The paywall frame is only worth it if you want pricing visible on the page (some reviewers
> like it; it is not required). It must be **last** — leading with a paywall depresses
> tap-through. Easiest cut for either swap is the Shopkeeper frame, since Chat + Kitchen Score
> already imply the grocery-list value.

---

## 4. Pre-capture setup

1. **Demo data**: log in as `keira@thatfridge.test` (the *new* password — see TO_DO.md). It's
   pre-seeded with a fridge + 7 recipes across all zones, no alcohol references. Before shooting:
   - Add 1-2 items with a near-term expiry so **frame 4 (Inventory)** shows amber/red freshness bars.
   - Send the **frame 5 (Chat)** "What can I cook tonight?" message once so it's in history, then screenshot the reply.
   - If the Kitchen Score streak is 0, run a few "mark made" / shopping actions to get **frame 6** off zero.
   - On the Crew tab (`eat.tsx`), open each of the four sub-tabs once so its panel is populated — Organizer needs the "misplaced items" sweep to have run (frame 9), Guardian needs at least one flagged item (frame 8).
   - Add a couple of items to the shopping list for **frame 10 (Shopkeeper)**.
2. **Clean status bar** (simulator): `xcrun simctl status_bar <UDID> override --time "9:41" --batteryState charged --batteryLevel 100 --cellularMode notSupported --wifiBars 3`
3. **Build**: a Release-config build against prod `EXPO_PUBLIC_API_URL` (never a dev bundle —
   no Metro banner, no debug overlay, no localhost). `eas build -p ios --profile preview` or a
   local Release build in the simulator.
4. **Hide** anything that shouldn't ship in marketing: the Pro star badge unless the frame is
   about Pro; any notification with a real person's name.
5. Device: iPhone 16 Pro Max simulator (1320×2868 native). `Cmd+S` saves a pixel-exact PNG.

---

## 5. Assembly

**Input needed first:** the 9 raw app-screen PNGs (1320×2868) — Claude can't capture these;
they come from a real-device / simulator run on the demo account, states per §3–§4.

Two ways to composite the caption band onto them, both driven by Claude:

- **Option A — `design` skill canvas.** Claude drafts the 10 frames as artboards on one
  pan/zoom canvas, published as an Artifact with a visual editor (click-to-select, inline text,
  PNG/PDF export). Best when you want to hand-tune spacing/shadows before export. Claude loads
  `artifact-design` first for the visual system, optionally `refero` for reference from
  comparable Food & Drink apps.
- **Option B — HTML template + headless render.** One HTML file, 10 sections at exactly
  1320×2868, dark theme + captions baked in, screens as `<img>`. Claude renders each to a
  pixel-exact PNG with local headless Chrome + ImageMagick. Best when you just want the files,
  and fastest to re-run for `ko`/`ms` (swap the caption strings, re-render). Lives in
  `scripts/` or the scratchpad, not shipped.

Frame 1 (Intro) uses the same layout with the screen slot swapped for the brand lockup.
Either way the raw PNGs are the input; nothing here touches the app.

### Run order
1. Friend captures the 9 raw screens from the new native build (§4 prep).
2. Send them to Claude → Claude builds Option A or B and returns export-ready 1320×2868 PNGs.
3. Upload the English set to App Store Connect; re-render for `ko` post-approval (§6).

## 6. Localization workflow

1. Finalize English captions (this doc) → lock.
2. `ko` captions: draft below, **needs a native Korean check** before upload (marketing copy,
   so MT-with-review is fine — unlike the privacy policy).
3. `ms` captions: same.
4. Re-export the 10 frames per locale from the same template. Screens stay English.

### Korean caption draft (needs native review)

| # | Frame | Headline (ko) | Subhead (ko) |
| --- | --- | --- | --- |
| 1 | Intro | 문을 열기 전에, 앱을 먼저 | 냉장고·냉동실·팬트리를 관리하는 AI 크루 |
| 2 | Home | 냉장고 속을 한눈에 | 재고, 유통기한, 오늘의 요리까지 — 앱을 여는 순간 |
| 3 | Add | 몇 초면 추가 완료 | 영수증을 찍거나 냉장고를 촬영하면 AI가 읽어냅니다 |
| 4 | Inventory | 모든 품목, 모든 유통기한 | 신선도를 한눈에 — 상하기 전에 알림, 상한 뒤가 아니라 |
| 5 | Chat | 냉장고에 무엇이든 물어보세요 | 지금 있는 재료로 답하는 AI 크루 |
| 6 | Kitchen Score | 음식물 쓰레기 줄이기를 습관으로 | 낭비·균형·정리·장보기 주간 키친 스코어 |
| 7 | Chef | 주방을 돌보는 4명의 AI 크루 | 셰프는 가진 재료로 요리를 제안 — 유통기한이 임박한 것부터 |
| 8 | Guardian | 가디언이 상하기 직전을 알려줍니다 | 위험하거나 애매한 품목의 식품 안전 점검 |
| 9 | Organizer | 오거나이저가 모든 칸을 정리합니다 | 각 품목의 보관 위치를 알려주고, 잘못 놓인 것을 찾아냅니다 |
| 10 | Shopkeeper | 쇼핑키퍼가 장보기 목록을 관리합니다 | 다음 목록을 만들고, 다시 살 필요 없는 것을 알려줍니다 |

---

## 7. Add to TO_DO.md

The existing screenshot checkbox becomes:

- [ ] Capture 9 raw screen PNGs (1320×2868) from a Release build on the demo account — Intro has none; states per `SCREENSHOTS.md` §3, prep per §4
- [ ] Build the §5 template (10 artboards, incl. the Intro brand lockup); export `en-US` set
- [ ] Native-review the `ko` captions (§6), export `ko` set
- [ ] Upload both sets to App Store Connect; `ms` set if time allows
