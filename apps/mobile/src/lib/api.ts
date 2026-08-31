import * as SecureStore from "expo-secure-store";
import { createApi, createHttpClient, type TokenStore } from "@thatfridge/core";

const TOKEN_KEY = "thatfridge_token";

export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

// EXPO_PUBLIC_API_URL is set per build profile (see eas.json) and per dev via .env. If it's
// somehow missing, a *release* build must never fall back to localhost — that's how the
// 1.1.0 TestFlight build ended up unreachable. Dev keeps the local default.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? "http://127.0.0.1:8000/api" : "https://api.thatfridge.com/api");

export const http = createHttpClient({
  baseUrl: API_BASE_URL,
  tokens: secureTokenStore,
});

export const api = createApi(http, secureTokenStore);
