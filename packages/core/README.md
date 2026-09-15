# @thatfridge/core

Shared, framework-agnostic logic for the ThatFridge web and mobile apps.

| File | What's in it |
|---|---|
| `src/types.ts` | Shared domain types. |
| `src/http.ts` | Platform-agnostic HTTP client — base URL + token storage are injected, so the same request logic runs on web (localStorage), mobile (expo-secure-store), and tests (in-memory). |
| `src/api.ts` | API endpoint functions, built on `http.ts`. |
| `src/domain.ts` | Domain rules shared across both apps. |
| `src/home.ts` | Home-screen data shaping. |
| `src/progress.ts` | Kitchen-score / progress calculations. |
| `src/icons.ts` | Food-icon lookup (generated from `food-icon-manifest.json`). |

`apps/mobile` is the primary consumer. `apps/web/lib/thatfridge/` still has its own copy of
several modules not yet migrated here (`badges.ts`, `goals.ts`, `image.ts`, `scoring.ts`,
`selectors.ts`, `streak.ts`, `theme.ts`, `useThatFridge.ts`, `utils.ts`, `apiClient.ts`) — see
`TO_DO.md` → "apps/web/lib/thatfridge → packages/core extraction" for that remaining scope.
Don't add new consumers of the web copy in the meantime.
