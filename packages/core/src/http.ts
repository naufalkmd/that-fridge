// Platform-agnostic HTTP client for the ThatFridge API.
//
// The web app (apps/web/lib/thatfridge/apiClient.ts) reads the token from
// window.localStorage and the base URL from NEXT_PUBLIC_API_URL. Mobile has neither.
// This module takes both as injected dependencies so the same request logic runs on
// web (localStorage), mobile (expo-secure-store), and in tests (in-memory).
//
// EXTRACTION TODO (Member B, plan Day 2): move the endpoint functions from
// apps/web/lib/thatfridge/api.ts here, swapping `apiFetch` for `client.request`.

export interface TokenStore {
  get(): string | null | Promise<string | null>;
  set(token: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export interface HttpClient {
  request<T = unknown>(path: string, opts?: RequestInit): Promise<T>;
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string, body?: unknown): Promise<T>;
}

export interface HttpClientConfig {
  baseUrl: string;
  tokens: TokenStore;
}

export function createHttpClient({ baseUrl, tokens }: HttpClientConfig): HttpClient {
  const base = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const token = await tokens.get();
    const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts.headers as Record<string, string>) ?? {}),
    };

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...opts, headers });
    } catch {
      // fetch() itself throws on no connectivity (not an HTTP response, so no status code) -
      // wrap it as an ApiError so every existing `describeError(e, fallback)` call site across
      // the app automatically shows this instead of its generic fallback, with no changes
      // needed at each call site. status 0 is a sentinel, never a real HTTP status.
      throw new ApiError(0, "You're offline — check your connection and try again.");
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      throw new ApiError(
        res.status,
        data?.message ?? data?.error ?? `Request failed (${res.status})`,
        data?.errors,
      );
    }
    // Laravel API Resources wrap collections/models in { data: ... }; plain
    // responses (auth) are already unwrapped. Mirror the web client.
    return (data?.data ?? data) as T;
  }

  const body = (b: unknown) =>
    b instanceof FormData ? b : b === undefined ? undefined : JSON.stringify(b);

  return {
    request,
    get: (path) => request(path),
    post: (path, b) => request(path, { method: "POST", body: body(b) }),
    patch: (path, b) => request(path, { method: "PATCH", body: body(b) }),
    put: (path, b) => request(path, { method: "PUT", body: body(b) }),
    del: (path, b) => request(path, { method: "DELETE", body: body(b) }),
  };
}
