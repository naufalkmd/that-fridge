import { ApiError, type HttpClient, type TokenStore } from "./http";
import type {
  BadgeKey,
  BadgeProgress,
  CurrentUser,
  FoodFocus,
  FriendProfile,
  Fridge,
  FridgeJoinRequest,
  FridgeMember,
  FridgeNote,
  FridgeNoteColor,
  GoalMetricType,
  GoalPeriod,
  Item,
  MealType,
  MyInvite,
  MyJoinRequest,
  NotificationEvent,
  NotificationPrefs,
  NutritionCategory,
  OrganizerTally,
  Recipe,
  RecipeAttachment,
  RecipeCategory,
  RecipeIngredient,
  ScoreSnapshot,
  Section,
  ShoppingItem,
  StorageLocation,
  UsageHistoryEntry,
  UserGoal,
  UserSearchResult,
  Vibe,
} from "./types";

export interface AuthResult {
  user: CurrentUser;
  token: string;
}

export function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

// --- raw backend shapes + transforms (mirror apps/web/lib/thatfridge) --------

interface RawItem {
  id: string;
  name: string;
  icon: string;
  icon_url: string | null;
  nutrition_category: NutritionCategory | null;
  freshness: number | null;
  days: number | null;
  note: string | null;
  location: StorageLocation | null;
  quantity: number | null;
  shop_url: string | null;
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
  role?: string | null;
  member_count?: number;
  sections: RawSection[];
}

function toItem(raw: RawItem): Item {
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon,
    iconUrl: raw.icon_url ?? null,
    nutritionCategory: raw.nutrition_category ?? null,
    freshness: raw.freshness ?? 0,
    days: raw.days ?? 0,
    note: raw.note ?? "",
    qty: raw.quantity ?? 1,
    opened: false,
    location: raw.location ?? undefined,
    shopUrl: raw.shop_url ?? null,
  };
}

function toSection(raw: RawSection): Section {
  return { id: raw.id, name: raw.name, items: raw.items.map(toItem) };
}

function toFridge(raw: RawFridge): Fridge {
  return {
    id: raw.id,
    name: raw.name,
    style: (raw.style as Fridge["style"]) ?? undefined,
    photoUrl: raw.photo_url ?? undefined,
    role: (raw.role as Fridge["role"]) ?? undefined,
    memberCount: raw.member_count,
    sections: raw.sections.map(toSection),
  };
}

export interface CreateItemInput {
  name: string;
  icon: string;
  icon_url?: string | null;
  nutrition_category?: NutritionCategory | null;
  location?: StorageLocation;
  quantity?: number;
  expiry_date?: string;
  shelf_life_days?: number;
  note?: string;
  shop_url?: string | null;
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
  shop_url?: string | null;
}

export interface WhatToEatResult {
  exact: Recipe[];
  similar: Recipe[];
  exhausted: boolean;
}

export type ChatAgentName = "Chef" | "Guardian" | "Organizer" | "Shopkeeper";

export interface RecipeSuggestionBlock {
  name: string;
  description: string;
  minutes: number;
  ingredients: { name: string }[];
  steps: string[];
}

export interface SendChatResult {
  agent: ChatAgentName;
  user_message: string;
  agent_response: string;
  recipe_suggestion: RecipeSuggestionBlock | null;
  session_id: string | null;
  mocked: boolean;
}

export interface ChatHistoryRow {
  id: number;
  agent: ChatAgentName;
  user_message: string;
  agent_response: string | null;
  recipe_suggestion: RecipeSuggestionBlock | null;
  created_at: string;
}

export interface ChatHistoryResult {
  messages: ChatHistoryRow[];
  session_id: string | null;
}

export interface ChatSessionSummary {
  session_id: string;
  first_message: string;
  updated_at: string;
  message_count: number;
}

export interface RecipeInput {
  name: string;
  minutes: number;
  category?: RecipeCategory | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  attachments?: RecipeAttachment[];
}

export interface RecipeLinkImportResult {
  found: boolean;
  recipe?: {
    name: string;
    description: string;
    minutes: number;
    category: RecipeCategory | null;
    ingredients: { name: string }[];
    steps: string[];
  };
  reason?: string;
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

// A flat view of every item across fridges, carrying its section/fridge context —
// what list screens actually render.
export interface FlatItem extends Item {
  sectionId: string;
  sectionName: string;
  fridgeId: string;
  fridgeName: string;
}

export function flattenItems(fridges: Fridge[]): FlatItem[] {
  const out: FlatItem[] = [];
  for (const fridge of fridges) {
    for (const section of fridge.sections) {
      for (const item of section.items) {
        out.push({
          ...item,
          sectionId: section.id,
          sectionName: section.name,
          fridgeId: fridge.id,
          fridgeName: fridge.name,
        });
      }
    }
  }
  return out;
}

// --- the endpoint layer ----------------------------------------------------

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

  async function deleteAccount(): Promise<void> {
    await http.del("/me");
    await tokens.clear();
  }

  function getChatHistory(): Promise<ChatHistoryResult> {
    return http.get<ChatHistoryResult>("/chat");
  }

  function sendChat(
    message: string,
    agent: ChatAgentName,
    opts: {
      inventory?: string;
      sessionId?: string | null;
      /** A photo to attach — RN: `{ uri, name, type }`; web: a `File`/`Blob`. */
      image?: unknown;
    } = {},
  ): Promise<SendChatResult> {
    if (opts.image && typeof FormData !== "undefined") {
      const fd = new FormData();
      fd.append("message", message);
      fd.append("agent", agent);
      if (opts.inventory) fd.append("inventory", opts.inventory);
      if (opts.sessionId) fd.append("session_id", opts.sessionId);
      // RN's FormData accepts { uri, name, type }; the DOM one accepts Blob/File.
      fd.append("image", opts.image as never);
      return http.post<SendChatResult>("/chat", fd);
    }
    return http.post<SendChatResult>("/chat", {
      message,
      agent,
      inventory: opts.inventory,
      session_id: opts.sessionId || undefined,
    });
  }

  async function listFridges(): Promise<Fridge[]> {
    const raw = await http.get<RawFridge[]>("/fridges");
    return raw.map(toFridge);
  }

  async function createFridge(name: string): Promise<Fridge> {
    return toFridge(await http.post<RawFridge>("/fridges", { name }));
  }

  async function createSection(fridgeId: string, name: string): Promise<Section> {
    return toSection(await http.post<RawSection>(`/fridges/${fridgeId}/sections`, { name }));
  }

  async function createItem(sectionId: string, data: CreateItemInput): Promise<Item> {
    const raw = await http.post<RawItem>(`/sections/${sectionId}/items`, data);
    return toItem(raw);
  }

  async function updateItem(id: string, data: UpdateItemInput): Promise<Item> {
    const raw = await http.patch<RawItem>(`/items/${id}`, data);
    return toItem(raw);
  }

  async function deleteItem(id: string): Promise<void> {
    await http.del(`/items/${id}`);
  }

  async function scanBarcode(sectionId: string, barcode: string): Promise<BarcodeSuggestion> {
    const res = await http.post<{ suggestion: BarcodeSuggestion }>(
      `/sections/${sectionId}/items/barcode`,
      { barcode },
    );
    return res.suggestion;
  }

  function listNotificationEvents(): Promise<NotificationEvent[]> {
    return http.get<NotificationEvent[]>("/notification-events");
  }

  function markNotification(id: string, done: boolean): Promise<NotificationEvent> {
    return http.patch<NotificationEvent>(`/notification-events/${id}`, { done });
  }

  function getNotificationPrefs(): Promise<NotificationPrefs> {
    return http.get<NotificationPrefs>("/notification-prefs");
  }

  function updateNotificationPrefs(data: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    return http.patch<NotificationPrefs>("/notification-prefs", data);
  }

  function listShoppingItems(): Promise<ShoppingItem[]> {
    return http.get<ShoppingItem[]>("/shopping-items");
  }

  function addShoppingItem(fridgeId: string, name: string): Promise<ShoppingItem> {
    return http.post<ShoppingItem>(`/fridges/${fridgeId}/shopping-items`, {
      name,
      icon: null,
      section: "other",
    });
  }

  function updateShoppingItem(
    id: string,
    data: Partial<{ name: string; checked: boolean; section: string }>,
  ): Promise<ShoppingItem> {
    return http.patch<ShoppingItem>(`/shopping-items/${id}`, data);
  }

  function deleteShoppingItem(id: string): Promise<void> {
    return http.del(`/shopping-items/${id}`).then(() => undefined);
  }

  function suggestRecipes(params: {
    mealType?: MealType | null;
    vibes?: Vibe[];
    foodFocus?: FoodFocus[];
  }): Promise<WhatToEatResult> {
    const q = new URLSearchParams();
    if (params.mealType) q.set("meal_type", params.mealType);
    (params.vibes ?? []).forEach((v) => q.append("vibes[]", v));
    (params.foodFocus ?? []).forEach((f) => q.append("food_focus[]", f));
    const qs = q.toString();
    // Not wrapped in { data } server-side — returns { exact, similar, exhausted }.
    return http.get<WhatToEatResult>(`/recipes/suggest${qs ? `?${qs}` : ""}`);
  }

  function markRecipeMade(id: string): Promise<Recipe> {
    return http.post<Recipe>(`/recipes/${id}/mark-made`);
  }

  // "Your Kitchen This Week" inputs — read-only on mobile. The API Resources already return
  // camelCase matching the core types; http.get unwraps the { data } envelope.
  function getUsageHistory(): Promise<UsageHistoryEntry[]> {
    return http.get<UsageHistoryEntry[]>("/usage-history");
  }

  function getOrganizerTally(): Promise<OrganizerTally> {
    return http.get<OrganizerTally>("/organizer-tally");
  }

  function getScoreSnapshots(weeks = 12): Promise<ScoreSnapshot[]> {
    return http.get<ScoreSnapshot[]>(`/score-snapshots?weeks=${weeks}`);
  }

  // ---- recipes -----------------------------------------------------------------
  function listRecipes(): Promise<Recipe[]> {
    return http.get<Recipe[]>("/recipes");
  }
  function createRecipe(data: RecipeInput): Promise<Recipe> {
    return http.post<Recipe>("/recipes", data);
  }
  function updateRecipe(id: string, data: Partial<RecipeInput>): Promise<Recipe> {
    return http.patch<Recipe>(`/recipes/${id}`, data);
  }
  function deleteRecipe(id: string): Promise<void> {
    return http.del(`/recipes/${id}`).then(() => undefined);
  }
  function favoriteRecipe(id: string): Promise<Recipe> {
    return http.post<Recipe>(`/recipes/${id}/favorite`);
  }
  function unfavoriteRecipe(id: string): Promise<Recipe> {
    return http.del<Recipe>(`/recipes/${id}/favorite`);
  }
  function importRecipeFromLink(url: string): Promise<RecipeLinkImportResult> {
    return http.post<RecipeLinkImportResult>("/recipes/import-link", { url });
  }

  // ---- fridge management -------------------------------------------------------
  function updateFridge(
    id: string,
    data: Partial<{ name: string; style: string; photo_url: string | null }>,
  ): Promise<Fridge> {
    return http.patch<RawFridge>(`/fridges/${id}`, data).then(toFridge);
  }
  function deleteFridge(id: string): Promise<void> {
    return http.del(`/fridges/${id}`).then(() => undefined);
  }
  function listFridgeMembers(fridgeId: string): Promise<FridgeMember[]> {
    return http.get<FridgeMember[]>(`/fridges/${fridgeId}/members`);
  }
  function removeFridgeMember(fridgeId: string, userId: string): Promise<void> {
    return http.del(`/fridges/${fridgeId}/members/${userId}`).then(() => undefined);
  }
  function leaveFridge(fridgeId: string): Promise<void> {
    return http.post(`/fridges/${fridgeId}/leave`).then(() => undefined);
  }

  // ---- social: friends, invites, join requests --------------------------------
  function searchUsers(q: string): Promise<UserSearchResult[]> {
    return http.get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(q)}`);
  }
  function getFriendProfile(username: string): Promise<FriendProfile> {
    return http.get<FriendProfile>(`/users/${encodeURIComponent(username)}/profile`);
  }
  function requestJoinFridge(fridgeId: string): Promise<FridgeJoinRequest> {
    return http.post<FridgeJoinRequest>(`/fridges/${fridgeId}/join-requests`);
  }
  function listJoinRequests(fridgeId: string): Promise<FridgeJoinRequest[]> {
    return http.get<FridgeJoinRequest[]>(`/fridges/${fridgeId}/join-requests`);
  }
  function inviteToFridge(fridgeId: string, userId: string): Promise<FridgeJoinRequest> {
    return http.post<FridgeJoinRequest>(`/fridges/${fridgeId}/invites`, { userId });
  }
  function getMyInvites(): Promise<MyInvite[]> {
    return http.get<MyInvite[]>("/invites");
  }
  function getMyJoinRequests(): Promise<MyJoinRequest[]> {
    return http.get<MyJoinRequest[]>("/join-requests");
  }
  function approveJoinRequest(id: string): Promise<void> {
    return http.post(`/join-requests/${id}/approve`).then(() => undefined);
  }
  function declineJoinRequest(id: string): Promise<void> {
    return http.post(`/join-requests/${id}/decline`).then(() => undefined);
  }

  // ---- fridge notes -----------------------------------------------------------
  function listFridgeNotes(): Promise<FridgeNote[]> {
    return http.get<FridgeNote[]>("/notes");
  }
  function createFridgeNote(
    fridgeId: string,
    data: { text: string; color: FridgeNoteColor },
  ): Promise<FridgeNote> {
    return http.post<FridgeNote>(`/fridges/${fridgeId}/notes`, data);
  }
  function updateFridgeNote(
    id: string,
    data: Partial<{ text: string; color: FridgeNoteColor }>,
  ): Promise<FridgeNote> {
    return http.patch<FridgeNote>(`/notes/${id}`, data);
  }
  function deleteFridgeNote(id: string): Promise<void> {
    return http.del(`/notes/${id}`).then(() => undefined);
  }

  // ---- goals + badges + organizer -------------------------------------------
  function getUserGoal(): Promise<UserGoal> {
    return http.get<UserGoal>("/user-goal");
  }
  function updateUserGoal(data: {
    metricType?: GoalMetricType;
    targetValue?: number;
    period?: GoalPeriod;
    isActive?: boolean;
  }): Promise<UserGoal> {
    return http.patch<UserGoal>("/user-goal", data);
  }
  function getBadges(): Promise<BadgeProgress[]> {
    return http.get<BadgeProgress[]>("/badges");
  }
  function postBadgeProgress(badgeKey: BadgeKey, incrementBy = 1): Promise<BadgeProgress> {
    return http.post<BadgeProgress>(`/badges/${badgeKey}/progress`, { incrementBy });
  }
  function incrementOrganizerTally(data: { checked: number; correct: number }): Promise<OrganizerTally> {
    return http.post<OrganizerTally>("/organizer-tally/increment", data);
  }

  // ---- AI data & memory -----------------------------------------------------
  function getMemoryFacts(): Promise<string[]> {
    return http.get<{ facts: string[] }>("/memory").then((r) => r.facts);
  }
  function deleteMemoryFact(index: number): Promise<string[]> {
    return http.del<{ facts: string[] }>(`/memory/facts/${index}`).then((r) => r.facts);
  }
  function clearMemoryFacts(): Promise<void> {
    return http.del("/memory").then(() => undefined);
  }
  function deleteUsageHistoryEntry(id: string): Promise<void> {
    return http.del(`/usage-history/${id}`).then(() => undefined);
  }
  function clearUsageHistory(): Promise<void> {
    return http.del("/usage-history").then(() => undefined);
  }

  // ---- chat sessions -------------------------------------------------------
  function listChatSessions(): Promise<ChatSessionSummary[]> {
    return http.get<{ sessions: ChatSessionSummary[] }>("/chat/sessions").then((r) => r.sessions);
  }
  function getChatSessionMessages(sessionId: string): Promise<ChatHistoryResult> {
    return http.get<ChatHistoryResult>(`/chat/sessions/${sessionId}`);
  }
  function deleteChatSession(sessionId: string): Promise<void> {
    return http.del(`/chat/sessions/${sessionId}`).then(() => undefined);
  }

  // Call when an item is used up (not thrown away) — increments/creates the usage entry the
  // Shopkeeper agent and the Food Balance / Waste scores read. daysRemaining/freshness/category
  // come straight off the item at the moment it's removed.
  function recordItemUsage(data: {
    name: string;
    icon: string;
    daysRemaining?: number;
    freshness?: number;
    category?: NutritionCategory | null;
  }): Promise<UsageHistoryEntry> {
    return http.post<UsageHistoryEntry>("/usage-history", {
      name: data.name,
      icon: data.icon,
      ...(data.daysRemaining !== undefined ? { daysRemaining: data.daysRemaining } : {}),
      ...(data.freshness !== undefined ? { freshness: data.freshness } : {}),
      ...(data.category ? { category: data.category } : {}),
    });
  }

  return {
    login,
    register,
    logout,
    me,
    deleteAccount,
    getChatHistory,
    sendChat,
    listFridges,
    createFridge,
    createSection,
    createItem,
    updateItem,
    deleteItem,
    scanBarcode,
    listNotificationEvents,
    markNotification,
    getNotificationPrefs,
    updateNotificationPrefs,
    listShoppingItems,
    addShoppingItem,
    updateShoppingItem,
    deleteShoppingItem,
    suggestRecipes,
    markRecipeMade,
    getUsageHistory,
    getOrganizerTally,
    getScoreSnapshots,
    recordItemUsage,
    listRecipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    favoriteRecipe,
    unfavoriteRecipe,
    importRecipeFromLink,
    updateFridge,
    deleteFridge,
    listFridgeMembers,
    removeFridgeMember,
    leaveFridge,
    searchUsers,
    getFriendProfile,
    requestJoinFridge,
    listJoinRequests,
    inviteToFridge,
    getMyInvites,
    getMyJoinRequests,
    approveJoinRequest,
    declineJoinRequest,
    listFridgeNotes,
    createFridgeNote,
    updateFridgeNote,
    deleteFridgeNote,
    getUserGoal,
    updateUserGoal,
    getBadges,
    postBadgeProgress,
    incrementOrganizerTally,
    getMemoryFacts,
    deleteMemoryFact,
    clearMemoryFacts,
    deleteUsageHistoryEntry,
    clearUsageHistory,
    listChatSessions,
    getChatSessionMessages,
    deleteChatSession,
  };
}

export type Api = ReturnType<typeof createApi>;
