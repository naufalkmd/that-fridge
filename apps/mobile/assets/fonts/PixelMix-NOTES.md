PixelMix by Andrew Tyler (font@andrewtyler.net).

## Status: commercial licence PURCHASED (2026-08-28)

Bought via Sellfy ($25 one-time). The governing licence is now `PixelMix-EULA.docx`
(AndrewTyler.net End User License Agreement) — it **supersedes** the old
`PixelMix-LICENSE.txt` (CC BY-NC-ND) that shipped with the free download.

Keep the purchase receipt / order email in the shared password manager — App Review and the
Devpost submission can both ask for proof of a commercial font licence.

## App, web and public-repo use: CONFIRMED by the author

The EULA as written (see the "Embedding Restrictions" and "No Other Use" sections) prohibits
embedding the font into "application programs" and "web pages" without an additional licence,
so Andrew Tyler was asked by email (quoting the Sellfy order) whether the purchase covers:

- bundling `PixelMix.ttf` inside the paid iOS/Android app (`expo-font`),
- serving it from `apps/web` with `@font-face`,
- keeping the unmodified `.ttf` in the public, MIT-licensed GitHub repo for the Devpost
  hackathon.

His reply: "yes your license covers those use cases. Credit in the app and repo would be
appreciated!" (recorded here 2026-10-13). Keep that email thread next to the purchase receipt.

Credit lives in: the mobile About screen (`src/app/about.tsx`), the web About screen
(`apps/web/components/thatfridge/screens/AboutScreen.tsx`), the root `README.md` licence
section and the Terms of Service. Keep those in place.

## No official bold

The purchase contains only a single regular `pixelmix.ttf`. The
repo previously bundled a `PixelMix-Bold.ttf` with an empty name table (synthesized or
third-party); the EULA forbids creating additional typeface weights, and it was used
nowhere, so it was **removed on 2026-08-28** (file + the `useFonts` entry in
`src/app/_layout.tsx` + the `expo-font` plugin list in `app.config.ts`). If a bold is ever
needed, obtain an official one from font@andrewtyler.net — do not synthesize.
`apps/web`'s own `pixelmix_bold.ttf` and the dead `pixel-bold` Tailwind family were removed
on 2026-09-30.

## File provenance

The `.ttf` in the Sellfy download is actually the original FontStruct build (name table
reports "Creative Commons Attribution Share Alike"). The repo bundles a different build
(Andrew Tyler's CC BY-NC-ND version). Both render identically; what the $25 buys is the
commercial-use *right* (the EULA), not a different binary. Keeping the repo's existing
`PixelMix.ttf` is fine.
