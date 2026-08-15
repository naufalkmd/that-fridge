export interface IconData {
  cells: (string | null)[];
  cols: number;
  rows: number;
}

export type StorageLocation = "fridge" | "freezer" | "pantry";

// A lightweight food-group tag, not macro/nutrition tracking. other_extras (sauces, snacks,
// condiments, drinks, desserts, mixed/prepared dishes) is deliberately excluded from the Food
// Balance score's variety calculation - see NUTRITION_CATEGORIES in data.ts and scoring.ts.
export type NutritionCategory = "protein" | "vegetables" | "fruit" | "grains" | "dairy" | "other_extras";

export interface Item {
  id: string;
  name: string;
  icon: string;
  nutritionCategory?: NutritionCategory | null;
  freshness: number;
  days: number;
  note: string;
  qty: number;
  opened?: boolean;
  location?: StorageLocation;
}

export interface Section {
  id: string;
  name: string;
  items: Item[];
}

export type FridgeStyleKey = "photo" | "custom" | "classic" | "french" | "retro" | "mini";

export interface Fridge {
  id: string;
  name: string;
  style?: FridgeStyleKey;
  photoUrl?: string | null;
  sections: Section[];
}

export interface RecipeIngredient {
  icon: string;
  name: string;
}

export type RecipeCategory = "breakfast" | "lunch" | "dinner" | "dessert" | "snack" | "quick";

export interface RecipeAttachment {
  type: "image" | "video";
  url: string;
}

export interface Recipe {
  id: string;
  name: string;
  minutes: number;
  category: RecipeCategory | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  attachments: RecipeAttachment[];
  isFavorite: boolean;
  isCustom: boolean;
}

export interface FridgeStyleDef {
  key: string;
  label: string;
  photo: string;
  bg: string;
}

export interface Agent {
  id: string;
  name: string;
  icon: string;
  summary: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  icon: string | null;
  section: string;
  checked: boolean;
}

export interface RecipeSuggestion {
  name: string;
  description: string;
  minutes: number;
  category: RecipeCategory | null;
  ingredients: { name: string }[];
  steps: string[];
}

export interface ChatMessage {
  id: string;
  from: "bot" | "user";
  text: string;
  attachmentName?: string;
  mocked?: boolean;
  suggestedRecipe?: RecipeSuggestion | null;
}

export interface ChatThread {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

export type ScanMethod = "receipt" | "barcode" | "photo" | "manual";

export interface DetectedItem {
  id: string;
  name: string;
  icon: string;
  section: string;
  checked: boolean;
  qty: number;
  expiryDate: string;
  location: StorageLocation;
}

export type Screen =
  | "home"
  | "inventory"
  | "foodHub"
  | "recipeDetail"
  | "recipeForm"
  | "fridgeStyle"
  | "itemDetail"
  | "add"
  | "search"
  | "chat"
  | "chatHistory"
  | "notifications"
  | "notificationHistory"
  | "aiData"
  | "goals"
  | "about";

export type FoodSubtab = "recipes" | "shopping" | "guardian" | "organizer";

export interface NotificationPrefs {
  expiryAlerts: boolean;
  lowStock: boolean;
  recipeTips: boolean;
  weeklyDigest: boolean;
  crewActionsEnabled: boolean;
}

export interface UsageHistoryEntry {
  id: string;
  key: string;
  name: string;
  icon: string;
  category: NutritionCategory | null;
  count: number;
  freshUseCount: number;
  freshnessSum: number;
  freshnessSampleCount: number;
  lastAt: number;
}

// money_saved is deliberately not offered - there's no price data anywhere in the schema
// (see backend/API.md's "User goal" section), so it can't be computed without inventing a
// number.
export type GoalMetricType = "waste_rate" | "items_rescued" | "freshness_at_use";
export type GoalPeriod = "weekly" | "monthly";

export interface UserGoal {
  metricType: GoalMetricType;
  targetValue: number;
  period: GoalPeriod;
  isActive: boolean;
  updatedAt: number;
}

export type NotificationKind = "expiring" | "lowStock" | "recipe";

export interface NotificationEvent {
  id: string;
  fridgeId: string;
  fridgeName: string;
  itemId: string | null;
  kind: NotificationKind;
  message: string;
  createdAt: number;
  done: boolean;
}

export type AuthMode = "login" | "signup";

export interface CurrentUser {
  name: string;
  email: string;
}