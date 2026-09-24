export interface IconData {
  cells: (string | null)[];
  cols: number;
  rows: number;
}

export type StorageLocation = "fridge" | "freezer" | "pantry";

// Metric mass/volume plus imperial - covers a block of cheese in grams and a carton of milk
// in liters the same way. Mirrors ItemController::WEIGHT_UNITS on the backend.
export type WeightUnit = "g" | "kg" | "mg" | "ml" | "l" | "oz" | "lb";

// A user-defined label/value pair on an item, e.g. "Batch code" -> "L4471-09". The whole
// customFields array is replaced on every item PATCH; `id` is server-assigned on first write.
export interface CustomField {
  id: string;
  label: string;
  value: string;
}

// A lightweight food-group tag, not macro/nutrition tracking. other_extras (sauces, snacks,
// condiments, drinks, desserts, mixed/prepared dishes) is deliberately excluded from the Food
// Balance score's variety calculation - see NUTRITION_CATEGORIES in data.ts and scoring.ts.
export type NutritionCategory = "protein" | "vegetables" | "fruit" | "grains" | "dairy" | "other_extras";

// A free user-defined organisational label for the Inventory filter/grouping bar. Entirely
// separate from NutritionCategory — categories never touch the Food Balance / Waste Saver
// scores or the Balanced Plate badge.
export interface Category {
  id: string;
  name: string;
  color: string | null;
  position: number;
}

export interface Item {
  id: string;
  name: string;
  icon: string;
  iconUrl?: string | null;
  nutritionCategory?: NutritionCategory | null;
  categoryId?: string | null;
  freshness: number;
  days: number;
  /** ISO timestamp of when the item was added to the fridge. */
  added?: string | null;
  note: string;
  qty: number;
  opened?: boolean;
  location?: StorageLocation;
  shopUrl: string | null;
  /** Weight/volume of a single unit as stored; always paired with weightUnit. */
  weight?: number | null;
  weightUnit?: WeightUnit | null;
  /**
   * Total kcal for a single unit as stored (not per-100g, not per-serving, not multiplied by
   * qty). Deliberately a plain top-level field, not nested under nutritionCategory - that's a
   * food-group tag, not macro/nutrition tracking (see the comment above).
   */
  calories?: number | null;
  customFields: CustomField[];
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
  /** The recipe's own thumbnail: curated pixel-pack key. Null → fall back to ingredients[0]. */
  icon: string | null;
  /** The recipe's own thumbnail: generated-image URL. Null → use `icon`. Wins when set. */
  iconUrl: string | null;
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
  fridgeId: string;
  fridgeName: string;
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
  iconUrl?: string | null;
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
  social: boolean;
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

export type NotificationKind =
  | "expiring"
  | "lowStock"
  | "recipe"
  | "invite"
  | "joinRequest"
  | "requestApproved"
  | "requestDeclined"
  | "inviteAccepted"
  | "inviteDeclined"
  | "memberLeft"
  | "removed"
  | "itemAdded"
  | "itemUsed"
  | "note"
  | "machine";

// Kitchen Lab "Machine" - a user-defined automation with a trigger and a fixed, editable list
// of steps, authored once with AI help but replayed with zero AI involved afterward. Mirrors
// App\Models\Machine's docblock on the backend.
export type MachineTriggerType = "schedule" | "item_added" | "threshold" | "recipe_made";

export interface MachineScheduleTrigger {
  type: "schedule";
  config: {
    frequency: "daily" | "weekly";
    time: string; // "HH:MM", 24h
    weekday: number | null; // 0 (Sunday) - 6 (Saturday), required when frequency is "weekly"
    timezone: string;
  };
}

export interface MachineItemAddedTrigger {
  type: "item_added";
  config: {
    search: string | null;
    location: StorageLocation | null;
  };
}

export interface MachineThresholdTrigger {
  type: "threshold";
  config: {
    field: "quantity" | "weight" | "calories" | "custom";
    /** The custom field label to sum, case-insensitive - required (non-null) when field is
     *  "custom", always null otherwise. */
    custom_field_label: string | null;
    unit: WeightUnit | null;
    op: "lt" | "lte" | "gt" | "gte";
    value: number;
  };
}

export interface MachineRecipeMadeTrigger {
  type: "recipe_made";
  config: {
    /** null means any recipe - the AI drafter always emits null since it has no way to look
     *  up a specific recipe id; a specific one is only reachable via hand-edit. */
    recipe_id: number | null;
  };
}

export type MachineTrigger =
  | MachineScheduleTrigger
  | MachineItemAddedTrigger
  | MachineThresholdTrigger
  | MachineRecipeMadeTrigger;

// One AgentToolbox tool call - see AgentToolbox::MACHINE_TOOLS on the backend for which tools
// are eligible. `args` is opaque here since each tool's shape differs; the mobile UI only
// needs to render a human-readable summary of it, not validate it (the server re-validates on
// every save).
export interface MachineStep {
  tool: string;
  args: Record<string, unknown>;
  // Skips this step unless an earlier sum_item_field step's computed number compares this
  // way - the only tool that produces a value to condition on. A guard, not a branch to a
  // different path; omitted entirely for a step that should always run.
  condition?: { step: number; op: "lt" | "lte" | "gt" | "gte"; value: number };
}

export interface Machine {
  id: string;
  name: string;
  prompt: string | null;
  fridgeId: string;
  trigger: MachineTrigger;
  steps: MachineStep[];
  enabled: boolean;
  version: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: "success" | "failed" | null;
  lastRunError: string | null;
  runCount: number;
  createdAt: string;
}

// What POST /machines/draft returns - already reshaped server-side to the same {trigger:
// {type, config}} shape store()/update() accept, so a draft can be posted back unmodified.
export interface MachineDraft {
  name: string;
  trigger: MachineTrigger;
  steps: MachineStep[];
}

export interface MachineDraftResult {
  ok: boolean;
  draft?: MachineDraft;
  message?: string;
}

// The POST/PATCH /machines request body - snake_case fridge_id since that's the literal
// field MachineController validates, unlike Machine's camelCase response shape (see
// RecipeInput's icon_url for the same wire-vs-resource convention).
export interface MachineInput {
  name: string;
  prompt?: string | null;
  fridge_id: string;
  trigger: MachineTrigger;
  steps: MachineStep[];
}

// PATCH /machines/{id} accepts a different field set than create (no fridge_id/prompt - a
// Machine's fridge is fixed at creation - but adds `enabled`, absent from MachineInput).
export interface MachineUpdateInput {
  name?: string;
  prompt?: string | null;
  enabled?: boolean;
  trigger?: MachineTrigger;
  steps?: MachineStep[];
}

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
  /** Coarse onboarding answer tags (see apps/mobile/ONBOARDING.md); flavours later copy. */
  preferences?: OnboardingPrefs | null;
  /** Current AI-credit balance. Every AI action spends credits; Pro grants a monthly
   *  bundle, free users get a smaller monthly allowance, top up with packs. */
  credits?: number;
  /** Consecutive-day "opened the app" streak, computed server-side (User::recordDailyOpen)
   *  on every authenticated round trip. Not related to any Kitchen Score. */
  streak?: number;
  /** Managed demo / App Review account — always treated as Pro, name/username locked. */
  isDemo?: boolean;
  /**
   * Per-field budget for name / username edits on a rolling 30-day window. Lets the
   * edit-profile screen show "1 change left" and, once spent, when the field unlocks.
   * Null for managed demo / App Review accounts, which can't change either field.
   */
  profileChanges?: Record<
    "name" | "username",
    { limit: number; remaining: number; nextAllowedAt: string | null }
  > | null;
}

export type ProfileFields = Partial<Pick<CurrentUser, "name" | "username">>;

export type OnboardingGoal =
  | "waste_less"
  | "cook_smarter"
  | "organize"
  | "save_money";

export interface OnboardingPrefs {
  goal?: OnboardingGoal;
  waste_frequency?: "weekly" | "monthly" | "rarely";
  household?: "solo" | "partner" | "household" | "roommates";
}

/** One event for the first-party analytics ingest (`POST /events`). */
export interface AnalyticsEventInput {
  name: string;
  props?: Record<string, unknown>;
  /** Stable per-install id, kept across the sign-in boundary to stitch the funnel. */
  anon_id?: string;
  platform?: string;
  app_version?: string;
  /** Client epoch milliseconds when the event happened. */
  ts?: number;
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
  /** False when the owner is on the free plan — hosting a shared fridge is Pro-only, so
   *  there's nothing to request to join. */
  shareable: boolean;
}

export interface FriendProfile {
  id: string;
  name: string;
  username: string;
  fridges: FriendFridgeSummary[];
  recipes: Recipe[];
  blockedByMe: boolean;
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

// A pending request to join a fridge the current user owns - the cross-fridge counterpart to
// MyInvite above, aggregated across every fridge they own (see fetchMyJoinRequests), so it can
// show up on the Notifications page without needing that specific fridge's Manage Fridge open.
export interface MyJoinRequest {
  id: string;
  fridgeId: string;
  fridgeName: string;
  requesterName: string;
  requesterUsername: string;
  createdAt: number;
}

// A small fixed palette reusing existing theme tokens (theme.amber/blue/good/warn/bad) -
// no new colors invented for this.
export type FridgeNoteColor = "amber" | "blue" | "good" | "warn" | "bad";

// A shared, communal sticky note on a fridge - any member can edit or delete any note, not
// just its author (see FridgeNotePolicy on the backend). Fetched in aggregate across every
// fridge the user belongs to, same shape as MyInvite/MyJoinRequest above.
export interface FridgeNote {
  id: string;
  fridgeId: string;
  fridgeName: string;
  text: string;
  color: FridgeNoteColor;
  authorName: string | null;
  authorUsername: string | null;
  createdAt: number;
  updatedAt: number;
}