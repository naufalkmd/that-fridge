import { ApiError, type HttpClient, type TokenStore } from "./http";
import type { CurrentUser } from "./types";

export interface AuthResult {
  user: CurrentUser;
  token: string;
}

export function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// The endpoint layer. Mirrors apps/web/lib/thatfridge/api.ts — the rest of its
// ~60 functions land here during the packages/core extraction (see README).
export function createApi(http: HttpClient, tokens: TokenStore) {
  async function login(email: string, password: string): Promise<AuthResult> {
    const res = await http.post<AuthResult>("/login", { email, password });
    await tokens.set(res.token);
    return res;
  }

  async function register(
    name: string,
    username: string,
    email: string,
    password: string,
  ): Promise<AuthResult> {
    const res = await http.post<AuthResult>("/register", { name, username, email, password });
    await tokens.set(res.token);
    return res;
  }

  async function logout(): Promise<void> {
    try {
      await http.post("/logout");
    } catch {
      // best-effort — the session is over locally regardless
    }
    await tokens.clear();
  }

  async function me(): Promise<CurrentUser> {
    const res = await http.get<{ user: CurrentUser }>("/me");
    return res.user;
  }

  return { login, register, logout, me };
}

export type Api = ReturnType<typeof createApi>;
