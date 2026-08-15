import type { Item, NutritionCategory, StorageLocation } from "./types";

const TOKEN_KEY = "thatfridge_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export async function apiFetch<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  // FormData bodies must NOT get an explicit Content-Type — the browser sets its own
  // multipart boundary. Only stringified-JSON bodies (plain string) get the JSON header.
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.body && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.message || body?.error || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body?.errors);
  }

  return (body?.data ?? body) as T;
}

// Raw shapes as returned by the backend (see backend/app/Http/Resources/*.php).
export interface RawItem {
  id: string;
  name: string;
  icon: string;
  nutrition_category: NutritionCategory | null;
  freshness: number | null;
  days: number | null;
  note: string | null;
  location: StorageLocation | null;
  quantity: number | null;
}

export function toClientItem(raw: RawItem): Item {
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    nutritionCategory: raw.nutrition_category ?? null,
    freshness: raw.freshness ?? 0,
    days: raw.days ?? 0,
    note: raw.note ?? "",
    qty: raw.quantity ?? 1,
    opened: false,
    location: raw.location ?? undefined,
  };
}
