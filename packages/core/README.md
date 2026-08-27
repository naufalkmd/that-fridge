# @thatfridge/core

Shared, framework-agnostic logic for the ThatFridge web and mobile apps.

## Status: scaffold

What's here now:

| File | State |
|---|---|
| `src/types.ts` | Copied verbatim from `apps/web/lib/thatfridge/types.ts`. Pure types. |
| `src/http.ts` | **New.** Platform-agnostic HTTP client — base URL + token storage are injected, so the same request logic runs on web (localStorage), mobile (expo-secure-store), and tests (in-memory). |

## Extraction plan (Member B — plan Day 2, timeboxed)

`apps/web/lib/thatfridge/` has ~104 import sites in the web app and mixes portable logic
with web-only code. Move it here in this order, keeping the web app green at each step:

1. **Pure modules** → move as-is: `utils.ts`, `scoring.ts`, `selectors.ts`, `streak.ts`,
   `badges.ts`, `goals.ts`, `data.ts`, `image.ts`. Point web's `@/lib/thatfridge/*`
   tsconfig alias at `packages/core/src` so no web imports change.
2. **`api.ts`** (664 lines of endpoint fns) → move here, replace `apiFetch(...)` calls with
   `client.request(...)` from `http.ts`. Web and mobile each construct a client with their
   own `TokenStore` + `baseUrl`.
3. **`apiClient.ts`** → its token helpers become the web `TokenStore` impl (localStorage);
   the rest folds into `http.ts` / `api.ts`.
4. **`useThatFridge.ts`** (`"use client"` React hook) → the data-fetching/state logic is
   shared; keep it here as a framework-agnostic hook (React works in RN too), but audit for
   web-only APIs (`window`, `localStorage`, DOM) and push those behind injected deps.
5. **`theme.ts`** → extract the raw token values (hex, spacing scale) here; leave
   web-specific CSS (`boxShadow`, gradients) in the web app. Mobile's
   `apps/mobile/tailwind.config.js` currently mirrors these by hand — switch it to import
   from here once done.
6. Move the `*.test.ts` files too; wire a `vitest` config in this package and update the
   pre-push hook.

Until step 1 lands, the web app still imports its own `apps/web/lib/thatfridge/` copy —
`types.ts` is duplicated. Don't add new consumers of the web copy.
