# apps/legal — thatfridge.com public site

Static pages for the marketing/legal domain `thatfridge.com`:

| Path | File |
| --- | --- |
| `/` | `index.html` |
| `/privacy/` | `privacy/index.html` — App Store **Privacy Policy URL** |
| `/terms/` | `terms/index.html` — Terms of Service + EULA (Guideline 3.1.2 + Apple LAEULA additions) |
| `/support/` | `support/index.html` — App Store **Support URL** |

Folder-per-page layout so clean URLs (`/privacy/`) work on **any** static host with no redirect
config. `style.css` is shared and served from the root.

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

## Korea (PIPA) — still needed

Target markets are Malaysia + Korea. Korean App Store review checks the privacy-policy link and
PIPA compliance:

- Add a **Korean translation** at `/privacy/ko/index.html` (fast-follow acceptable but do it
  soon — the English policy already links to it).
- The app's **sign-up screen** must collect explicit consent for data collection **and a
  separate consent for cross-border transfer** (chat/photos → OpenRouter + fal.ai in the US).
  That's an app change, tracked in `TO_DO.md` §4a — not something these pages can do alone.

## Deploy (pick one)

**Cloudflare Pages** (recommended — free, auto-HTTPS, same account as DNS):
1. Push this repo; in Cloudflare Pages, create a project from it.
2. Build command: _none_. Build output directory: `apps/legal`.
3. Add custom domains `thatfridge.com` and `www.thatfridge.com`.
4. DNS: Pages adds the `CNAME`/`A` for the apex automatically when the zone is on Cloudflare.

**Netlify:** drag-and-drop the `apps/legal` folder, or connect the repo with publish dir
`apps/legal`. Add the custom domain.

**GitHub Pages:** push `apps/legal`'s contents to a `gh-pages` branch or a `/docs` folder,
enable Pages, set the custom domain to `thatfridge.com` (add a `CNAME` file with `thatfridge.com`).

## DNS summary for `thatfridge.com`

| Record | Name | Target |
| --- | --- | --- |
| A / CNAME | `@` and `www` | the page host above |
| A | `api` | the VPS running the Laravel API (`api.thatfridge.com`) |

## Keep in sync

- The app links to `https://thatfridge.com/terms` and `/privacy` from `apps/mobile/src/app/paywall.tsx`.
- Bump the "Last updated" date in a page whenever its content materially changes.
