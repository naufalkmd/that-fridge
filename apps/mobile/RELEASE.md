# Shipping the mobile app

## Versioning

Builds are labelled `<version> (<buildNumber>)`, e.g. `1.1.0 (3)`.

- **`<version>`** — the marketing version, from `app.config.ts` `version`. The **only** number
  you edit by hand.
- **`(<buildNumber>)`** — auto-incremented by EAS on every production build
  (`cli.appVersionSource: "remote"` + `build.production.autoIncrement` in `eas.json`). Never
  appears in a diff. The `ios.buildNumber` in `app.config.ts` is an ignored placeholder — leave
  it alone.

**Rule: bump `version` (minor or patch) whenever the binary has a native change** — a
new/updated native module, an icon / permission / config-plugin change, an Expo SDK bump.
Because `runtimeVersion.policy` is `appVersion`, the bump also scopes OTA updates: a merge to
`main` ships an OTA only to installs on the *same* `version`, so bumping keeps older installs on
their last-good bundle instead of feeding them JS that calls native code they don't have.

Pure JS / asset changes keep the current `version` and ship over the air (see below) — no bump.

Example: bump `1.0.0` → `1.1.0`, tag `v1.1.0`; EAS builds `1.1.0 (3)`. A rebuild at the same
version (e.g. a failed submit) would be `1.1.0 (4)`.

## TestFlight (automated)

`.github/workflows/testflight.yml` builds a production iOS binary on EAS and pushes it to
TestFlight. Trigger it by **pushing a tag** (`git tag v1.1.0 && git push --tags`) or from the
**Actions tab → TestFlight (iOS) → Run workflow**.

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

## Push notifications (APNs)

The activity/invite feed (`src/lib/push.ts` → backend `SendPushNotification` → Expo) needs:

1. **A new native build** — the `aps-environment` entitlement is added by the `expo-notifications`
   config plugin, so any build made before push was wired up can't register a token. The in-app
   feed still works over OTA; only the push delivery needs the rebuild.
2. **An APNs key on EAS** — Apple Developer → **Certificates, Identifiers & Profiles → Keys** →
   create a key with **Apple Push Notifications service (APNs)** enabled, download the `.p8`, then:
   ```
   cd apps/mobile
   eas credentials      # → iOS → production → Push Notifications: Manage everything → set up
   ```
   EAS uploads it to Expo's push service; nothing about it ships in the app or CI.

Verify end to end with `eas push` or by triggering an invite from a second account.

## Sign in with Apple / Google

Both need config the app doesn't ship with. The buttons hide themselves until it's present
(Apple: on any real iOS build; Google: when `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set), and
they need a native rebuild because they add native modules.

### Apple

1. Apple Developer → **Identifiers** → the App ID `test.thatfridge.app` → tick **Sign In with
   Apple** → Save. (EAS regenerates the provisioning profile with the entitlement on the next
   build; the `expo-apple-authentication` plugin adds the entitlement to the app.)
2. Nothing else for the native flow — the identity token's `aud` is the bundle id, which is
   already `APPLE_CLIENT_IDS`'s default on the backend.

### Google

1. Google Cloud Console → **APIs & Services → Credentials**. Configure the OAuth consent
   screen first if you haven't.
2. **Create credentials → OAuth client ID → iOS** — bundle id `test.thatfridge.app`. Note the
   **iOS client ID** and its **reversed** form (`com.googleusercontent.apps.…`).
3. **Create credentials → OAuth client ID → Web application** — note the **Web client ID**.
   This is what `@react-native-google-signin` and the backend both verify against.
4. Set these:
   | value | where |
   |---|---|
   | reversed iOS client ID | `GOOGLE_IOS_URL_SCHEME` — `apps/mobile/.env` for dev, EAS build env var for CI (`eas env:create`) |
   | Web client ID | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — same two places |
   | `<iOS client ID>,<Web client ID>` | backend `GOOGLE_CLIENT_IDS` (server `.env`) |

Then bump `version`, cut a new build, and test both buttons on a device.
