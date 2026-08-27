import { ApiError, type HttpClient, type TokenStore } from "./http";
import type {
  CurrentUser,
  Fridge,
  Item,
  MealType,
  NotificationEvent,
  NotificationPrefs,
  NutritionCategory,
  Recipe,
  Section,
  ShoppingItem,
  StorageLocation,
  Vibe,
  FoodFocus,
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

  return {
    login,
    register,
    logout,
    me,
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
  };
}

export type Api = ReturnType<typeof createApi>;
