# ThatFridge — web (Next.js)

**Legacy — frozen.** The product is `apps/mobile`; this Next.js app predates the iOS-first
pivot and isn't actively developed. It stays here (and buildable) only until
`apps/mobile` ships a web output via `react-native-web` and this is retired — see `TO_DO.md`
→ "Web deployment". Don't add new features here; port to `apps/mobile`/`packages/core` instead.

## Run

```bash
cd apps/web
npm install
npm run dev
```

Talks to the backend via `NEXT_PUBLIC_API_URL` (`apps/web/.env.local`), defaults to
`http://127.0.0.1:8000/api`. See the root `README.md` for full local-dev setup.
