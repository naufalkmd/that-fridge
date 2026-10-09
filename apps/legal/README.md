# apps/legal — thatfridge.com public site

Static pages for the marketing/legal domain `thatfridge.com`:

| Path | File |
| --- | --- |
| `/` | `index.html` + `home.css` — the landing page (`assets/` holds its images) |
| `/privacy/` | `privacy/index.html` — App Store **Privacy Policy URL** |
| `/privacy/pdpa/` | `privacy/pdpa/index.html` — bilingual (BM + EN) Section 7 PDPA notice for Malaysia |
| `/terms/` | `terms/index.html` — Terms of Service + EULA (Guideline 3.1.2 + Apple LAEULA additions) |
| `/support/` | `support/index.html` — App Store **Support URL** |
| `/ms/` | `ms/index.html` — the landing page in Bahasa Melayu (hand-kept copy of `index.html`) |
| `/guides/` | `guides/**` + `guides.css` — food storage guides, **generated** by `scripts/gen-guides.py` |
| `/press/` | `press/index.html` + `press/press.css` — press kit (`assets/press/` holds the downloads) |
| — | `sitemap.xml` + `robots.txt` — also written by `scripts/gen-guides.py` |

Every page shares one theme: `site.css` (tokens, nav, scene header, side index + panel, footer)
and `site.js` (smooth scroll, hide-on-scroll nav, side index, reveals). On top of that,
`home.css` + an inline script drive the landing page, and `doc.css` styles the legal/support
pages. Their side index is built from the page's `h2`s (or the `h3` questions on `/support/`), so
editing legal text needs no layout changes. Moving between pages uses a View Transition (`transitions.js` + the
"Page transitions" block in `site.css`): the pixel scene, title card and nav are shared elements
that morph from page to page, and the body crossfades with a slight drift in nav order
Home → Privacy → Terms → Support. Browsers without cross-document View Transitions (Firefox)
just navigate normally. The App Store link (`id6806239306`) appears several times in
`index.html` — search for the id to change them all. App screenshots in `assets/shots/` are
built from the 1320×2868 App Store PNGs as AVIF + WebP at 480/720/1080px wide (`<picture>` +
`srcset`, so each device downloads one size). Crew sprites are lossless animated WebP.

### Landing growth pieces (keep these true)

- **Campaign tags.** Every App Store link has `?ct=<placement>` (hero, nav, sticky, qr, calculator,
  pricing-free, pricing-pro, cta, footer, guide-<slug>, press, ms-*). App Store Connect only
  attributes them once `&pt=<provider token>` is added too: App Store Connect → Apps → App Analytics →
  Campaigns shows your token. Add it to each link (search `ct=`) and to `scripts/gen-guides.py`.
- **QR code** (`assets/app-qr.svg`) encodes `…id6806239306?ct=qr`. It only shows on desktop with a
  mouse (hero card + final CTA). Regenerate it if the App Store URL ever changes.
- **Sticky "Get the app" bar** shows on phones between the hero and the final CTA.
- **"And there's more inside"** grid in `#inside`: one line per app feature. Keep it in step with the app.
- **Waste calculator** (`#cost`) runs entirely in the page. Household kg = UNEP's 79 kg × people;
  money = the visitor's own items × price × 52. The Pro comparison only shows in US$.
- **FAQ** (`#faq`): the FAQPage JSON-LD in `<head>` must match the visible answers word for word.
  Edit both together, and keep answers in line with `/support/`, `/privacy/` and `#pricing`.
- **Android waitlist** (`#android`) posts JSON to `https://api.thatfridge.com/api/waitlist`
  (contract in `backend/API.md`). It needs the backend deployed + migrated, and CORS allows only
  thatfridge.com / www. The privacy policy's "Android waitlist" section promises one email and
  deleting the list after it goes out — honour that when Android ships.
- **Guides** are generated: edit `scripts/gen-guides.py`, run `python3 scripts/gen-guides.py`.
  Every storage time cites FoodSafety.gov / USDA FoodKeeper / FSIS; don't add a value you can't source.
- **Bahasa Melayu page** (`/ms/`) is a manual copy. When the English landing changes, change it too.

The `#demo` section embeds the YouTube demo (id `RVUh1htzhM0`, in the section markup + the
VideoObject JSON-LD in `<head>`). The poster in `assets/demo/` is self-hosted (AVIF + WebP at
720/1280, from the video's YouTube thumbnail) and the play button is a plain YouTube link, so
the page makes no third-party requests until someone presses play; only then does the inline
script load the `youtube-nocookie.com` player. To swap the video: change the id, the `1:58`
label, the JSON-LD `duration`/`uploadDate`, and re-export the poster.

Smooth scrolling uses Lenis **1.3.26**, vendored at `assets/vendor/lenis-1.3.26.min.js` (MIT,
licence alongside) so the page never depends on a CDN. Fonts still come from Google Fonts.

**Before launch:** the "From the team" quotes in `index.html` are DRAFT copy attributed to Keira,
Joey and Naufal. Each must approve their own quote, and they stay labelled as team quotes. Don't
convert them into customer reviews; replace them with real App Store reviews when you have some.

**Pricing section** (`#pricing` in `index.html`) mirrors the in-app paywall: Free 50 credits/month,
Pro 400 + rollover + multiple/shared fridges, US$2.99/month or US$19.99/year, 7-day free trial.
Update it whenever App Store Connect prices or the paywall change.

Folder-per-page layout so clean URLs (`/privacy/`) work on **any** static host with no redirect
config. The shared CSS/JS are served from the root.

## Placeholders — filled 2026-08-28

- Operator / privacy contact: **Muhammad Naufal Kamaruddin** (individual)
- Governing law: **Malaysia**
- Subprocessors: DigitalOcean (Singapore) + Cloudflare (DNS/site)

Verify the operator's name spelling matches the Apple Developer account exactly before submitting;
it's a one-line edit in `privacy/index.html` + `terms/index.html` if it differs.

## Still needed before it goes live

Set up two addresses (real mailboxes or forwarding aliases):
- **support@thatfridge.com** — on every page, the App Store support contact
- **privacy@thatfridge.com** — the PIPA/PDPA privacy contact

## Malaysia (PDPA) — done

- `/privacy/pdpa/` is the bilingual Section 7 notice.
- The app collects cross-border-transfer consent on **every** sign-up path (email checkbox;
  a notice + affirmative action before Apple / Google) — recorded server-side as
  `users.data_transfer_consented_at`.
- Breach-notification process: `docs/INCIDENT_RESPONSE.md`.

## Korea (PIPA) — still needed before a KR launch

- **Korean translation** at `/privacy/ko/index.html` (the English policy links to it).
- PIPA wants the cross-border consent as a *separate, explicit, unticked checkbox* on **every**
  path including Apple/Google login — stronger than the notice-plus-affirmative-action that
  satisfies MY/UK/CH. Gate it on KR locale. Tracked in `docs/TO_DO.md` → Korea rollout.

## Deploy

Automated: **`.github/workflows/deploy-legal.yml`** ships this folder to Cloudflare Workers on
every merge to `main` that touches `apps/legal/**`. No build step — the files are served as-is.
Target + custom domains are declared in **`wrangler.jsonc`**.

**One-time setup:**

1. In Cloudflare, create an API token with **Edit Cloudflare Workers** on the account that owns
   the `thatfridge.com` zone. Add it + the account id as repo secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID` (Settings → Secrets and variables → Actions).
2. **Disconnect any Cloudflare Git integration** for this repo (dashboard → the project →
   Settings → Builds → disconnect) so it stops auto-building every branch/PR. The workflow is
   now the only thing that deploys.
3. First run creates the Worker and attaches `thatfridge.com` + `www` (from `wrangler.jsonc`
   `routes`). If the domains aren't ready, comment out `routes` and add them from the dashboard
   later.

Deploy by hand from this folder: `npx wrangler deploy`.

## DNS summary for `thatfridge.com`

| Record | Name | Target |
| --- | --- | --- |
| — | `@` and `www` | the Worker route is attached automatically by `wrangler deploy` |
| A | `api` | the VPS running the Laravel API (`api.thatfridge.com`) |

## Keep in sync

- The app links to `https://thatfridge.com/terms` and `/privacy` from `apps/mobile/src/app/paywall.tsx`.
- Bump the "Last updated" date in a page whenever its content materially changes.
