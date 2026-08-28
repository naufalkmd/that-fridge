PixelMix by Andrew Tyler (font@andrewtyler.net).

## Status: commercial licence PURCHASED (2026-08-28)

Bought via Sellfy ($25 one-time). The governing licence is now `PixelMix-EULA.docx`
(AndrewTyler.net End User License Agreement) — it **supersedes** the old
`PixelMix-LICENSE.txt` (CC BY-NC-ND) that shipped with the free download.

Keep the purchase receipt / order email in the shared password manager — App Review and the
Devpost submission can both ask for proof of a commercial font licence.

## Two things the purchase does NOT automatically settle

1. **App + web embedding.** The EULA as written (see the "Embedding Restrictions" and "No
   Other Use" sections) prohibits embedding the font into "application programs" and into "web
   pages" without an additional licence. ThatFridge does both: the mobile app bundles
   `PixelMix.ttf` via `expo-font`, and `apps/web` serves it with `@font-face`. Before the
   commercial App Store release, get written confirmation from font@andrewtyler.net that the
   licence covers embedding in a distributed iOS app + website (or that the Sellfy product
   tier already grants it). Save that email next to the receipt.

2. **No official bold.** The purchase contains only a single regular `pixelmix.ttf`. The
   repo previously bundled a `PixelMix-Bold.ttf` with an empty name table (synthesized or
   third-party); the EULA forbids creating additional typeface weights, and it was used
   nowhere, so it was **removed on 2026-08-28** (file + the `useFonts` entry in
   `src/app/_layout.tsx` + the `expo-font` plugin list in `app.config.ts`). If a bold is ever
   needed, obtain an official one from font@andrewtyler.net — do not synthesize.
   (`apps/web` still ships its own `pixelmix_bold.ttf`; drop that when the web app is retired.)

## File provenance

The `.ttf` in the Sellfy download is actually the original FontStruct build (name table
reports "Creative Commons Attribution Share Alike"). The repo bundles a different build
(Andrew Tyler's CC BY-NC-ND version). Both render identically; what the $25 buys is the
commercial-use *right* (the EULA), not a different binary. Keeping the repo's existing
`PixelMix.ttf` is fine.
