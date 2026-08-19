import type {
  BadgeKey,
  BadgeProgress,
  CurrentUser,
  FoodFocus,
  Fridge,
  GoalMetricType,
  GoalPeriod,
  MealType,
  NotificationEvent,
  NotificationPrefs,
  NutritionCategory,
  OrganizerTally,
  Recipe,
  RecipeAttachment,
  RecipeCategory,
  RecipeIngredient,
  RecipeSuggestion,
  ScoreSnapshot,
  Section,
  ShoppingItem,
  StorageLocation,
  UsageHistoryEntry,
  UserGoal,
  Vibe,
} from "./types";
import { apiFetch, setToken, type RawItem, toClientItem } from "./apiClient";

export function fetchRecipes(): Promise<Recipe[]> {
  return apiFetch<Recipe[]>("/recipes");
}

export interface RecipeInput {
  name: string;
  minutes: number;
  category?: RecipeCategory | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  attachments?: RecipeAttachment[];
}

export function createRecipe(data: RecipeInput): Promise<Recipe> {
  return apiFetch<Recipe>("/recipes", { method: "POST", body: JSON.stringify(data) });
}

export function updateRecipe(id: string, data: Partial<RecipeInput>): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteRecipe(id: string): Promise<void> {
  return apiFetch<void>(`/recipes/${id}`, { method: "DELETE" });
}

export function favoriteRecipe(id: string): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}/favorite`, { method: "POST" });
}

export function unfavoriteRecipe(id: string): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}/favorite`, { method: "DELETE" });
}

export interface WhatToEatResult {
  exact: Recipe[];
  similar: Recipe[];
  exhausted: boolean;
}

// Deliberately not wrapped in the standard {data: ...} envelope server-side (see
// backend/API.md's "What Should I Eat?" section) - apiFetch's automatic data-unwrapping would
// otherwise strip the sibling similar/exhausted fields this response needs.
export function suggestRecipes(params: { mealType?: MealType | null; vibes?: Vibe[]; foodFocus?: FoodFocus[] }): Promise<WhatToEatResult> {
  const query = new URLSearchParams();
  if (params.mealType) query.set("meal_type", params.mealType);
  (params.vibes ?? []).forEach((v) => query.append("vibes[]", v));
  (params.foodFocus ?? []).forEach((f) => query.append("food_focus[]", f));
  const qs = query.toString();
  return apiFetch<WhatToEatResult>(`/recipes/suggest${qs ? `?${qs}` : ""}`);
}

export function markRecipeMade(id: string): Promise<Recipe> {
  return apiFetch<Recipe>(`/recipes/${id}/mark-made`, { method: "POST" });
}

export function uploadRecipeAttachment(file: File): Promise<RecipeAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<RecipeAttachment>("/recipes/attachments", { method: "POST", body: formData });
}

export interface RecipeLinkImportResult {
  found: boolean;
  recipe?: RecipeSuggestion;
  reason?: string;
}

export function importRecipeFromLink(url: string): Promise<RecipeLinkImportResult> {
  return apiFetch<RecipeLinkImportResult>("/recipes/import-link", { method: "POST", body: JSON.stringify({ url }) });
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
  nutrition_category?: NutritionCategory | null;
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
  nutrition_category?: NutritionCategory | null;
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
  // The vision call's own read of produce condition, straight off the photo - see
  // PhotoService::detectItemsWithVision on the backend. null for non-produce/unclear items.
  condition: "vibrant" | "wilting" | "past_best" | null;
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

export function fetchUserGoal(): Promise<UserGoal> {
  return apiFetch<UserGoal>("/user-goal");
}

export interface UserGoalInput {
  metricType?: GoalMetricType;
  targetValue?: number;
  period?: GoalPeriod;
  isActive?: boolean;
}

export function updateUserGoal(data: UserGoalInput): Promise<UserGoal> {
  return apiFetch<UserGoal>("/user-goal", { method: "PATCH", body: JSON.stringify(data) });
}

export function fetchOrganizerTally(): Promise<OrganizerTally> {
  return apiFetch<OrganizerTally>("/organizer-tally");
}

export interface OrganizerTallyIncrementInput {
  checked: number;
  correct: number;
}

export function incrementOrganizerTally(data: OrganizerTallyIncrementInput): Promise<OrganizerTally> {
  return apiFetch<OrganizerTally>("/organizer-tally/increment", { method: "POST", body: JSON.stringify(data) });
}

export function fetchScoreSnapshots(weeks: number = 12): Promise<ScoreSnapshot[]> {
  return apiFetch<ScoreSnapshot[]>(`/score-snapshots?weeks=${weeks}`);
}

export function fetchBadges(): Promise<BadgeProgress[]> {
  return apiFetch<BadgeProgress[]>("/badges");
}

export function postBadgeProgress(badgeKey: BadgeKey, incrementBy: number = 1): Promise<BadgeProgress> {
  return apiFetch<BadgeProgress>(`/badges/${badgeKey}/progress`, { method: "POST", body: JSON.stringify({ incrementBy }) });
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
  // Present when Chef's reply recommends one specific recipe - see the
  // <<<RECIPE_SUGGESTION>>> block AgentService::extractRecipeSuggestion parses out of the raw
  // model output server-side, so this is already clean structured data by the time it reaches
  // the client.
  recipe_suggestion: RecipeSuggestion | null;
  // Compact (Home tip-card) calls aren't persisted as a session server-side, so
  // there's no session_id to hand back - see AgentController::send.
  session_id: string | null;
  mocked: boolean;
}

export function sendChatMessage(
  message: string,
  agent: ChatAgentName,
  inventory?: string,
  sessionId?: string | null,
  usageHistory?: string,
  compact?: boolean,
  streakSummary?: string
): Promise<SendChatMessageResult> {
  return apiFetch<SendChatMessageResult>("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      agent,
      inventory,
      session_id: sessionId || undefined,
      usage_history: usageHistory,
      compact,
      streak_context: streakSummary,
    }),
  });
}

export interface ChatHistoryRow {
  id: number;
  agent: ChatAgentName;
  user_message: string;
  agent_response: string | null;
  recipe_suggestion: RecipeSuggestion | null;
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
//
// category/daysRemaining/freshness are optional and come from the item's own
// Item.nutritionCategory/Item.days/Item.freshness at the moment it's removed - real values
// already computed client-side, not invented. They back the items_rescued/freshness_at_use
// goal metrics and the Food Balance score's variety calculation (see lib/thatfridge/goals.ts
// and scoring.ts).
export function recordItemUsage(
  name: string,
  icon: string,
  daysRemaining?: number,
  freshness?: number,
  category?: NutritionCategory | null
): Promise<UsageHistoryEntry> {
  return apiFetch<UsageHistoryEntry>("/usage-history", {
    method: "POST",
    body: JSON.stringify({
      name,
      icon,
      ...(daysRemaining !== undefined ? { daysRemaining } : {}),
      ...(freshness !== undefined ? { freshness } : {}),
      ...(category ? { category } : {}),
    }),
  });
}

export function deleteUsageHistoryEntryApi(id: string): Promise<void> {
  return apiFetch<void>(`/usage-history/${id}`, { method: "DELETE" });
}

export function clearUsageHistoryApi(): Promise<void> {
  return apiFetch<void>("/usage-history", { method: "DELETE" });
}

export function fetchMemoryFacts(): Promise<string[]> {
  return apiFetch<{ facts: string[] }>("/memory").then((res) => res.facts);
}

// Fired after a real chat reply is already shown (see sendChat in useThatFridge.ts) -
// asks the model to extract/update durable facts (preferences, restrictions, habits) from
// that one exchange. Never awaited by the caller, so it can never delay the chat reply.
export function extractMemory(userMessage: string, agentResponse: string): Promise<string[]> {
  return apiFetch<{ facts: string[] }>("/memory/extract", {
    method: "POST",
    body: JSON.stringify({ user_message: userMessage, agent_response: agentResponse }),
  }).then((res) => res.facts);
}

export function deleteMemoryFactApi(index: number): Promise<string[]> {
  return apiFetch<{ facts: string[] }>(`/memory/facts/${index}`, { method: "DELETE" }).then((res) => res.facts);
}

export function clearMemoryFactsApi(): Promise<void> {
  return apiFetch<void>("/memory", { method: "DELETE" });
}