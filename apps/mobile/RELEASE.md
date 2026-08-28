# Shipping the mobile app

## TestFlight (automated)

`.github/workflows/testflight.yml` builds a production iOS binary on EAS and pushes it to
TestFlight. Trigger it by **pushing a tag** (`git tag v1.0.0 && git push --tags`) or from the
**Actions tab → TestFlight (iOS) → Run workflow**.

Build numbers are managed by EAS (`cli.appVersionSource: "remote"` in `eas.json`) — no version
bumps land in the repo. The marketing version comes from `app.config.ts` `version`; bump that by
hand for a new App Store version.

### One-time setup

1. **App Store Connect app record** — create the app (bundle id `test.thatfridge.app`), then put
   its **Apple ID** (the numeric id under App Information → General) into `eas.json` →
   `submit.production.ios.ascAppId`.

2. **App Store Connect API key** — App Store Connect → **Users and Access → Integrations →
   App Store Connect API** → generate a key with the **App Manager** role. You get an Issuer ID,
   a Key ID, and a one-time `AuthKey_XXXX.p8` download.

3. **Give the key to EAS** (so CI never sees it):
   ```
   cd apps/mobile
   eas credentials        # → iOS → production → App Store Connect API Key → set up
   ```
   Paste the Issuer ID / Key ID / `.p8` path. EAS now uses it for both signing and submission.

4. **iOS signing** — run one build interactively so EAS creates the distribution cert + profile:
   ```
   eas build --platform ios --profile production
   ```
   After that, `--non-interactive` CI builds reuse them.

5. **GitHub secret** — `EXPO_TOKEN`: expo.dev → account **Settings → Access tokens** → create one
   → add it as a repo secret (Settings → Secrets and variables → Actions).

### After a build lands

- **Internal testers** (App Store Connect team, ≤100) get it automatically once Apple finishes
  processing (~15–30 min).
- **External testers** (≤10,000, email or public link) need a one-time **Beta App Review** per
  version (~1–2 days). Don't use a *public* TestFlight link before the store listing is live
  (Shipaton "brand-new app" rule — see `TO_DO.md` §1).

## OTA updates (no rebuild)

JS-only changes ship over the air:
```
cd apps/mobile
eas update --branch production --message "…"
```
Installed TestFlight / App Store builds pick it up on next launch. No binary, no review.
`runtimeVersion` is tied to `app.config.ts` `version`, so an OTA only reaches builds on the same
marketing version — bump `version` + ship a new binary for native changes.
