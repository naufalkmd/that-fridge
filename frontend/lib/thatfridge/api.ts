import type { CurrentUser, Fridge, NotificationEvent, NotificationPrefs, Recipe, Section, ShoppingItem, StorageLocation, UsageHistoryEntry } from "./types";
import { RECIPES } from "./data";
import { apiFetch, setToken, type RawItem, toClientItem } from "./apiClient";

function resolveAfter<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), 250));
}

// Recipes have no backend endpoint yet — stays mock.
export function fetchRecipes(): Promise<Recipe[]> {
  return resolveAfter(RECIPES);
}

interface RawSection {
  id: string;
  name: string;
  items: RawItem[];
}

interface RawFridge {
  id: string;
  name: string;
  style: string | null;
  photo_url: string | null;
  sections: RawSection[];
}

function toClientSection(raw: RawSection): Section {
  return { id: raw.id, name: raw.name, items: raw.items.map(toClientItem) };
}

function toClientFridge(raw: RawFridge): Fridge {
  return {
    id: raw.id,
    name: raw.name,
    style: (raw.style as Fridge["style"]) ?? undefined,
    photoUrl: raw.photo_url ?? undefined,
    sections: raw.sections.map(toClientSection),
  };
}

export async function login(email: string, password: string): Promise<{ user: CurrentUser; token: string }> {
  const res = await apiFetch<{ user: CurrentUser; token: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(res.token);
  return res;
}

export async function register(name: string, email: string, password: string): Promise<{ user: CurrentUser; token: string }> {
  const res = await apiFetch<{ user: CurrentUser; token: string }>("/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  setToken(res.token);
  return res;
}

export function logout(): Promise<void> {
  return apiFetch<void>("/logout", { method: "POST" });
}

export async function fetchMe(): Promise<CurrentUser> {
  const res = await apiFetch<{ user: CurrentUser }>("/me");
  return res.user;
}

export async function fetchFridges(): Promise<Fridge[]> {
  const raw = await apiFetch<RawFridge[]>("/fridges");
  return raw.map(toClientFridge);
}

export async function createFridge(name: string): Promise<Fridge> {
  const raw = await apiFetch<RawFridge>("/fridges", { method: "POST", body: JSON.stringify({ name }) });
  return toClientFridge(raw);
}

export async function updateFridge(id: string, data: { name?: string; style?: string; photo_url?: string | null }): Promise<Fridge> {
  const raw = await apiFetch<RawFridge>(`/fridges/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  return toClientFridge(raw);
}

export function deleteFridge(id: string): Promise<void> {
  return apiFetch<void>(`/fridges/${id}`, { method: "DELETE" });
}

export async function createSection(fridgeId: string, name: string): Promise<Section> {
  const raw = await apiFetch<RawSection>(`/fridges/${fridgeId}/sections`, { method: "POST", body: JSON.stringify({ name }) });
  return toClientSection(raw);
}

export interface CreateItemInput {
  name: string;
  icon: string;
  location?: StorageLocation;
  quantity?: number;
  expiry_date?: string;
  shelf_life_days?: number;
  note?: string;
}

export async function createItem(sectionId: string, data: CreateItemInput) {
  const raw = await apiFetch<RawItem>(`/sections/${sectionId}/items`, { method: "POST", body: JSON.stringify(data) });
  return toClientItem(raw);
}

export interface UpdateItemInput {
  name?: string;
  icon?: string;
  section_id?: string;
  location?: StorageLocation;
  quantity?: number;
  expiry_date?: string;
  shelf_life_days?: number;
  note?: string;
}

export async function updateItem(id: string, data: UpdateItemInput) {
  const raw = await apiFetch<RawItem>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  return toClientItem(raw);
}

export function deleteItem(id: string): Promise<void> {
  return apiFetch<void>(`/items/${id}`, { method: "DELETE" });
}

export interface BarcodeSuggestion {
  name: string;
  icon: string;
  category: string | null;
  default_shelf_life_days: number;
  location: StorageLocation | null;
  barcode: string;
  image_url: string | null;
}

export async function scanBarcode(sectionId: string, barcode: string): Promise<BarcodeSuggestion> {
  const res = await apiFetch<{ suggestion: BarcodeSuggestion }>(`/sections/${sectionId}/items/barcode`, {
    method: "POST",
    body: JSON.stringify({ barcode }),
  });
  return res.suggestion;
}

export interface ExpiryScanResult {
  found: boolean;
  date?: string;
  raw_text?: string | null;
  confidence?: "high" | "medium" | "low";
  message?: string;
}

export function scanExpiryPhoto(sectionId: string, image: File): Promise<ExpiryScanResult> {
  const formData = new FormData();
  formData.append("image", image);
  return apiFetch<ExpiryScanResult>(`/sections/${sectionId}/items/expiry-scan`, {
    method: "POST",
    body: formData,
  });
}

// Raw shapes returned by ReceiptService/PhotoService before the caller maps
// them into the app's DetectedItem[] shape.
export interface ReceiptDetectedItem {
  raw_text: string;
  parsed_name: string;
  parsed_quantity: number;
  matched_product_id: number | null;
  icon: string;
  confirmed: boolean;
}

export interface ReceiptScanResult {
  receipt_id: number;
  status: string;
  file_url: string;
  detected_items: ReceiptDetectedItem[];
  message: string;
}

export function scanReceipt(
  sectionId: string,
  image: File,
  storeName?: string,
  purchasedAt?: string
): Promise<ReceiptScanResult> {
  const formData = new FormData();
  formData.append("image", image);
  if (storeName) formData.append("store_name", storeName);
  if (purchasedAt) formData.append("purchased_at", purchasedAt);
  return apiFetch<ReceiptScanResult>(`/sections/${sectionId}/items/receipt/scan`, {
    method: "POST",
    body: formData,
  });
}

export interface PhotoDetectedItem {
  detected_name: string;
  parsed_name: string;
  icon: string;
  matched_product_id: number | null;
  confidence: number;
  confirmed: boolean;
}

export interface PhotoScanResult {
  photo_scan_id: number;
  status: string;
  file_url: string;
  detected_items: PhotoDetectedItem[];
  message: string;
}

export function scanFridgePhoto(sectionId: string, image: File): Promise<PhotoScanResult> {
  const formData = new FormData();
  formData.append("image", image);
  return apiFetch<PhotoScanResult>(`/sections/${sectionId}/items/photo/scan`, {
    method: "POST",
    body: formData,
  });
}

export function fetchShoppingItems(): Promise<ShoppingItem[]> {
  return apiFetch<ShoppingItem[]>("/shopping-items");
}

export function createShoppingItem(data: { name: string; icon: string | null; section: string }): Promise<ShoppingItem> {
  return apiFetch<ShoppingItem>("/shopping-items", { method: "POST", body: JSON.stringify(data) });
}

export function updateShoppingItem(id: string, data: Partial<{ name: string; icon: string | null; section: string; checked: boolean }>): Promise<ShoppingItem> {
  return apiFetch<ShoppingItem>(`/shopping-items/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteShoppingItem(id: string): Promise<void> {
  return apiFetch<void>(`/shopping-items/${id}`, { method: "DELETE" });
}

export function fetchNotificationPrefs(): Promise<NotificationPrefs> {
  return apiFetch<NotificationPrefs>("/notification-prefs");
}

export function updateNotificationPrefs(data: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  return apiFetch<NotificationPrefs>("/notification-prefs", { method: "PATCH", body: JSON.stringify(data) });
}

export function fetchNotificationEvents(): Promise<NotificationEvent[]> {
  return apiFetch<NotificationEvent[]>("/notification-events");
}

export function updateNotificationEvent(id: string, data: { done: boolean }): Promise<NotificationEvent> {
  return apiFetch<NotificationEvent>(`/notification-events/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export type ChatAgentName = "Chef" | "Guardian" | "Organizer" | "Shopkeeper";

export interface SendChatMessageResult {
  agent: ChatAgentName;
  user_message: string;
  agent_response: string;
  session_id: string;
  mocked: boolean;
}

export function sendChatMessage(
  message: string,
  agent: ChatAgentName,
  inventory?: string,
  sessionId?: string | null,
  usageHistory?: string,
  compact?: boolean
): Promise<SendChatMessageResult> {
  return apiFetch<SendChatMessageResult>("/chat", {
    method: "POST",
    body: JSON.stringify({ message, agent, inventory, session_id: sessionId || undefined, usage_history: usageHistory, compact }),
  });
}

export interface ChatHistoryRow {
  id: number;
  agent: ChatAgentName;
  user_message: string;
  agent_response: string | null;
  created_at: string;
}

export interface ChatHistoryResult {
  messages: ChatHistoryRow[];
  session_id: string | null;
}

// Restores only the most recent session's messages (so a refresh continues where
// you left off), not the user's entire chat history flattened into one thread.
export async function fetchChatHistory(): Promise<ChatHistoryResult> {
  return apiFetch<ChatHistoryResult>("/chat");
}

export interface ChatSessionSummary {
  session_id: string;
  first_message: string;
  updated_at: string;
  message_count: number;
}

export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  const res = await apiFetch<{ sessions: ChatSessionSummary[] }>("/chat/sessions");
  return res.sessions;
}

export async function fetchChatSessionMessages(sessionId: string): Promise<ChatHistoryResult> {
  return apiFetch<ChatHistoryResult>(`/chat/sessions/${sessionId}`);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await apiFetch(`/chat/sessions/${sessionId}`, { method: "DELETE" });
}

export interface ItemDetailsSuggestion {
  shelf_life_days: number;
  location: StorageLocation;
}

// Backs the Add-item form's "Auto-fill" button — previously a static lookup table with no
// AI call despite the sparkle-icon styling; now asks the model, with the same lookup table
// kept server-side purely as an offline/no-key fallback (see AgentService::suggestItemDetails).
export function suggestItemDetails(name: string, icon?: string): Promise<ItemDetailsSuggestion> {
  return apiFetch<ItemDetailsSuggestion>("/items/suggest-details", {
    method: "POST",
    body: JSON.stringify({ name, icon }),
  });
}

export function fetchUsageHistory(): Promise<UsageHistoryEntry[]> {
  return apiFetch<UsageHistoryEntry[]>("/usage-history");
}

// Called when an item is used up/discarded. The backend increments the existing entry for
// this item name or creates one — this record is what the Shopkeeper agent's prompt actually
// reads (see AgentService::getSystemPrompt), making the "AI Data & Memory" screen's claim
// that "Shopkeeper remembers items you use often" true instead of a local-only display.
export function recordItemUsage(name: string, icon: string): Promise<UsageHistoryEntry> {
  return apiFetch<UsageHistoryEntry>("/usage-history", {
    method: "POST",
    body: JSON.stringify({ name, icon }),
  });
}

export function deleteUsageHistoryEntryApi(id: string): Promise<void> {
  return apiFetch<void>(`/usage-history/${id}`, { method: "DELETE" });
}

export function clearUsageHistoryApi(): Promise<void> {
  return apiFetch<void>("/usage-history", { method: "DELETE" });
}