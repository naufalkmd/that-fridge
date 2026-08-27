import * as SecureStore from "expo-secure-store";
import { createApi, createHttpClient, type TokenStore } from "@thatfridge/core";

const TOKEN_KEY = "thatfridge_token";

export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

export const http = createHttpClient({
  baseUrl: API_BASE_URL,
  tokens: secureTokenStore,
});

export const api = createApi(http, secureTokenStore);
