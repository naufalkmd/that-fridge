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
