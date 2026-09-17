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

class RequestTimeoutError extends Error {}

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

    // Large multipart uploads (receipt/fridge/expiry photo scans) also wait on server-side
    // AI/OCR inference, so they need much more headroom than a plain JSON request before we
    // give up and call it a network failure. We race a timer against fetch() instead of using
    // AbortController: React Native has a known bug where attaching a signal to a fetch() call
    // with a FormData body breaks the multipart upload outright, not just on abort.
    const timeoutMs = isFormData ? 45_000 : 15_000;
    let timeoutId!: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new RequestTimeoutError()), timeoutMs);
    });

    let res: Response;
    try {
      const fetchPromise = fetch(`${base}${path}`, { ...opts, headers });
      fetchPromise.catch(() => {}); // avoid an unhandled rejection if the timeout wins the race
      res = await Promise.race([fetchPromise, timedOut]);
    } catch (err) {
      // fetch() throws for several unrelated reasons (no HTTP response, so no status code):
      // our own timeout, a genuine connectivity loss, or a transient mid-request drop. Only
      // the timeout case is distinguishable here, so at least don't call a slow AI response
      // "offline". status 0 is a sentinel, never a real HTTP status.
      if (err instanceof RequestTimeoutError) {
        throw new ApiError(0, "That's taking longer than expected — try again.");
      }
      // Temporary diagnostic: surface the real underlying error so we can see why
      // fetch() is rejecting before it ever reaches the server, instead of guessing.
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw new ApiError(0, `You're offline — check your connection and try again. [${detail}]`);
    } finally {
      clearTimeout(timeoutId);
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
