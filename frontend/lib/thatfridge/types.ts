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
  shopUrl: string | null;
}

export interface Section {
  id: string;
  name: string;
  items: Item[];
}

export type FridgeStyleKey = "photo" | "custom" | "classic" | "french" | "retro" | "mini";

export type FridgeRole = "owner" | "member";

export interface Fridge {
  id: string;
  name: string;
  style?: FridgeStyleKey;
  photoUrl?: string | null;
  sections: Section[];
  // The current user's role on this fridge - not the current user's fridge count etc, just
  // theirs on this one.
  role?: FridgeRole;
  memberCount?: number;
}

// Fetched lazily via fetchFridgeMembers() when "Manage fridge" opens, not embedded in every
// Fridge - the full member list (name/email/role/joinedAt per person) is unneeded weight on
// every reload of the core /fridges payload.
export interface FridgeMember {
  id: string;
  name: string;
  username: string;
  email: string;
  role: FridgeRole;
  joinedAt: number;
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

// "What Should I Eat?" tags - see backend/API.md's Recipes section. mealType/tagVibes/foodFocus
// are AI-inferred once at save time (App\Services\AgentService::tagRecipe); separate from the
// user-chosen `category` above, which is a different taxonomy used for Food Hub's own filter
// chips. somethingNew/useItUp are NOT stored tags - they're computed live at query time
// (RecipeController::suggest) from madeCount and current inventory, so they can't go stale.
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type TagVibe = "comfort" | "light_fresh" | "quick_easy";
export type LiveVibe = "something_new" | "use_it_up";
export type Vibe = TagVibe | LiveVibe;
export type FoodFocus = "high_protein" | "high_veg" | "low_carb" | "balanced";

export interface Recipe {
  id: string;
  name: string;
  minutes: number;
  category: RecipeCategory | null;
  ingredients: RecipeIngredient[];
  steps: string[];
  attachments: RecipeAttachment[];
  mealType: MealType | null;
  vibes: TagVibe[];
  foodFocus: FoodFocus[];
  madeCount: number;
  isFavorite: boolean;
  isCustom: boolean;
  isMine: boolean;
  ownerName: string | null;
  ownerUsername: string | null;
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
  shopUrl: string | null;
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
  // Local object URL for the attached photo's thumbnail - not persisted server-side, so this
  // (like the rest of the message beyond agent/user text) is gone on reload, same as a
  // restored session's other transient bits.
  attachmentUrl?: string;
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

// Asked for produce (vegetables/fruit) on manual add, where there's no purchase-receipt signal to
// presume "just bought" from (see suggestManualDetails in useThatFridge.ts). Photo-of-fridge scans
// skip the question entirely - the vision call reads condition straight off the photo instead (see
// PhotoService::detectItemsWithVision on the backend, and DetectedItem.condition below).
export type ProduceCondition = "vibrant" | "wilting" | "past_best";

export interface DetectedItem {
  id: string;
  name: string;
  icon: string;
  section: string;
  checked: boolean;
  qty: number;
  expiryDate: string;
  location: StorageLocation;
  // Only ever set for photo-scan-detected produce - the AI's visual read, applied automatically
  // by suggestDetectedDetails instead of asking. null for every other add method/category.
  condition: ProduceCondition | null;
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
  | "badges"
  | "about"
  | "findFriend"
  | "friendProfile";

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

// Cumulative, all-time - backs the Tidiness score. itemsCheckedTotal === 0 means Organizer
// hasn't run a sweep yet, same "not enough data" meaning as a null waste/balance score.
export interface OrganizerTally {
  itemsCheckedTotal: number;
  itemsCorrectTotal: number;
  lastCheckedAt: number | null;
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

// See backend/API.md's "Score snapshots" section - written weekly by app:snapshot-kitchen-scores,
// never pushed from the client, so a missing week is a real signal (broken streak), not a gap
// to paper over.
export interface ScoreSnapshot {
  weekOf: string; // "YYYY-MM-DD", Monday of that ISO week
  wasteScore: number;
  balanceScore: number | null;
}

export type BadgeKey = "rescued_10" | "first_link_recipe" | "full_week_variety" | "zero_waste_week";

export interface BadgeProgress {
  badgeKey: BadgeKey;
  progress: number;
  target: number;
  earnedAt: number | null;
}

export type AuthMode = "login" | "signup";

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  email: string;
}

export interface UserSearchResult {
  id: string;
  name: string;
  username: string;
}

export type JoinRequestStatus = "pending" | "accepted" | "declined";

export interface FriendFridgeSummary {
  id: string;
  name: string;
  memberCount: number;
  role: FridgeRole | null;
  requestStatus: JoinRequestStatus | null;
}

export interface FriendProfile {
  id: string;
  name: string;
  username: string;
  fridges: FriendFridgeSummary[];
  recipes: Recipe[];
}

// A pending request to join a fridge - only ever fetched for a fridge the current user owns
// (see fetchJoinRequests), the "Manage fridge" sheet's JOIN REQUESTS section.
export interface FridgeJoinRequest {
  id: string;
  fridgeId: string;
  requesterId: string;
  requesterName: string;
  requesterUsername: string;
  status: JoinRequestStatus;
  createdAt: number;
}

// A pending invite someone (a fridge owner) sent TO the current user - the "MY INVITES"
// section on the find-a-friend screen, fetched across all fridges via fetchMyInvites().
export interface MyInvite {
  id: string;
  fridgeId: string;
  fridgeName: string;
  inviterName: string;
  inviterUsername: string;
  createdAt: number;
}