# Working on the mobile app

## The one rule: merge = live, tag = native release

| Your change | What to do | Testers get it |
|---|---|---|
| Screens, logic, copy, layout, a bundled image | Branch off `main` → PR → merge | **Automatically, ~1 min later** (OTA, `eas-update.yml`). They relaunch the app. |
| App icon / splash / permissions / a new native package / `app.config.ts` native config / `eas.json` | Merge the PR, then **bump `version` in `app.config.ts`** and `git tag v1.0.x && git push --tags` | A new TestFlight build (~30 min, `testflight.yml`) → an "Update" button in TestFlight |

If you're not sure which bucket you're in: touched only `.ts`/`.tsx` + images imported in JS → it's OTA. Touched native config or added a library with an iOS/Android folder → it's a tagged build.

Also tag a build **~weekly** even with no native changes, so the JS baked into the binary doesn't drift far from the OTA layer.

## Day to day

```
git checkout -b my-change            # off main
# ...work...
git push -u origin my-change         # opens a PR
```

- The pre-push hook runs the backend + web + mobile tests (`git config core.hooksPath .githooks` once per machine). Skip once with `--no-verify`.
- PR merged to `main` → `eas-update.yml` typechecks and publishes an OTA update to the `production` channel. Nothing else to do.

## Branches / channels

- **`main`** is the working branch. Feature-branch off it; no long-lived branches.
- EAS channels: `production` (TestFlight / App Store), `preview`, `development`. `eas update --branch production` and the CI both target production.
- Build numbers are EAS-managed (`eas.json` `appVersionSource: "remote"`) — never edit `ios.buildNumber` / `android.versionCode` by hand. The marketing `version` in `app.config.ts` you bump for a release.

## Testing a build before it's public

New testers install once from **TestFlight** (App Store Connect → app → TestFlight → Internal Testing → add their Apple ID). After that OTA keeps them current.

For native changes you want to check before merging, build a one-off:
```
eas build --profile development-prod --platform ios   # simulator dev client
```

## Release setup + full runbook

`apps/mobile/RELEASE.md` — the App Store Connect API key, `EXPO_TOKEN`, first-build steps.
