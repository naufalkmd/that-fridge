"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FOOD_ICON_KEYS,
  FOOD_TAB_ORDER,
  ICON_SECTION,
  NUTRITION_CATEGORIES,
  STORAGE_LOCATIONS,
  guessIcon,
  guessLocation,
  guessNutritionCategory,
  guessNutritionCategoryLabel,
  suggestShelfLifeDays,
} from "./data";
import {
  clearMemoryFactsApi,
  clearUsageHistoryApi,
  createFridge,
  createItem,
  createRecipe,
  createSection,
  createShoppingItem,
  deleteChatSession,
  deleteFridge as apiDeleteFridge,
  deleteItem,
  deleteMemoryFactApi,
  deleteRecipe as apiDeleteRecipe,
  deleteShoppingItem,
  deleteUsageHistoryEntryApi,
  approveJoinRequest,
  declineJoinRequest,
  extractMemory,
  favoriteRecipe,
  fetchBadges,
  fetchChatHistory,
  fetchChatSessionMessages,
  fetchChatSessions,
  fetchFridgeMembers,
  fetchFridges,
  fetchFriendProfile,
  fetchJoinRequests,
  fetchMe,
  fetchMemoryFacts,
  fetchMyInvites,
  fetchNotificationEvents,
  fetchNotificationPrefs,
  fetchOrganizerTally,
  fetchRecipes,
  fetchScoreSnapshots,
  fetchShoppingItems,
  fetchUsageHistory,
  fetchUserGoal,
  importRecipeFromLink,
  incrementOrganizerTally,
  inviteToFridge,
  leaveFridge as apiLeaveFridge,
  login,
  logout,
  markRecipeMade,
  postBadgeProgress,
  recordItemUsage,
  register,
  removeFridgeMember as apiRemoveFridgeMember,
  requestJoinFridge,
  scanBarcode,
  scanExpiryPhoto,
  scanFridgePhoto,
  scanReceipt,
  searchUsers,
  sendChatMessage,
  suggestItemDetails,
  suggestRecipes,
  type ChatAgentName,
  type UserGoalInput,
  unfavoriteRecipe,
  updateFridge,
  updateItem,
  updateNotificationEvent,
  updateNotificationPrefs,
  updateRecipe,
  updateShoppingItem,
  updateUserGoal,
  uploadRecipeAttachment,
} from "./api";
import { ApiError, clearToken, getToken } from "./apiClient";
import { findItem, findSectionIdForGroup, getActiveFridgeItems, getScopedItems } from "./selectors";
import { BADGE_CATALOG } from "./badges";
import { computeStreak } from "./streak";
import type {
  AuthMode,
  BadgeKey,
  BadgeProgress,
  ChatMessage,
  ChatThread,
  CurrentUser,
  DetectedItem,
  FoodFocus,
  FoodSubtab,
  FriendProfile,
  Fridge,
  FridgeJoinRequest,
  FridgeMember,
  FridgeStyleKey,
  Item,
  MealType,
  MyInvite,
  NotificationEvent,
  NotificationPrefs,
  NutritionCategory,
  OrganizerTally,
  ProduceCondition,
  Recipe,
  RecipeAttachment,
  RecipeCategory,
  RecipeIngredient,
  RecipeSuggestion,
  Screen,
  ScanMethod,
  ScoreSnapshot,
  Section,
  ShoppingItem,
  StorageLocation,
  UsageHistoryEntry,
  UserGoal,
  UserSearchResult,
  Vibe,
} from "./types";
const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [{ id: "m0", from: "bot", text: "Hi! Ask me anything about what's in your fridge." }];

// Only these two categories get the manual-add condition question - shelf life for a can of
// beans or a block of cheese doesn't hinge on a "does it look wilted" read the way produce does.
const PRODUCE_CATEGORIES = new Set(["vegetables", "fruit"]);

// Applied to the AI/fallback's fresh-purchase baseline once the user says how it actually looks.
// Not derived from anything measured - deliberately rough, same "explainable over precise" stance
// as the kitchen scores in scoring.ts. Floored at 1 day either way (see runManualAutoFill) so
// "past its best" still gives an editable date instead of one already in the past.
const CONDITION_SHELF_LIFE_MULTIPLIER: Record<ProduceCondition, number> = {
  vibrant: 1,
  wilting: 0.4,
  past_best: 0.1,
};

// Was previously handed just state.fridges[state.activeFridge] - that ignored kitchenScope
// entirely, so a Crew insight generated while scoped to "All Fridges" still only ever saw
// whichever single fridge happened to be "active" (often not the one with items in it),
// reporting the whole kitchen as empty even when another fridge clearly wasn't. Now built from
// getScopedItems, which already honors kitchenScope the same way every other summary/score on
// the app does.
function buildInventorySummary(state: ThatFridgeState): string | undefined {
  if (state.fridges.length === 0) return undefined;
  const items = getScopedItems(state);
  if (!items.length) return "Fridge is currently empty.";
  return items
    .map((item) => `${item.name} — qty ${item.qty}, ${item.location ?? "fridge"}, use within ${item.days} day${item.days === 1 ? "" : "s"}`)
    .join("\n");
}

// Sent alongside every chat/agent-activation call so the model can actually reason about
// past usage (see AgentService::getSystemPrompt) instead of that data only ever being
// displayed locally on the AI Data & Memory screen.
function buildUsageSummary(usageHistory: UsageHistoryEntry[]): string | undefined {
  if (!usageHistory.length) return undefined;
  return usageHistory
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((h) => `${h.name} (used ${h.count}×)`)
    .join("\n");
}

function buildStreakSummary(scoreSnapshots: ScoreSnapshot[]): string | undefined {
  const streak = computeStreak(scoreSnapshots);
  return streak >= 1 ? `Waste Saver streak: ${streak} week${streak === 1 ? "" : "s"}` : undefined;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Natural-language phrasing for the "Ask Chef instead" handoff - deliberately separate from
// WhatToEatSheet.tsx's chip labels (those are UI copy, this is a sentence fragment), even
// though both describe the same tag set.
const WHAT_TO_EAT_MEAL_TYPE_PHRASE: Record<MealType, string> = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snack: "snack",
};
const WHAT_TO_EAT_VIBE_PHRASE: Record<Vibe, string> = {
  comfort: "comforting",
  light_fresh: "light and fresh",
  quick_easy: "quick and easy",
  something_new: "something I haven't made before",
  use_it_up: "using ingredients that are close to expiring",
};
const WHAT_TO_EAT_FOOD_FOCUS_PHRASE: Record<FoodFocus, string> = {
  high_protein: "high in protein",
  high_veg: "veggie-forward",
  low_carb: "low carb",
  balanced: "a balanced mix of protein, veg, and carbs",
};

function buildWhatToEatChatPrompt(mealType: MealType | null, vibes: Vibe[], foodFocus: FoodFocus[]): string {
  const descriptors = [...vibes.map((v) => WHAT_TO_EAT_VIBE_PHRASE[v]), ...foodFocus.map((f) => WHAT_TO_EAT_FOOD_FOCUS_PHRASE[f])];
  const subject = mealType ? `a ${WHAT_TO_EAT_MEAL_TYPE_PHRASE[mealType]} recipe` : "a recipe";
  const descriptorClause = descriptors.length ? ` that's ${descriptors.join(", ")}` : "";
  return `Can you suggest ${subject}${descriptorClause}, using what's in my fridge?`;
}

function deriveThreadTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (!trimmed) return "Conversation";
  return trimmed.length > 40 ? trimmed.slice(0, 40) + "…" : trimmed;
}

function toISODate(date: Date): string {
  // Use local calendar date components, not toISOString() (which converts to UTC first and
  // shifts the date backward by a day for timezones ahead of UTC during early local hours).
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultExpiryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toISODate(d);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export interface ThatFridgeState {
  screen: Screen;
  lastMainScreen: "home" | "inventory";
  isLoading: boolean;
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  authMode: AuthMode;
  authName: string;
  authUsername: string;
  authEmail: string;
  authPassword: string;
  authConfirmPassword: string;
  authError: string | null;
  fridges: Fridge[];
  recipes: Recipe[];
  activeFridge: number;
  heroSlide: number;
  newFridgeName: string;
  showProfilePanel: boolean;
  selectedItemId: string | null;
  isEditingItem: boolean;
  editName: string;
  editSectionId: string;
  editIcon: string;
  editCategory: string;
  editFridgeIndex: number;
  editExpiryDate: string;
  editNote: string;
  addStep: number;
  addFridgeIndex: number;
  scanMethod: ScanMethod | null;
  detected: DetectedItem[];
  barcodeInput: string;
  barcodeLoading: boolean;
  barcodeError: string | null;
  expiryPhotoLoading: boolean;
  expiryPhotoError: string | null;
  expiryScanNote: string | null;
  // Which expiry-date input the camera-scan step (addStep 6) should write its result into -
  // "manual" for the manual-add form's date field, or a DetectedItem id for the
  // barcode/receipt/photo review flows. Also determines which addStep to return to.
  expiryPhotoTargetId: string | "manual" | null;
  scanImageLoading: boolean;
  scanImageError: string | null;
  manualAutoFillLoading: boolean;
  manualAutoFillAskCondition: boolean;
  detectedAutoFillLoadingId: string | null;
  detectedAutoFillAllLoading: boolean;
  manualName: string;
  manualSectionId: string;
  manualSectionAuto: boolean;
  manualIcon: string;
  manualIconAuto: boolean;
  manualCategory: string;
  manualCategoryAuto: boolean;
  manualLocation: StorageLocation;
  manualExpiryDate: string;
  manualNote: string;
  usageHistory: UsageHistoryEntry[];
  // Durable facts (preferences, restrictions, habits) MemoryService has extracted from
  // past real chat messages - distinct from usageHistory's item-frequency tally. Shown on
  // the AI Data & Memory screen; read server-side into every agent prompt.
  memoryFacts: string[];
  searchQuery: string;
  foodSubtab: FoodSubtab;
  selectedRecipeId: string | null;
  // null id = creating a new recipe; a set id = editing an existing custom one.
  recipeFormId: string | null;
  recipeFormName: string;
  recipeFormMinutes: string;
  recipeFormCategory: RecipeCategory | null;
  recipeFormIngredients: RecipeIngredient[];
  recipeFormSteps: string[];
  recipeFormAttachments: RecipeAttachment[];
  recipeFormAttachmentUploading: boolean;
  recipeFormLinkUrl: string;
  recipeFormLinkImporting: boolean;
  recipeFormLinkError: string | null;
  // True once a link import has successfully prefilled this open form - checked (and reset) on
  // save, so the first_link_recipe badge only fires for a recipe actually saved from an import,
  // not just an import that got started then abandoned.
  recipeFormLinkImported: boolean;
  // "Mark as made" - null recipeId means the sheet is closed. Candidates are inventory items
  // matched to the recipe's ingredients by icon (soonest-expiring one wins on duplicates,
  // unmatched ingredients don't produce a candidate) - removing one from the list entirely
  // means "not actually used". Everything still in the list is either "finished" (consumed -
  // same logic as markItemConsumed) or "remaining" (used from, not up - same as markUsed/
  // "Opened it"), defaulting to finished since that's the common case.
  markMadeRecipeId: string | null;
  markMadeCandidates: { id: string; ingredientName: string; itemId: string; itemName: string; icon: string }[];
  markMadeStatus: Record<string, "finished" | "remaining">;
  // "What Should I Eat?" - floating-button mini-Chef on the Food Hub Recipes tab. mealType is
  // single-select (re-clicking the active chip clears it); vibes/foodFocus are multi-select.
  // The backend (RecipeController::suggest) splits matches into two tiers instead of one flat
  // list: whatToEatExact (fully honors every selected filter) and whatToEatSimilar (real
  // recipes that share the selected vibes/food_focus without fully qualifying - what dropping
  // a hard filter turns up, shown as its own labeled section rather than only ever backfilling
  // "exact" or appearing solely as an empty-results fallback). Both are null until findMeals()
  // resolves at least once, and both are shuffled once client-side on arrival; each tier's
  // Shuffle button just advances its own …Page counter through fixed 3-item slices of that same
  // shuffled order (wrapping around) rather than re-fetching or re-randomizing on every press,
  // so pressing it repeatedly cycles through every real match before ever repeating one.
  whatToEatOpen: boolean;
  whatToEatMealType: MealType | null;
  whatToEatVibes: Vibe[];
  whatToEatFoodFocus: FoodFocus[];
  whatToEatExact: Recipe[] | null;
  whatToEatExactPage: number;
  whatToEatSimilar: Recipe[] | null;
  whatToEatSimilarPage: number;
  whatToEatExhausted: boolean;
  whatToEatLoading: boolean;
  newShoppingText: string;
  shoppingList: ShoppingItem[];
  shoppingSeeded: boolean;
  chatMessages: ChatMessage[];
  chatDraft: string;
  isTyping: boolean;
  chatThreads: ChatThread[];
  currentSessionId: string | null;
  stylingFridgeIndex: number;
  // Lazily fetched when FridgeStyleSheet opens, not part of Fridge itself - see FridgeMember's
  // doc comment in types.ts for why this stays out of the core fridges list.
  fridgeMembers: FridgeMember[];
  fridgeMembersLoading: boolean;
  // Pending join requests for whichever fridge FridgeStyleSheet has open - only fetched when
  // the current user owns it (see openStylePicker), same lazy-per-open pattern as fridgeMembers.
  joinRequests: FridgeJoinRequest[];
  joinRequestsLoading: boolean;
  // The "INVITE SOMEONE" search inside FridgeStyleSheet - its own state slot (not shared with
  // friendSearch* below) since Find-a-friend's search deliberately persists across a
  // close/reopen and reusing it here would cross-contaminate the two screens.
  inviteSearchQuery: string;
  inviteSearchResults: UserSearchResult[];
  inviteSearchLoading: boolean;
  // Pending invites sent TO the current user, across all fridges - fetched at bootstrap (see
  // the init-fetch effect) so the Home header's badge is available as soon as they're signed in.
  myInvites: MyInvite[];
  // Find-a-friend search + the profile screen it opens into.
  friendSearchQuery: string;
  friendSearchResults: UserSearchResult[];
  friendSearchLoading: boolean;
  friendProfile: FriendProfile | null;
  friendProfileLoading: boolean;
  undoMessage: string | null;
  syncError: string | null;
  notificationPrefs: NotificationPrefs;
  notificationEvents: NotificationEvent[];
  // null until the initial fetch resolves - GET /user-goal always firstOrCreate()s a default
  // server-side, so this only stays null very briefly (or if the fetch itself fails).
  userGoal: UserGoal | null;
  // Cumulative, all-time - backs the Tidiness sub-score. null until the initial fetch resolves,
  // same firstOrCreate()-so-only-briefly-null story as userGoal above.
  organizerTally: OrganizerTally | null;
  // Written weekly, server-side only, by app:snapshot-kitchen-scores - see streak.ts's
  // computeStreak and scoring.ts's getScoreTrend, both of which read this instead of a
  // client-computed history.
  scoreSnapshots: ScoreSnapshot[];
  badges: BadgeProgress[];
  badgeUnlockToast: string | null;
  kitchenScope: "active" | "all";
  inventorySortMode: "category" | "expiry" | "name";
  agentInsights: Partial<Record<ChatAgentName, string>>;
  // Per-agent, not a single value — Home can auto-activate Guardian/Chef/Shopkeeper
  // concurrently on load, not just one at a time like the FoodHub "Activate" button did.
  agentInsightLoading: Partial<Record<ChatAgentName, boolean>>;
  // Guards the *auto* activation only (Home's tip cards) so a failed fetch doesn't retry on
  // every re-render; the manual "Activate"/"Refresh insight" button in FoodHub bypasses this.
  agentAutoFetched: Partial<Record<ChatAgentName, boolean>>;
  // Items Organizer thinks are in the wrong spot, computed when "Activate Organizer" runs
  // with notificationPrefs.crewActionsEnabled on - see checkOrganizerMoves(). Cleared on
  // apply/dismiss and whenever a fresh Activate runs.
  organizerSuggestedMoves: { itemId: string; itemName: string; location: StorageLocation }[];
  organizerMovesLoading: boolean;
}

export function initialState(): ThatFridgeState {
  return {
    screen: "home",
    lastMainScreen: "home",
    isLoading: false,
    isAuthenticated: false,
    currentUser: null,
    authMode: "login",
    authName: "",
    authUsername: "",
    authEmail: "",
    authPassword: "",
    authConfirmPassword: "",
    authError: null,
    fridges: [],
    recipes: [],
    activeFridge: 0,
    heroSlide: 0,
    newFridgeName: "",
    showProfilePanel: false,
    selectedItemId: null,
    isEditingItem: false,
    editName: "",
    editSectionId: "",
    editIcon: "",
    editCategory: "",
    editFridgeIndex: 0,
    editExpiryDate: "",
    editNote: "",
    addStep: 0,
    addFridgeIndex: 0,
    scanMethod: null,
    detected: [],
    barcodeInput: "",
    barcodeLoading: false,
    barcodeError: null,
    expiryPhotoLoading: false,
    expiryPhotoError: null,
    expiryScanNote: null,
    expiryPhotoTargetId: null,
    scanImageLoading: false,
    scanImageError: null,
    manualAutoFillLoading: false,
    manualAutoFillAskCondition: false,
    detectedAutoFillLoadingId: null,
    detectedAutoFillAllLoading: false,
    manualName: "",
    manualSectionId: "",
    manualSectionAuto: true,
    manualIcon: "leftovers",
    manualIconAuto: true,
    manualCategory: "other_extras",
    manualCategoryAuto: true,
    manualLocation: "fridge",
    manualExpiryDate: defaultExpiryDate(),
    manualNote: "",
    usageHistory: [],
    memoryFacts: [],
    searchQuery: "",
    foodSubtab: "recipes",
    selectedRecipeId: null,
    recipeFormId: null,
    recipeFormName: "",
    recipeFormMinutes: "20",
    recipeFormCategory: null,
    recipeFormIngredients: [],
    recipeFormSteps: [],
    recipeFormAttachments: [],
    recipeFormAttachmentUploading: false,
    recipeFormLinkUrl: "",
    recipeFormLinkImporting: false,
    recipeFormLinkError: null,
    recipeFormLinkImported: false,
    markMadeRecipeId: null,
    markMadeCandidates: [],
    markMadeStatus: {},
    whatToEatOpen: false,
    whatToEatMealType: null,
    whatToEatVibes: [],
    whatToEatFoodFocus: [],
    whatToEatExact: null,
    whatToEatExactPage: 0,
    whatToEatSimilar: null,
    whatToEatSimilarPage: 0,
    whatToEatExhausted: false,
    whatToEatLoading: false,
    newShoppingText: "",
    shoppingList: [],
    shoppingSeeded: false,
    chatMessages: DEFAULT_CHAT_MESSAGES,
    chatDraft: "",
    isTyping: false,
    chatThreads: [],
    currentSessionId: null,
    stylingFridgeIndex: 0,
    fridgeMembers: [],
    fridgeMembersLoading: false,
    joinRequests: [],
    joinRequestsLoading: false,
    inviteSearchQuery: "",
    inviteSearchResults: [],
    inviteSearchLoading: false,
    myInvites: [],
    friendSearchQuery: "",
    friendSearchResults: [],
    friendSearchLoading: false,
    friendProfile: null,
    friendProfileLoading: false,
    undoMessage: null,
    syncError: null,
    notificationPrefs: { expiryAlerts: true, lowStock: true, recipeTips: true, weeklyDigest: false, crewActionsEnabled: false },
    notificationEvents: [],
    userGoal: null,
    organizerTally: null,
    scoreSnapshots: [],
    badges: [],
    badgeUnlockToast: null,
    kitchenScope: "all",
    inventorySortMode: "category",
    agentInsights: {},
    agentInsightLoading: {},
    agentAutoFetched: {},
    organizerSuggestedMoves: [],
    organizerMovesLoading: false,
  };
}

const UNDO_WINDOW_MS = 5000;

// Routes a free-form chat message to whichever agent persona actually fits it,
// instead of every message getting Chef's recipe-focused system prompt
// regardless of what's being asked. Falls back to Chef for general chit-chat,
// since that was the original default and works fine for anything ambiguous.
const AGENT_KEYWORDS: { agent: ChatAgentName; pattern: RegExp }[] = [
  { agent: "Guardian", pattern: /\b(expir(e|es|ing|ed|y)|spoil(ed|ing)?|go(es|ing)? bad|moldy|mold|smell(s|y)?|safe to eat|food safety|throw (it|them) out|how('?s| is)( my| the)? fridge( doing)?)\b/i },
  { agent: "Shopkeeper", pattern: /\b(buy|shopping|shopping list|restock|grocery|groceries|running low|need to (get|buy)|out of|purchase)\b/i },
  { agent: "Organizer", pattern: /\b(organi[sz]e|storage|store (it|them)|arrange|where should|which shelf|fridge vs freezer|freezer or fridge)\b/i },
  { agent: "Chef", pattern: /\b(cook|recipe|meal|make (for|tonight)|dinner|lunch|breakfast|dish|ingredients)\b/i },
];

export function routeChatAgent(message: string): ChatAgentName {
  for (const { agent, pattern } of AGENT_KEYWORDS) {
    if (pattern.test(message)) return agent;
  }
  return "Chef";
}

type Patch = Partial<ThatFridgeState> | ((s: ThatFridgeState) => Partial<ThatFridgeState>);

export function useThatFridge() {
  const [state, setState] = useState<ThatFridgeState>(initialState);
  const heroTouchX = useRef(0);
  const foodSwipeX = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const patch = useCallback((updater: Patch) => {
    setState((prev) => ({ ...prev, ...(typeof updater === "function" ? updater(prev) : updater) }));
  }, []);

  const setAuthMode = (mode: AuthMode) => patch({ authMode: mode, authError: null });
  const onAuthNameChange = (value: string) => patch({ authName: value });
  const onAuthUsernameChange = (value: string) => patch({ authUsername: value });
  const onAuthEmailChange = (value: string) => patch({ authEmail: value });
  const onAuthPasswordChange = (value: string) => patch({ authPassword: value });
  const onAuthConfirmPasswordChange = (value: string) => patch({ authConfirmPassword: value });
  const submitAuth = async () => {
    const email = state.authEmail.trim();
    const password = state.authPassword;
    if (!email || !password) return patch({ authError: "Enter your email and password." });

    if (state.authMode === "signup") {
      const name = state.authName.trim();
      if (!name) return patch({ authError: "Enter your name." });
      const username = state.authUsername.trim();
      if (!username) return patch({ authError: "Enter a username." });
      if (password !== state.authConfirmPassword) return patch({ authError: "Passwords don't match." });
      try {
        const { user } = await register(name, username, email, password);
        patch({
          isAuthenticated: true,
          isLoading: true,
          currentUser: user,
          authError: null,
          authPassword: "",
          authConfirmPassword: "",
        });
      } catch (err) {
        patch({ authError: describeError(err, "Couldn't create your account.") });
      }
      return;
    }

    try {
      const { user } = await login(email, password);
      patch({ isAuthenticated: true, isLoading: true, currentUser: user, authError: null, authPassword: "" });
    } catch (err) {
      patch({ authError: describeError(err, "Couldn't log you in.") });
    }
  };
  const signOut = async () => {
    try {
      await logout();
    } catch {
      // best-effort — the session is over locally regardless of whether the server call succeeds
    }
    clearToken();
    patch({
      isAuthenticated: false,
      currentUser: null,
      showProfilePanel: false,
      screen: "home",
      lastMainScreen: "home",
      authMode: "login",
      authName: "",
      authUsername: "",
      authEmail: "",
      authPassword: "",
      authConfirmPassword: "",
      authError: null,
      fridges: [],
      recipes: [],
      shoppingList: [],
      shoppingSeeded: false,
    });
  };

  // Restore a session from a stored token so a page refresh doesn't bounce to the login screen.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    patch({ isLoading: true });
    fetchMe()
      .then((user) => {
        if (cancelled) return;
        patch({ isAuthenticated: true, currentUser: user });
      })
      .catch(() => {
        if (cancelled) return;
        clearToken();
        patch({ isLoading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    let cancelled = false;
    Promise.all([
      fetchFridges(),
      fetchRecipes(),
      fetchShoppingItems(),
      fetchNotificationPrefs(),
      fetchNotificationEvents(),
      fetchChatHistory(),
      fetchUsageHistory(),
      fetchMemoryFacts(),
      fetchUserGoal(),
      fetchOrganizerTally(),
      fetchScoreSnapshots(),
      fetchBadges(),
      fetchMyInvites(),
    ]).then(
      ([
        fridges,
        recipes,
        shoppingList,
        notificationPrefs,
        notificationEvents,
        chatHistory,
        usageHistory,
        memoryFacts,
        userGoal,
        organizerTally,
        scoreSnapshots,
        badges,
        myInvites,
      ]) => {
        if (cancelled) return;
        const restoredChatMessages: ChatMessage[] = chatHistory.messages.flatMap((row) => [
          { id: `u${row.id}`, from: "user" as const, text: row.user_message },
          // A reply can be just the recipe card with no surrounding prose (agent_response ""),
          // so this can't gate on agent_response alone - that would silently drop the whole
          // bot message, card included, on restore.
          ...(row.agent_response || row.recipe_suggestion
            ? [{ id: `b${row.id}`, from: "bot" as const, text: row.agent_response ?? "", suggestedRecipe: row.recipe_suggestion }]
            : []),
        ]);
        patch({
          fridges,
          recipes,
          shoppingList,
          shoppingSeeded: true,
          notificationPrefs,
          isLoading: false,
          currentSessionId: chatHistory.session_id,
          notificationEvents: notificationEvents.slice().sort((a, b) => b.createdAt - a.createdAt),
          usageHistory,
          memoryFacts,
          userGoal,
          organizerTally,
          scoreSnapshots,
          badges,
          myInvites,
          ...(restoredChatMessages.length ? { chatMessages: restoredChatMessages } : {}),
        });
      }
    ).catch((err) => {
      if (cancelled) return;
      patch({ isLoading: false, syncError: describeError(err, "Couldn't load your fridge data.") });
    });
    return () => {
      cancelled = true;
    };
  }, [state.isAuthenticated, patch]);

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoActions = useRef<{ onCommit: () => void; onRestore: () => void } | null>(null);
  const qtyDebounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const badgeToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (badgeToastTimer.current) clearTimeout(badgeToastTimer.current);
      Object.values(qtyDebounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const scheduleUndo = (message: string, onRestore: () => void, onCommit: () => void = () => {}) => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoActions.current?.onCommit();
    }
    undoActions.current = { onCommit, onRestore };
    patch({ undoMessage: message });
    undoTimer.current = setTimeout(() => {
      undoActions.current?.onCommit();
      undoActions.current = null;
      undoTimer.current = null;
      patch({ undoMessage: null });
    }, UNDO_WINDOW_MS);
  };

  const undoLastRemoval = () => {
    if (!undoActions.current || !undoTimer.current) return;
    clearTimeout(undoTimer.current);
    undoActions.current.onRestore();
    undoActions.current = null;
    undoTimer.current = null;
    patch({ undoMessage: null });
  };

  const dismissSyncError = () => patch({ syncError: null });

  const setItemLocation = (id: string, location: StorageLocation) => {
    const prevLocation = findItem(state, id)?.item.location;
    patch((s) => ({
      fridges: s.fridges.map((f) => ({
        ...f,
        sections: f.sections.map((sec) => ({ ...sec, items: sec.items.map((it) => (it.id === id ? { ...it, location } : it)) })),
      })),
    }));
    updateItem(id, { location }).catch((err) => {
      patch((s) => ({
        fridges: s.fridges.map((f) => ({
          ...f,
          sections: f.sections.map((sec) => ({ ...sec, items: sec.items.map((it) => (it.id === id ? { ...it, location: prevLocation } : it)) })),
        })),
      }));
      patch({ syncError: describeError(err, "Couldn't update the item's location.") });
    });
  };

  const selectFridgeScope = (choice: number | "all") =>
    patch(choice === "all" ? { kitchenScope: "all" } : { kitchenScope: "active", activeFridge: choice, heroSlide: choice });
  const setInventorySortMode = (mode: "category" | "expiry" | "name") => patch({ inventorySortMode: mode });

  const selectHero = (i: number) =>
    patch((s) => ({ heroSlide: i, activeFridge: i < s.fridges.length ? i : s.activeFridge }));

  const onHeroSwipeStart = (e: React.TouchEvent) => {
    heroTouchX.current = e.touches[0].clientX;
  };
  const onHeroSwipeEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - heroTouchX.current;
    patch((s) => {
      const max = s.fridges.length;
      let next = s.heroSlide;
      if (dx < -40) next = Math.min(max, s.heroSlide + 1);
      else if (dx > 40) next = Math.max(0, s.heroSlide - 1);
      return { heroSlide: next, activeFridge: next < s.fridges.length ? next : s.activeFridge };
    });
  };

  const onNewFridgeNameChange = (value: string) => patch({ newFridgeName: value });
  const addFridge = async () => {
    const name = state.newFridgeName.trim() || "New Fridge";
    patch({ newFridgeName: "" });
    try {
      const fridge = await createFridge(name);
      patch((s) => {
        const fridges = [...s.fridges, fridge];
        return { fridges, heroSlide: fridges.length - 1, activeFridge: fridges.length - 1 };
      });
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't create the fridge.") });
    }
  };
  const onNewFridgeNameKeyDown = (key: string) => {
    if (key === "Enter") addFridge();
  };

  const openProfile = () => patch({ showProfilePanel: true });
  const closeProfile = () => patch({ showProfilePanel: false });
  const selectFridgeFromProfile = (i: number) =>
    patch({ kitchenScope: "active", activeFridge: i, heroSlide: i, showProfilePanel: false, screen: "home" });

  const openFindFriend = () => patch({ screen: "findFriend", showProfilePanel: false, friendSearchQuery: "", friendSearchResults: [] });
  const onFriendSearchChange = (value: string) => {
    patch({ friendSearchQuery: value });
    const q = value.trim();
    if (q.length < 2) {
      patch({ friendSearchResults: [], friendSearchLoading: false });
      return;
    }
    patch({ friendSearchLoading: true });
    searchUsers(q)
      .then((results) => patch({ friendSearchResults: results, friendSearchLoading: false }))
      .catch((err) => {
        patch({ friendSearchLoading: false, syncError: describeError(err, "Couldn't search right now.") });
      });
  };
  const openFriendProfile = (username: string) => {
    patch({ screen: "friendProfile", friendProfileLoading: true, friendProfile: null });
    fetchFriendProfile(username)
      .then((profile) => patch({ friendProfile: profile, friendProfileLoading: false }))
      .catch((err) => {
        patch({ friendProfileLoading: false, syncError: describeError(err, "Couldn't load that profile.") });
      });
  };
  // Back from a friend's profile to the search results - unlike openFindFriend, doesn't
  // reset the query/results, so the list the user tapped into is still there.
  const closeFriendProfile = () => patch({ screen: "findFriend" });
  const sendJoinRequest = (fridgeId: string) => {
    if (!state.friendProfile) return;
    const prevProfile = state.friendProfile;
    patch((s) => ({
      friendProfile: s.friendProfile
        ? { ...s.friendProfile, fridges: s.friendProfile.fridges.map((f) => (f.id === fridgeId ? { ...f, requestStatus: "pending" } : f)) }
        : s.friendProfile,
    }));
    requestJoinFridge(fridgeId).catch((err) => {
      patch({ friendProfile: prevProfile, syncError: describeError(err, "Couldn't send that request.") });
    });
  };
  // Favoriting from a friend's profile only updates state.friendProfile, not state.recipes -
  // the recipe shows up in the user's own Food Hub / Favorites tab on next fetch, matching
  // this app's existing reload-based (not real-time) sync elsewhere.
  const toggleFavoriteFriendRecipe = (recipeId: string) => {
    if (!state.friendProfile) return;
    const prevProfile = state.friendProfile;
    const recipe = state.friendProfile.recipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    const nextFavorite = !recipe.isFavorite;
    patch((s) => ({
      friendProfile: s.friendProfile
        ? { ...s.friendProfile, recipes: s.friendProfile.recipes.map((r) => (r.id === recipeId ? { ...r, isFavorite: nextFavorite } : r)) }
        : s.friendProfile,
    }));
    (nextFavorite ? favoriteRecipe(recipeId) : unfavoriteRecipe(recipeId)).catch((err) => {
      patch({ friendProfile: prevProfile, syncError: describeError(err, "Couldn't update favorites.") });
    });
  };

  const openNotifications = () => patch({ screen: "notifications", showProfilePanel: false });
  const openNotificationHistory = () => patch({ screen: "notificationHistory" });
  const dismissNotificationWithUndo = (id: string) => {
    const event = state.notificationEvents.find((n) => n.id === id);
    if (!event || event.done) return;
    patch((s) => ({ notificationEvents: s.notificationEvents.map((n) => (n.id === id ? { ...n, done: true } : n)) }));
    scheduleUndo(
      `Cleared "${event.message}"`,
      () => {
        patch((s) => ({ notificationEvents: s.notificationEvents.map((n) => (n.id === id ? { ...n, done: false } : n)) }));
      },
      () => {
        updateNotificationEvent(id, { done: true }).catch((err) => {
          patch((s) => ({ notificationEvents: s.notificationEvents.map((n) => (n.id === id ? { ...n, done: false } : n)) }));
          patch({ syncError: describeError(err, "Couldn't clear the notification.") });
        });
      }
    );
  };
  const openAbout = () => patch({ screen: "about", showProfilePanel: false });
  const toggleNotificationPref = (key: keyof NotificationPrefs) => {
    const prevValue = state.notificationPrefs[key];
    patch((s) => ({ notificationPrefs: { ...s.notificationPrefs, [key]: !s.notificationPrefs[key] } }));
    updateNotificationPrefs({ [key]: !prevValue }).catch((err) => {
      patch((s) => ({ notificationPrefs: { ...s.notificationPrefs, [key]: prevValue } }));
      patch({ syncError: describeError(err, "Couldn't save your notification settings.") });
    });
  };

  const openGoals = () => patch({ screen: "goals", showProfilePanel: false });
  const openBadges = () => patch({ screen: "badges", showProfilePanel: false });

  // Guarded by "already earned?" so an action that can fire repeatedly (e.g. every Mark-as-made
  // "finished" near-expiry item) doesn't spam a network call once the badge is done. The 4s
  // auto-dismiss mirrors the undo toast's timing without reusing its restore/commit machinery,
  // since a badge unlock has no "undo".
  const awardBadgeProgress = (badgeKey: BadgeKey, incrementBy: number = 1) => {
    if (state.badges.find((b) => b.badgeKey === badgeKey)?.earnedAt) return;
    postBadgeProgress(badgeKey, incrementBy)
      .then((badge) => {
        const wasUnearned = !state.badges.find((b) => b.badgeKey === badgeKey)?.earnedAt;
        patch((s) => ({ badges: s.badges.some((b) => b.badgeKey === badgeKey) ? s.badges.map((b) => (b.badgeKey === badgeKey ? badge : b)) : [...s.badges, badge] }));
        if (wasUnearned && badge.earnedAt) {
          const label = BADGE_CATALOG.find((b) => b.key === badgeKey)?.label ?? badgeKey;
          patch({ badgeUnlockToast: `Badge unlocked: ${label}` });
          if (badgeToastTimer.current) clearTimeout(badgeToastTimer.current);
          badgeToastTimer.current = setTimeout(() => patch({ badgeUnlockToast: null }), 4000);
        }
      })
      .catch(() => {
        // Best-effort - a badge is a nice-to-have, not worth surfacing a sync error banner for.
      });
  };
  const updateUserGoalSettings = (input: UserGoalInput) => {
    const prevGoal = state.userGoal;
    patch((s) => ({ userGoal: s.userGoal ? { ...s.userGoal, ...input } : s.userGoal }));
    updateUserGoal(input)
      .then((goal) => patch({ userGoal: goal }))
      .catch((err) => {
        patch({ userGoal: prevGoal, syncError: describeError(err, "Couldn't update your goal.") });
      });
  };

  const openAIDataSettings = () => patch({ screen: "aiData", showProfilePanel: false });
  const deleteChatThread = (id: string) => {
    patch((s) => ({ chatThreads: s.chatThreads.filter((t) => t.id !== id) }));
    deleteChatSession(id).catch((err) => {
      // Restoring the exact original list on failure isn't worth the complexity here -
      // a re-open of Chat History re-fetches the real list anyway.
      patch({ syncError: describeError(err, "Couldn't delete that conversation.") });
    });
    if (state.currentSessionId === id) {
      patch({ chatMessages: DEFAULT_CHAT_MESSAGES, currentSessionId: null });
    }
  };
  const clearAllChatData = () =>
    patch({
      chatThreads: [],
      chatMessages: DEFAULT_CHAT_MESSAGES,
      chatDraft: "",
      isTyping: false,
      currentSessionId: null,
    });
  const deleteUsageHistoryEntry = (id: string) => {
    patch((s) => ({ usageHistory: s.usageHistory.filter((h) => h.id !== id) }));
    deleteUsageHistoryEntryApi(id).catch((err) => patch({ syncError: describeError(err, "Couldn't remove that entry.") }));
  };
  const clearUsageHistory = () => {
    patch({ usageHistory: [] });
    clearUsageHistoryApi().catch((err) => patch({ syncError: describeError(err, "Couldn't clear personalization memory.") }));
  };
  const deleteMemoryFact = (index: number) => {
    patch((s) => ({ memoryFacts: s.memoryFacts.filter((_, i) => i !== index) }));
    deleteMemoryFactApi(index).catch((err) => patch({ syncError: describeError(err, "Couldn't remove that memory.") }));
  };
  const clearMemoryFacts = () => {
    patch({ memoryFacts: [] });
    clearMemoryFactsApi().catch((err) => patch({ syncError: describeError(err, "Couldn't clear memory.") }));
  };

  const openStylePicker = (i: number) => {
    patch({
      stylingFridgeIndex: i,
      screen: "fridgeStyle",
      fridgeMembers: [],
      fridgeMembersLoading: true,
      joinRequests: [],
      joinRequestsLoading: false,
      inviteSearchQuery: "",
      inviteSearchResults: [],
    });
    const fridge = state.fridges[i];
    if (!fridge) {
      patch({ fridgeMembersLoading: false });
      return;
    }
    fetchFridgeMembers(fridge.id)
      .then((members) => patch({ fridgeMembers: members, fridgeMembersLoading: false }))
      .catch((err) => {
        patch({ fridgeMembersLoading: false, syncError: describeError(err, "Couldn't load the fridge's members.") });
      });

    // Only the owner can see/act on join requests - no point fetching them for a member.
    if (fridge.role === "owner") {
      patch({ joinRequestsLoading: true });
      fetchJoinRequests(fridge.id)
        .then((requests) => patch({ joinRequests: requests, joinRequestsLoading: false }))
        .catch((err) => {
          patch({ joinRequestsLoading: false, syncError: describeError(err, "Couldn't load join requests.") });
        });
    }
  };
  const closeStylePicker = () => patch({ screen: "home" });

  const approveJoinRequestAction = (id: string) => {
    const fridge = state.fridges[state.stylingFridgeIndex];
    if (!fridge) return;
    const prevRequests = state.joinRequests;
    const prevMembers = state.fridgeMembers;
    const request = prevRequests.find((r) => r.id === id);
    patch((s) => ({
      joinRequests: s.joinRequests.filter((r) => r.id !== id),
      fridges: s.fridges.map((f) => (f.id === fridge.id ? { ...f, memberCount: (f.memberCount ?? prevMembers.length) + 1 } : f)),
      fridgeMembers: request
        ? [...s.fridgeMembers, { id: request.requesterId, name: request.requesterName, username: request.requesterUsername, email: "", role: "member" as const, joinedAt: Date.now() }]
        : s.fridgeMembers,
    }));
    approveJoinRequest(id).catch((err) => {
      patch((s) => ({
        joinRequests: prevRequests,
        fridgeMembers: prevMembers,
        fridges: s.fridges.map((f) => (f.id === fridge.id ? { ...f, memberCount: prevMembers.length } : f)),
      }));
      patch({ syncError: describeError(err, "Couldn't approve that request.") });
    });
  };
  const declineJoinRequestAction = (id: string) => {
    const prevRequests = state.joinRequests;
    patch((s) => ({ joinRequests: s.joinRequests.filter((r) => r.id !== id) }));
    declineJoinRequest(id).catch((err) => {
      patch({ joinRequests: prevRequests, syncError: describeError(err, "Couldn't decline that request.") });
    });
  };

  const onInviteSearchChange = (value: string) => {
    patch({ inviteSearchQuery: value });
    const q = value.trim();
    if (q.length < 2) {
      patch({ inviteSearchResults: [], inviteSearchLoading: false });
      return;
    }
    patch({ inviteSearchLoading: true });
    searchUsers(q)
      .then((results) => patch({ inviteSearchResults: results, inviteSearchLoading: false }))
      .catch((err) => {
        patch({ inviteSearchLoading: false, syncError: describeError(err, "Couldn't search right now.") });
      });
  };
  const sendFridgeInvite = (userId: string) => {
    const fridge = state.fridges[state.stylingFridgeIndex];
    if (!fridge) return Promise.reject(new Error("No fridge selected"));
    return inviteToFridge(fridge.id, userId).catch((err) => {
      patch({ syncError: describeError(err, "Couldn't send that invite.") });
      throw err;
    });
  };

  // Accepting/declining an invite reuses the same approve/decline endpoints a fridge owner
  // uses on an incoming request - the backend authorizes each side by who initiated the row.
  // The newly-joined fridge itself shows up in state.fridges on next reload, consistent with
  // this app's existing reload-based (not real-time) sync elsewhere.
  const acceptMyInvite = (id: string) => {
    const prevInvites = state.myInvites;
    patch((s) => ({ myInvites: s.myInvites.filter((i) => i.id !== id) }));
    approveJoinRequest(id).catch((err) => {
      patch({ myInvites: prevInvites, syncError: describeError(err, "Couldn't accept that invite.") });
    });
  };
  const declineMyInvite = (id: string) => {
    const prevInvites = state.myInvites;
    patch((s) => ({ myInvites: s.myInvites.filter((i) => i.id !== id) }));
    declineJoinRequest(id).catch((err) => {
      patch({ myInvites: prevInvites, syncError: describeError(err, "Couldn't decline that invite.") });
    });
  };

  const removeFridgeMemberAction = (userId: string) => {
    const fridge = state.fridges[state.stylingFridgeIndex];
    if (!fridge) return;
    const prevMembers = state.fridgeMembers;
    patch((s) => ({ fridgeMembers: s.fridgeMembers.filter((m) => m.id !== userId), fridges: s.fridges.map((f) => (f.id === fridge.id ? { ...f, memberCount: Math.max(0, (f.memberCount ?? prevMembers.length) - 1) } : f)) }));
    apiRemoveFridgeMember(fridge.id, userId).catch((err) => {
      patch((s) => ({ fridgeMembers: prevMembers, fridges: s.fridges.map((f) => (f.id === fridge.id ? { ...f, memberCount: prevMembers.length } : f)) }));
      patch({ syncError: describeError(err, "Couldn't remove that member.") });
    });
  };

  const leaveFridgeAction = (index: number) => {
    const fridge = state.fridges[index];
    if (!fridge || state.fridges.length <= 1) return;
    patch((s) => {
      const fridges = s.fridges.filter((_, i) => i !== index);
      let activeFridge = s.activeFridge;
      if (index < s.activeFridge) activeFridge -= 1;
      else if (index === s.activeFridge) activeFridge = Math.max(0, index - 1);
      activeFridge = Math.min(activeFridge, fridges.length - 1);
      return { fridges, activeFridge, heroSlide: activeFridge, screen: "home" };
    });
    apiLeaveFridge(fridge.id).catch((err) => {
      patch((s) => ({ fridges: [...s.fridges.slice(0, index), fridge, ...s.fridges.slice(index)] }));
      patch({ syncError: describeError(err, "Couldn't leave the fridge.") });
    });
  };
  const selectFridgeStyle = (key: FridgeStyleKey) => {
    const index = state.stylingFridgeIndex;
    const fridge = state.fridges[index];
    const prevStyle = fridge?.style;
    patch((s) => ({
      fridges: s.fridges.map((f, i) => (i === index ? { ...f, style: key } : f)),
      screen: "home",
    }));
    if (!fridge) return;
    updateFridge(fridge.id, { style: key }).catch((err) => {
      patch((s) => ({ fridges: s.fridges.map((f, i) => (i === index ? { ...f, style: prevStyle } : f)) }));
      patch({ syncError: describeError(err, "Couldn't save the fridge style.") });
    });
  };

  const updateFridgePhoto = (photoUrl: string) => {
    const index = state.stylingFridgeIndex;
    const fridge = state.fridges[index];
    if (!fridge) return;
    const prevPhotoUrl = fridge.photoUrl;
    patch((s) => ({ fridges: s.fridges.map((f, i) => (i === index ? { ...f, style: "custom", photoUrl } : f)), screen: "home" }));
    updateFridge(fridge.id, { style: "custom", photo_url: photoUrl }).catch((err) => {
      patch((s) => ({ fridges: s.fridges.map((f, i) => (i === index ? { ...f, photoUrl: prevPhotoUrl } : f)) }));
      patch({ syncError: describeError(err, "Couldn't save the fridge photo.") });
    });
  };

  const renameFridge = (name: string) =>
    patch((s) => ({ fridges: s.fridges.map((f, i) => (i === s.stylingFridgeIndex ? { ...f, name } : f)) }));
  const renameFridgeBlur = () => {
    const index = state.stylingFridgeIndex;
    const fridge = state.fridges[index];
    if (!fridge) return;
    const name = fridge.name.trim() || "My Fridge";
    patch((s) => ({
      fridges: s.fridges.map((f, i) => (i === index && !f.name.trim() ? { ...f, name: "My Fridge" } : f)),
    }));
    updateFridge(fridge.id, { name }).catch((err) => {
      patch({ syncError: describeError(err, "Couldn't save the fridge name.") });
    });
  };
  const deleteFridge = (index: number) => {
    const fridge = state.fridges[index];
    if (!fridge || state.fridges.length <= 1) return;
    patch((s) => {
      const fridges = s.fridges.filter((_, i) => i !== index);
      let activeFridge = s.activeFridge;
      if (index < s.activeFridge) activeFridge -= 1;
      else if (index === s.activeFridge) activeFridge = Math.max(0, index - 1);
      activeFridge = Math.min(activeFridge, fridges.length - 1);
      return { fridges, activeFridge, heroSlide: activeFridge, screen: "home" };
    });
    apiDeleteFridge(fridge.id).catch((err) => {
      patch((s) => ({ fridges: [...s.fridges.slice(0, index), fridge, ...s.fridges.slice(index)] }));
      patch({ syncError: describeError(err, "Couldn't delete the fridge.") });
    });
  };

  const openSearch = () => patch({ screen: "search", searchQuery: "" });

  const ensureShoppingSeed = () => {
    patch((s) => {
      if (s.shoppingSeeded) return {};
      const lowStock = (s.fridges[s.activeFridge]?.sections || [])
        .flatMap((sec) => sec.items)
        .filter((i) => i.qty <= 2);
      const seeded: ShoppingItem[] = lowStock.map((i) => ({
        id: "ls-" + i.id,
        name: i.name,
        icon: i.icon,
        section: ICON_SECTION[i.icon] || "other",
        checked: false,
      }));
      return { shoppingList: seeded, shoppingSeeded: true };
    });
  };
  const openFoodHubTab = (tab: FoodSubtab) => {
    ensureShoppingSeed();
    patch({ screen: "foodHub", foodSubtab: tab });
  };
  const openRecipesHub = () => openFoodHubTab("recipes");
  const openShoppingHub = () => openFoodHubTab("shopping");
  const openGuardianTab = () => openFoodHubTab("guardian");
  const openOrganizerTab = () => openFoodHubTab("organizer");
  const selectFoodTab = (tab: FoodSubtab) => patch({ foodSubtab: tab });

  const onSwipeStart = (e: React.TouchEvent) => {
    foodSwipeX.current = e.touches[0].clientX;
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - foodSwipeX.current;
    if (Math.abs(dx) <= 40) return;
    patch((s) => {
      const idx = FOOD_TAB_ORDER.indexOf(s.foodSubtab);
      const nextIdx = dx < 0 ? Math.min(FOOD_TAB_ORDER.length - 1, idx + 1) : Math.max(0, idx - 1);
      return { foodSubtab: FOOD_TAB_ORDER[nextIdx] };
    });
  };

  const openRecipeDetail = (id: string) => patch({ screen: "recipeDetail", selectedRecipeId: id });
  const closeRecipeDetail = () => patch({ screen: "foodHub" });

  const toggleFavoriteRecipe = (id: string) => {
    const recipe = state.recipes.find((r) => r.id === id);
    if (!recipe) return;
    const nextFavorite = !recipe.isFavorite;
    patch((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? { ...r, isFavorite: nextFavorite } : r)) }));
    (nextFavorite ? favoriteRecipe(id) : unfavoriteRecipe(id)).catch((err) => {
      patch((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? { ...r, isFavorite: !nextFavorite } : r)) }));
      patch({ syncError: describeError(err, "Couldn't update favorites.") });
    });
  };

  const openNewRecipeForm = () =>
    patch({
      screen: "recipeForm",
      recipeFormId: null,
      recipeFormName: "",
      recipeFormMinutes: "20",
      recipeFormCategory: null,
      recipeFormIngredients: [{ icon: "leftovers", name: "" }],
      recipeFormSteps: [""],
      recipeFormAttachments: [],
      recipeFormAttachmentUploading: false,
      recipeFormLinkUrl: "",
      recipeFormLinkImporting: false,
      recipeFormLinkError: null,
      recipeFormLinkImported: false,
    });

  const openEditRecipeForm = (id: string) => {
    const recipe = state.recipes.find((r) => r.id === id);
    if (!recipe || !recipe.isMine) return;
    patch({
      screen: "recipeForm",
      recipeFormId: id,
      recipeFormName: recipe.name,
      recipeFormMinutes: String(recipe.minutes),
      recipeFormCategory: recipe.category,
      recipeFormIngredients: recipe.ingredients.map((ing) => ({ ...ing })),
      recipeFormSteps: [...recipe.steps],
      recipeFormAttachments: recipe.attachments.map((a) => ({ ...a })),
      recipeFormAttachmentUploading: false,
      recipeFormLinkUrl: "",
      recipeFormLinkImporting: false,
      recipeFormLinkError: null,
      recipeFormLinkImported: false,
    });
  };

  const closeRecipeForm = () => patch({ screen: state.recipeFormId ? "recipeDetail" : "foodHub" });

  const onRecipeFormNameChange = (value: string) => patch({ recipeFormName: value });
  const onRecipeFormMinutesChange = (value: string) => patch({ recipeFormMinutes: value });
  const onRecipeFormCategoryChange = (value: RecipeCategory | null) => patch({ recipeFormCategory: value });

  const addRecipeFormIngredient = () =>
    patch((s) => ({ recipeFormIngredients: [...s.recipeFormIngredients, { icon: "leftovers", name: "" }] }));
  const removeRecipeFormIngredient = (index: number) =>
    patch((s) => ({ recipeFormIngredients: s.recipeFormIngredients.filter((_, i) => i !== index) }));
  const onRecipeFormIngredientNameChange = (index: number, value: string) =>
    patch((s) => ({
      recipeFormIngredients: s.recipeFormIngredients.map((ing, i) =>
        i === index ? { name: value, icon: guessIcon(value) || ing.icon } : ing
      ),
    }));

  const addRecipeFormStep = () => patch((s) => ({ recipeFormSteps: [...s.recipeFormSteps, ""] }));
  const removeRecipeFormStep = (index: number) =>
    patch((s) => ({ recipeFormSteps: s.recipeFormSteps.filter((_, i) => i !== index) }));
  const onRecipeFormStepChange = (index: number, value: string) =>
    patch((s) => ({ recipeFormSteps: s.recipeFormSteps.map((step, i) => (i === index ? value : step)) }));

  const isRecipeFormValid = () =>
    !!state.recipeFormName.trim() &&
    state.recipeFormIngredients.some((ing) => ing.name.trim()) &&
    state.recipeFormSteps.some((s) => s.trim());

  const onRecipeFormLinkUrlChange = (value: string) => patch({ recipeFormLinkUrl: value, recipeFormLinkError: null });

  const LINK_IMPORT_ERROR_MESSAGES: Record<string, string> = {
    no_api_key: "Link import isn't set up on this server yet.",
    unsafe_url: "That link can't be used.",
    fetch_failed: "Couldn't open that link.",
    not_recognized: "Couldn't find a recipe on that page.",
  };

  // Prefills the open form for review rather than saving straight away, so an import that
  // gets something wrong (or picks the wrong recipe off a page with several) is a quick edit
  // instead of a silent bad save - the user still has to hit the existing Save button.
  const importRecipeFormLink = async () => {
    const url = state.recipeFormLinkUrl.trim();
    if (!url || state.recipeFormLinkImporting) return;
    patch({ recipeFormLinkImporting: true, recipeFormLinkError: null });
    try {
      const result = await importRecipeFromLink(url);
      if (result.found && result.recipe) {
        const suggestion = result.recipe;
        patch({
          recipeFormName: suggestion.name,
          recipeFormMinutes: String(suggestion.minutes),
          recipeFormCategory: suggestion.category,
          recipeFormIngredients: suggestion.ingredients.map((ing) => ({ icon: guessIcon(ing.name) || "leftovers", name: ing.name })),
          recipeFormSteps: [...suggestion.steps],
          recipeFormLinkUrl: "",
          recipeFormLinkImporting: false,
          recipeFormLinkError: null,
          recipeFormLinkImported: true,
        });
      } else {
        patch({
          recipeFormLinkImporting: false,
          recipeFormLinkError: LINK_IMPORT_ERROR_MESSAGES[result.reason ?? ""] ?? "Couldn't find a recipe on that page.",
        });
      }
    } catch (err) {
      patch({ recipeFormLinkImporting: false, recipeFormLinkError: describeError(err, "Couldn't import that link.") });
    }
  };

  const addRecipeFormAttachment = async (file: File) => {
    patch({ recipeFormAttachmentUploading: true });
    try {
      const attachment = await uploadRecipeAttachment(file);
      patch((s) => ({ recipeFormAttachments: [...s.recipeFormAttachments, attachment], recipeFormAttachmentUploading: false }));
    } catch (err) {
      patch({ recipeFormAttachmentUploading: false, syncError: describeError(err, "Couldn't upload that file.") });
    }
  };

  const removeRecipeFormAttachment = (index: number) =>
    patch((s) => ({ recipeFormAttachments: s.recipeFormAttachments.filter((_, i) => i !== index) }));

  const saveRecipeForm = async () => {
    const name = state.recipeFormName.trim();
    if (!name) return;
    const minutes = Math.max(1, parseInt(state.recipeFormMinutes, 10) || 1);
    const ingredients = state.recipeFormIngredients
      .map((ing) => ({ ...ing, name: ing.name.trim() }))
      .filter((ing) => ing.name);
    const steps = state.recipeFormSteps.map((s) => s.trim()).filter(Boolean);
    if (!ingredients.length || !steps.length) return;

    const payload = { name, minutes, category: state.recipeFormCategory, ingredients, steps, attachments: state.recipeFormAttachments };

    try {
      if (state.recipeFormId) {
        const updated = await updateRecipe(state.recipeFormId, payload);
        patch((s) => ({
          recipes: s.recipes.map((r) => (r.id === updated.id ? updated : r)),
          screen: "recipeDetail",
          selectedRecipeId: updated.id,
        }));
      } else {
        const created = await createRecipe(payload);
        patch((s) => ({ recipes: [...s.recipes, created], screen: "recipeDetail", selectedRecipeId: created.id }));
        if (state.recipeFormLinkImported) awardBadgeProgress("first_link_recipe", 1);
      }
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't save the recipe.") });
    }
  };

  // Chef's chat replies can carry a structured recipe_suggestion (see
  // AgentService::extractRecipeSuggestion on the backend) that renders as a card with an "Add
  // to recipes" action - this turns that into a real saved custom recipe, same endpoint
  // RecipeFormSheet uses. Ingredient icons are guessed the same way manual entry does
  // (guessIcon, "leftovers" fallback), since the model only knows plain ingredient names, not
  // this app's icon key vocabulary.
  const addSuggestedRecipeToLibrary = async (suggestion: RecipeSuggestion) => {
    const payload = {
      name: suggestion.name,
      minutes: suggestion.minutes,
      category: suggestion.category,
      ingredients: suggestion.ingredients.map((ing) => ({ icon: guessIcon(ing.name) || "leftovers", name: ing.name })),
      steps: suggestion.steps,
    };
    try {
      const created = await createRecipe(payload);
      patch((s) => ({ recipes: [...s.recipes, created] }));
      return created;
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't save that recipe.") });
      return null;
    }
  };

  const deleteCustomRecipe = (id: string) => {
    const recipe = state.recipes.find((r) => r.id === id);
    if (!recipe || !recipe.isMine) return;
    patch({ recipes: state.recipes.filter((r) => r.id !== id), screen: "foodHub", selectedRecipeId: null });
    apiDeleteRecipe(id).catch((err) => {
      patch((s) => ({ recipes: [...s.recipes, recipe] }));
      patch({ syncError: describeError(err, "Couldn't delete the recipe.") });
    });
  };

  // "Mark as made": ingredient -> specific-inventory-item matching doesn't exist anywhere
  // else in the app (the existing "have" check on a recipe's ingredientsView is icon-only, a
  // boolean, not a specific item) - built here by icon match, picking the soonest-expiring
  // item when more than one shares an icon (the one most worth using), skipping ingredients
  // with no match at all. Each ingredient gets its own row (even if two ingredients share an
  // icon and resolve to the same fridge item), keyed by a per-row `id` rather than the item id
  // so rows can be toggled/removed independently of each other. If two rows for the same
  // physical item end up with different statuses, "finished" wins on confirm - the item can't
  // actually be both used up and left in the fridge. Shown as a pre-checked confirm list the
  // user can adjust; only confirming actually commits anything.
  const openMarkRecipeMade = (recipeId: string) => {
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe) return;
    const items = getScopedItems(state);
    const candidates: { id: string; ingredientName: string; itemId: string; itemName: string; icon: string }[] = [];
    let rowCount = 0;
    for (const ing of recipe.ingredients) {
      const matches = items.filter((i) => i.icon === ing.icon);
      if (!matches.length) continue;
      const soonestExpiring = matches.reduce((a, b) => (b.days < a.days ? b : a));
      candidates.push({ id: `row-${rowCount++}`, ingredientName: ing.name, itemId: soonestExpiring.id, itemName: soonestExpiring.name, icon: soonestExpiring.icon });
    }
    patch({
      markMadeRecipeId: recipeId,
      markMadeCandidates: candidates,
      markMadeStatus: Object.fromEntries(candidates.map((c) => [c.id, "finished" as const])),
    });
  };
  const setMarkMadeStatus = (rowId: string, status: "finished" | "remaining") =>
    patch((s) => ({ markMadeStatus: { ...s.markMadeStatus, [rowId]: status } }));
  const removeMarkMadeCandidate = (rowId: string) =>
    patch((s) => {
      const rest = { ...s.markMadeStatus };
      delete rest[rowId];
      return { markMadeCandidates: s.markMadeCandidates.filter((c) => c.id !== rowId), markMadeStatus: rest };
    });
  const closeMarkRecipeMade = () => patch({ markMadeRecipeId: null, markMadeCandidates: [], markMadeStatus: {} });
  const confirmMarkMade = () => {
    const recipeId = state.markMadeRecipeId;
    const candidates = state.markMadeCandidates;
    const statusById = state.markMadeStatus;
    patch({ markMadeRecipeId: null, markMadeCandidates: [], markMadeStatus: {} });

    if (recipeId) markRecipeMade(recipeId).catch(() => {});

    const itemIds = Array.from(new Set(candidates.map((c) => c.itemId)));
    for (const itemId of itemIds) {
      const rowStatuses = candidates.filter((c) => c.itemId === itemId).map((c) => statusById[c.id]);
      const finalStatus = rowStatuses.includes("finished") ? "finished" : "remaining";
      if (finalStatus === "remaining") {
        markItemOpenedById(itemId);
        continue;
      }
      const found = findItem(state, itemId);
      if (!found) continue;
      const { item, section, fridgeIndex } = found;
      patch((s) => ({
        fridges: s.fridges.map((f, i) =>
          i === fridgeIndex
            ? { ...f, sections: f.sections.map((sec) => (sec.id === section.id ? { ...sec, items: sec.items.filter((it) => it.id !== itemId) } : sec)) }
            : f
        ),
      }));
      recordUsage(item.name, item.icon, item.days, item.freshness, item.nutritionCategory);
      deleteItem(itemId).catch((err) => patch({ syncError: describeError(err, "Couldn't update the fridge for one of the items.") }));
      if (item.days >= 0 && item.days <= 3) awardBadgeProgress("rescued_10", 1);
    }
  };

  const openWhatToEat = () =>
    patch({
      whatToEatOpen: true,
      whatToEatMealType: null,
      whatToEatVibes: [],
      whatToEatFoodFocus: [],
      whatToEatExact: null,
      whatToEatExactPage: 0,
      whatToEatSimilar: null,
      whatToEatSimilarPage: 0,
      whatToEatExhausted: false,
    });
  const closeWhatToEat = () => patch({ whatToEatOpen: false });
  const toggleWhatToEatMealType = (mealType: MealType) =>
    patch((s) => ({ whatToEatMealType: s.whatToEatMealType === mealType ? null : mealType }));
  const toggleWhatToEatVibe = (vibe: Vibe) =>
    patch((s) => ({ whatToEatVibes: s.whatToEatVibes.includes(vibe) ? s.whatToEatVibes.filter((v) => v !== vibe) : [...s.whatToEatVibes, vibe] }));
  const toggleWhatToEatFoodFocus = (foodFocus: FoodFocus) =>
    patch((s) => ({
      whatToEatFoodFocus: s.whatToEatFoodFocus.includes(foodFocus)
        ? s.whatToEatFoodFocus.filter((f) => f !== foodFocus)
        : [...s.whatToEatFoodFocus, foodFocus],
    }));
  const findMeals = async () => {
    patch({ whatToEatLoading: true });
    try {
      const result = await suggestRecipes({ mealType: state.whatToEatMealType, vibes: state.whatToEatVibes, foodFocus: state.whatToEatFoodFocus });
      patch({
        // Shuffled once here, on arrival - each tier's Shuffle button then just pages through
        // this same fixed order (see shuffleMeals) instead of re-randomizing every press, so
        // it never risks showing the same 3 twice before you've seen everything.
        whatToEatExact: shuffleArray(result.exact),
        whatToEatExactPage: 0,
        whatToEatSimilar: shuffleArray(result.similar),
        whatToEatSimilarPage: 0,
        whatToEatExhausted: result.exhausted,
        whatToEatLoading: false,
      });
    } catch (err) {
      patch({ whatToEatLoading: false, syncError: describeError(err, "Couldn't find any meals right now.") });
    }
  };
  const shuffleMeals = (tier: "exact" | "similar") => {
    const items = tier === "exact" ? state.whatToEatExact : state.whatToEatSimilar;
    const total = items?.length ?? 0;
    if (total <= 3) return;
    const pageCount = Math.ceil(total / 3);
    if (tier === "exact") {
      patch((s) => ({ whatToEatExactPage: (s.whatToEatExactPage + 1) % pageCount }));
    } else {
      patch((s) => ({ whatToEatSimilarPage: (s.whatToEatSimilarPage + 1) % pageCount }));
    }
  };
  // "Ask Chef instead" - reuses the existing Chef chat pipeline rather than inventing a second
  // recipe-generation path server-side, but builds a message from whatever meal_type/vibes/
  // food_focus were selected so Chef's answer still honors the user's picks even for recipes
  // outside the tagged pool (and can draw on ingredients the saved-recipe search can't see).
  // Offered both when the search comes up empty and, via the sheet's bottom "still nothing
  // sound good?" prompt, when there are results but none of them appeal.
  const askChefInstead = () => {
    const message = buildWhatToEatChatPrompt(state.whatToEatMealType, state.whatToEatVibes, state.whatToEatFoodFocus);
    patch({ whatToEatOpen: false, screen: "chat" });
    sendChat(message);
  };

  const onNewShoppingChange = (value: string) => patch({ newShoppingText: value });
  const addShoppingItem = async () => {
    const name = state.newShoppingText.trim();
    if (!name) return;
    patch({ newShoppingText: "" });
    try {
      const entry = await createShoppingItem({ name, icon: null, section: "other" });
      patch((s) => ({ shoppingList: [...s.shoppingList, entry] }));
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't add the shopping item.") });
    }
  };
  const onNewShoppingKeyDown = (key: string) => {
    if (key === "Enter") addShoppingItem();
  };
  const toggleShoppingItem = (id: string) => {
    const current = state.shoppingList.find((i) => i.id === id);
    if (!current) return;
    patch((s) => ({ shoppingList: s.shoppingList.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)) }));
    updateShoppingItem(id, { checked: !current.checked }).catch((err) => {
      patch((s) => ({ shoppingList: s.shoppingList.map((i) => (i.id === id ? { ...i, checked: current.checked } : i)) }));
      patch({ syncError: describeError(err, "Couldn't update the shopping item.") });
    });
  };
  const removeShoppingItem = (id: string) => {
    patch((s) => ({ shoppingList: s.shoppingList.filter((i) => i.id !== id) }));
    deleteShoppingItem(id).catch((err) => patch({ syncError: describeError(err, "Couldn't remove the shopping item.") }));
  };
  const clearBought = async () => {
    const bought = state.shoppingList.filter((i) => i.checked);
    if (!bought.length) return;
    patch((s) => ({ shoppingList: s.shoppingList.filter((i) => !i.checked) }));
    const results = await Promise.allSettled(bought.map((i) => deleteShoppingItem(i.id)));
    const failedCount = results.filter((r) => r.status === "rejected").length;
    if (failedCount) patch({ syncError: `Couldn't clear ${failedCount} item${failedCount > 1 ? "s" : ""}.` });
  };

  const addPredictedToShopping = async (name: string, icon: string) => {
    if (state.shoppingList.some((i) => !i.checked && i.name.toLowerCase() === name.toLowerCase())) return;
    try {
      const entry = await createShoppingItem({ name, icon, section: ICON_SECTION[icon] || "other" });
      patch((s) => ({ shoppingList: [...s.shoppingList, entry] }));
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't add the suggestion.") });
    }
  };

  const onSearchChange = (value: string) => patch({ searchQuery: value });

  const onDraftChange = (value: string) => patch({ chatDraft: value });
  const startNewChat = () =>
    patch({
      chatMessages: DEFAULT_CHAT_MESSAGES,
      chatDraft: "",
      isTyping: false,
      currentSessionId: null, // next message starts a fresh session server-side
    });
  const openChatHistory = () => {
    patch({ screen: "chatHistory" });
    fetchChatSessions()
      .then((sessions) => {
        const threads: ChatThread[] = sessions.map((s) => ({
          id: s.session_id,
          title: deriveThreadTitle(s.first_message),
          messageCount: s.message_count,
          updatedAt: new Date(s.updated_at).getTime(),
        }));
        patch({ chatThreads: threads });
      })
      .catch((err) => patch({ syncError: describeError(err, "Couldn't load your past conversations.") }));
  };
  const closeChatHistory = () => patch({ screen: "chat" });
  const restoreChatThread = (id: string) => {
    patch({ screen: "chat", chatDraft: "", isTyping: false });
    fetchChatSessionMessages(id)
      .then((result) => {
        const restored: ChatMessage[] = result.messages.flatMap((row) => [
          { id: `u${row.id}`, from: "user" as const, text: row.user_message },
          ...(row.agent_response || row.recipe_suggestion
            ? [{ id: `b${row.id}`, from: "bot" as const, text: row.agent_response ?? "", suggestedRecipe: row.recipe_suggestion }]
            : []),
        ]);
        patch({ chatMessages: restored.length ? restored : DEFAULT_CHAT_MESSAGES, currentSessionId: result.session_id });
      })
      .catch((err) => patch({ syncError: describeError(err, "Couldn't load that conversation.") }));
  };
  const sendChat = (text: string, attachmentFile?: File) => {
    if (state.isTyping) return;
    const trimmed = (text || "").trim();
    if (!trimmed && !attachmentFile) return;

    // Local-only preview so the sent bubble shows the actual photo, not just its filename -
    // never uploaded anywhere itself, just read back by the <img> tag in ChatScreen.
    const attachmentUrl = attachmentFile ? URL.createObjectURL(attachmentFile) : undefined;
    const userMsg: ChatMessage = { id: "u" + Date.now(), from: "user", text: trimmed, attachmentName: attachmentFile?.name, attachmentUrl };
    patch((s) => ({ chatMessages: [...s.chatMessages, userMsg], chatDraft: "", isTyping: true }));

    // A bare photo with no caption still needs some instruction for the model, and `message`
    // is required server-side - default to a generic prompt rather than blocking send.
    const messageForApi = trimmed || "What do you see in this photo?";

    const inventory = buildInventorySummary(state);
    const usageSummary = buildUsageSummary(state.usageHistory);
    const streakSummary = buildStreakSummary(state.scoreSnapshots);
    sendChatMessage(messageForApi, routeChatAgent(messageForApi), inventory, state.currentSessionId, usageSummary, undefined, streakSummary, attachmentFile)
      .then((res) => {
        const reply: ChatMessage = {
          id: "b" + Date.now(),
          from: "bot",
          text: res.agent_response,
          mocked: res.mocked,
          suggestedRecipe: res.recipe_suggestion,
        };
        patch((s) => ({ chatMessages: [...s.chatMessages, reply], isTyping: false, currentSessionId: res.session_id }));

        // Fire-and-forget: extracts/updates remembered facts from this exchange. Never
        // awaited, so a slow or failed extraction can never delay the reply already shown.
        const prevFacts = state.memoryFacts;
        extractMemory(messageForApi, res.agent_response)
          .then((facts) => {
            patch({ memoryFacts: facts });
            const newlyAdded = facts.filter((f) => !prevFacts.includes(f));
            if (!newlyAdded.length) return;

            // Silently inferring and storing facts about someone deserves a beat of
            // visibility - surfaced the same way every other undoable action in this app
            // is (item moves, removals, notification dismissals), not a new interruptive
            // confirm dialog.
            scheduleUndo(`Remembered: ${newlyAdded.join(", ")}`, () => {
              patch({ memoryFacts: prevFacts });
              // Undo has to un-persist server-side too, unlike lighter-weight undos
              // elsewhere - a future message would otherwise still read the "undone" fact
              // back out of the DB. Delete highest-index-first so indices don't shift out
              // from under the next delete in the same batch.
              newlyAdded
                .map((f) => facts.indexOf(f))
                .sort((a, b) => b - a)
                .forEach((i) => deleteMemoryFactApi(i).catch(() => {}));
            });
          })
          .catch(() => {});
      })
      .catch((err) => {
        const reply: ChatMessage = { id: "b" + Date.now(), from: "bot", text: describeError(err, "Sorry, I couldn't reach the assistant right now.") };
        patch((s) => ({ chatMessages: [...s.chatMessages, reply], isTyping: false }));
      });
  };
  const sendMessage = (attachmentFile?: File) => sendChat(state.chatDraft, attachmentFile);
  const askQuick = (label: string) => sendChat(label);

  const AGENT_ACTIVATE_PROMPT: Record<ChatAgentName, string> = {
    Chef: "What can I cook tonight with what I have?",
    Guardian: "What's at risk of going bad soon?",
    Organizer: "How should I organize my fridge right now?",
    Shopkeeper: "What should I restock?",
  };
  const activateAgent = (agent: ChatAgentName) => {
    if (state.agentInsightLoading[agent]) return;
    patch((s) => ({ agentInsightLoading: { ...s.agentInsightLoading, [agent]: true } }));
    const inventory = buildInventorySummary(state);
    const usageSummary = buildUsageSummary(state.usageHistory);
    const streakSummary = buildStreakSummary(state.scoreSnapshots);
    sendChatMessage(AGENT_ACTIVATE_PROMPT[agent], agent, inventory, undefined, usageSummary, true, streakSummary)
      .then((res) => {
        patch((s) => ({
          agentInsights: { ...s.agentInsights, [agent]: res.agent_response },
          agentInsightLoading: { ...s.agentInsightLoading, [agent]: false },
        }));
      })
      .catch((err) => {
        patch((s) => ({ agentInsightLoading: { ...s.agentInsightLoading, [agent]: false } }));
        patch({ syncError: describeError(err, "Couldn't reach the agent right now.") });
      });
    // Organizer's insight text is just prose - it can't drive a real move (the model never
    // sees item ids). So alongside it, when the user has allowed the crew to take actions,
    // ask the same structured per-item endpoint the Add-item "Auto-fill" button already uses
    // for every item in the active fridge, and surface the ones that don't match today.
    if (agent === "Organizer" && state.notificationPrefs.crewActionsEnabled) {
      checkOrganizerMoves();
    }
  };

  const checkOrganizerMoves = () => {
    if (state.organizerMovesLoading) return;
    const items = getActiveFridgeItems(state);
    if (!items.length) return;
    patch({ organizerMovesLoading: true, organizerSuggestedMoves: [] });
    Promise.all(
      items.map(async (item) => {
        try {
          const suggestion = await suggestItemDetails(item.name, item.icon);
          const current = item.location || "fridge";
          if (current !== suggestion.location) {
            return { itemId: item.id, itemName: item.name, location: suggestion.location };
          }
        } catch {
          // A single item's suggestion failing shouldn't block the rest - just skip it.
        }
        return null;
      })
    ).then((results) => {
      const moves = results.filter((m) => m !== null);
      patch({
        organizerSuggestedMoves: moves,
        organizerMovesLoading: false,
      });
      // Cumulative Tidiness tally - report this sweep's checked/correct split. Best-effort: a
      // failed report shouldn't undo the moves the user can already see and act on above.
      incrementOrganizerTally({ checked: items.length, correct: items.length - moves.length })
        .then((tally) => patch({ organizerTally: tally }))
        .catch(() => {});
    });
  };

  const applyOrganizerMove = (itemId: string, location: StorageLocation) => {
    const move = state.organizerSuggestedMoves.find((m) => m.itemId === itemId);
    const prevLocation = findItem(state, itemId)?.item.location || "fridge";
    patch((s) => ({ organizerSuggestedMoves: s.organizerSuggestedMoves.filter((m) => m.itemId !== itemId) }));
    setItemLocation(itemId, location);
    const locationLabel = STORAGE_LOCATIONS.find((l) => l.key === location)?.label || location;
    scheduleUndo(`Moved ${move?.itemName ?? "item"} to ${locationLabel}`, () => {
      setItemLocation(itemId, prevLocation);
    });
  };

  const dismissOrganizerMove = (itemId: string) =>
    patch((s) => ({ organizerSuggestedMoves: s.organizerSuggestedMoves.filter((m) => m.itemId !== itemId) }));
  // Home's tip cards call this instead of activateAgent directly: fires the real agent call
  // at most once per session per agent (agentAutoFetched), so a slow network or a failed
  // request can't retry on every re-render the way an unguarded effect would.
  const ensureAgentInsight = (agent: ChatAgentName) => {
    if (state.agentAutoFetched[agent] || state.agentInsightLoading[agent] || state.agentInsights[agent]) return;
    patch((s) => ({ agentAutoFetched: { ...s.agentAutoFetched, [agent]: true } }));
    activateAgent(agent);
  };
  const dismissAgentInsight = (agent: ChatAgentName) =>
    patch((s) => {
      const next = { ...s.agentInsights };
      delete next[agent];
      return { agentInsights: next };
    });

  const goHome = () =>
    patch((s) => ({
      screen: s.lastMainScreen,
      selectedItemId: null,
      isEditingItem: false,
      addStep: 0,
      scanMethod: null,
      detected: [],
      expiryScanNote: null,
      expiryPhotoError: null,
      manualName: "",
      manualSectionId: "",
      manualExpiryDate: defaultExpiryDate(),
      manualNote: "",
    }));
  const goTab = (screen: Screen) =>
    patch((s) => ({
      screen,
      lastMainScreen: screen === "home" || screen === "inventory" ? screen : s.lastMainScreen,
    }));
  const openAdd = () =>
    patch((s) => ({
      screen: "add",
      addStep: s.fridges.length > 1 ? -1 : 0,
      addFridgeIndex: s.activeFridge,
      scanMethod: null,
      detected: [],
      manualName: "",
      manualSectionId: s.fridges[s.activeFridge]?.sections[0]?.id || "",
      manualSectionAuto: true,
      manualIcon: "leftovers",
      manualIconAuto: true,
      manualCategory: "other_extras",
      manualCategoryAuto: true,
      manualLocation: "fridge",
      manualExpiryDate: defaultExpiryDate(),
      manualNote: "",
    }));
  const selectAddFridge = (index: number) =>
    patch((s) => ({
      addFridgeIndex: index,
      addStep: 0,
      manualSectionId: s.fridges[index].sections[0]?.id || "",
    }));
  const selectItem = (id: string) => patch({ screen: "itemDetail", selectedItemId: id, isEditingItem: false });

  const startEditItem = () => {
    if (!state.selectedItemId) return;
    const found = findItem(state, state.selectedItemId);
    if (!found) return;
    // The client Item shape only keeps the computed `days`, not the raw expiry_date the
    // server derived it from — reconstruct the same calendar date from it (today + days),
    // which is exactly invertible since the server computes days as a whole-day diff.
    const target = new Date();
    target.setDate(target.getDate() + found.item.days);
    patch({
      isEditingItem: true,
      editName: found.item.name,
      editSectionId: found.section.id,
      editIcon: found.item.icon,
      editCategory: found.item.nutritionCategory || "",
      editFridgeIndex: found.fridgeIndex,
      editExpiryDate: toISODate(target),
      editNote: found.item.note,
    });
  };
  const cancelEditItem = () => patch({ isEditingItem: false });
  const onEditNameChange = (value: string) => patch({ editName: value });
  const onEditSectionChange = (value: string) => patch({ editSectionId: value });
  const onEditIconChange = (value: string) => patch({ editIcon: value });
  const onEditCategoryChange = (value: string) => patch({ editCategory: value });
  const onEditExpiryDateChange = (value: string) => patch({ editExpiryDate: value });
  const onEditNoteChange = (value: string) => patch({ editNote: value });
  const confirmEditItem = () => {
    const id = state.selectedItemId;
    if (!id) return;
    const name = state.editName.trim();
    if (!name) return;
    const found = findItem(state, id);
    if (!found) return;
    const { item: prevItem, section: fromSection } = found;
    const toSectionId = state.editSectionId || fromSection.id;
    const icon = state.editIcon || prevItem.icon;
    const category = (state.editCategory || prevItem.nutritionCategory || null) as NutritionCategory | null;
    const note = state.editNote.trim();
    const moved = toSectionId !== fromSection.id;

    const expiryDate = state.editExpiryDate;
    const shelfLifeDays = Math.max(1, daysUntil(expiryDate));
    const newDays = daysUntil(expiryDate);
    const newFreshness = Math.max(0, Math.min(100, Math.round((newDays / shelfLifeDays) * 100)));

    patch((s) => {
      const found2 = findItem(s, id);
      if (!found2) return {};
      const { item, section: fromSec, fridgeIndex } = found2;
      const fridge = s.fridges[fridgeIndex];
      const updatedItem = { ...item, name, icon, nutritionCategory: category, note, days: newDays, freshness: newFreshness };

      const sections =
        toSectionId === fromSec.id
          ? fridge.sections.map((sec) =>
              sec.id === fromSec.id ? { ...sec, items: sec.items.map((it) => (it.id === id ? updatedItem : it)) } : sec
            )
          : fridge.sections.map((sec) => {
              if (sec.id === fromSec.id) return { ...sec, items: sec.items.filter((it) => it.id !== id) };
              if (sec.id === toSectionId) return { ...sec, items: [...sec.items, updatedItem] };
              return sec;
            });

      return {
        fridges: s.fridges.map((f, i) => (i === fridgeIndex ? { ...f, sections } : f)),
        isEditingItem: false,
      };
    });

    updateItem(id, {
      name,
      icon,
      nutrition_category: category,
      note,
      expiry_date: expiryDate,
      shelf_life_days: shelfLifeDays,
      ...(moved ? { section_id: toSectionId } : {}),
    }).catch((err) => {
      patch((s) => {
        const found3 = findItem(s, id);
        if (!found3) return {};
        const { section: curSection, fridgeIndex } = found3;
        const fridge = s.fridges[fridgeIndex];
        const sections =
          curSection.id === fromSection.id
            ? fridge.sections.map((sec) =>
                sec.id === fromSection.id ? { ...sec, items: sec.items.map((it) => (it.id === id ? prevItem : it)) } : sec
              )
            : fridge.sections.map((sec) => {
                if (sec.id === curSection.id) return { ...sec, items: sec.items.filter((it) => it.id !== id) };
                if (sec.id === fromSection.id) return { ...sec, items: [...sec.items, prevItem] };
                return sec;
              });
        return { fridges: s.fridges.map((f, i) => (i === fridgeIndex ? { ...f, sections } : f)) };
      });
      patch({ syncError: describeError(err, "Couldn't save the item.") });
    });
  };

  const adjustItemQty = (id: string, delta: number) => {
    let newQty = 0;
    patch((s) => {
      const found = findItem(s, id);
      if (!found) return {};
      const { section, fridgeIndex } = found;
      return {
        fridges: s.fridges.map((f, i) =>
          i === fridgeIndex
            ? {
                ...f,
                sections: f.sections.map((sec) =>
                  sec.id === section.id
                    ? {
                        ...sec,
                        items: sec.items.map((it) => {
                          if (it.id !== id) return it;
                          newQty = Math.max(0, it.qty + delta);
                          return { ...it, qty: newQty };
                        }),
                      }
                    : sec
                ),
              }
            : f
        ),
      };
    });

    const existingTimer = qtyDebounceTimers.current[id];
    if (existingTimer) clearTimeout(existingTimer);
    qtyDebounceTimers.current[id] = setTimeout(() => {
      delete qtyDebounceTimers.current[id];
      // Backend requires quantity >= 1; a locally-displayed 0 (about to be discarded) is sent as 1.
      updateItem(id, { quantity: Math.max(1, newQty) }).catch((err) => {
        patch({ syncError: describeError(err, "Couldn't save the quantity.") });
      });
    }, 450);
  };

  const recordUsage = (name: string, icon: string, daysRemaining?: number, freshness?: number, category?: NutritionCategory | null) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    recordItemUsage(trimmed, icon, daysRemaining, freshness, category)
      .then((entry) => {
        patch((s) => {
          const existingIndex = s.usageHistory.findIndex((h) => h.key === entry.key);
          const usageHistory =
            existingIndex === -1 ? [...s.usageHistory, entry] : s.usageHistory.map((h, i) => (i === existingIndex ? entry : h));
          return { usageHistory };
        });
      })
      .catch((err) => patch({ syncError: describeError(err, "Couldn't update your usage history.") }));
  };

  const removeItemWithUndo = (id: string, message: string, onCommit?: () => void) => {
    const found = findItem(state, id);
    if (!found) return;
    const { item, section, fridgeIndex } = found;
    const itemIndex = section.items.findIndex((it) => it.id === id);

    patch((s) => ({
      fridges: s.fridges.map((f, i) =>
        i === fridgeIndex
          ? { ...f, sections: f.sections.map((sec) => (sec.id === section.id ? { ...sec, items: sec.items.filter((it) => it.id !== id) } : sec)) }
          : f
      ),
      screen: s.lastMainScreen,
      selectedItemId: null,
      isEditingItem: false,
    }));

    scheduleUndo(
      message,
      () => {
        patch((s) => ({
          fridges: s.fridges.map((f, i) =>
            i === fridgeIndex
              ? {
                  ...f,
                  sections: f.sections.map((sec) =>
                    sec.id === section.id ? { ...sec, items: [...sec.items.slice(0, itemIndex), item, ...sec.items.slice(itemIndex)] } : sec
                  ),
                }
              : f
          ),
        }));
      },
      () => {
        onCommit?.();
        deleteItem(id).catch((err) => patch({ syncError: describeError(err, "Couldn't delete the item.") }));
      }
    );
  };
  // Shared by the item-detail "Opened it" toggle and Mark as made's "Still have some" choice -
  // both mean the same thing (used from, not finished), just reached from different screens.
  const markItemOpenedById = (id: string) => {
    patch((s) => {
      const found = findItem(s, id);
      if (!found || found.item.opened) return {};
      const { item, section, fridgeIndex } = found;
      const newDays = Math.min(item.days, 3);
      const newFreshness = item.days > 0 ? Math.max(10, Math.round(item.freshness * (newDays / item.days))) : item.freshness;
      const updated: Item = { ...item, opened: true, days: newDays, freshness: newFreshness };
      return {
        fridges: s.fridges.map((f, i) =>
          i === fridgeIndex
            ? { ...f, sections: f.sections.map((sec) => (sec.id === section.id ? { ...sec, items: sec.items.map((it) => (it.id === id ? updated : it)) } : sec)) }
            : f
        ),
      };
    });
  };
  const markUsed = () => {
    if (!state.selectedItemId) return;
    markItemOpenedById(state.selectedItemId);
  };
  // Consumed vs wasted: only markItemConsumed ever calls recordUsage, so usage_history (and
  // everything it feeds - Shopkeeper's memory, the goal metrics, the Food Balance score) stays
  // an honest signal of what was actually eaten rather than "removed for any reason."
  const markItemConsumed = () => {
    if (!state.selectedItemId) return;
    const found = findItem(state, state.selectedItemId);
    if (!found) return;
    const { item } = found;
    removeItemWithUndo(state.selectedItemId, `Used up "${item.name}"`, () => {
      recordUsage(item.name, item.icon, item.days, item.freshness, item.nutritionCategory);
    });
  };
  const discardItemWasted = () => {
    if (!state.selectedItemId) return;
    const found = findItem(state, state.selectedItemId);
    if (!found) return;
    const { item } = found;
    removeItemWithUndo(state.selectedItemId, `Threw away "${item.name}"`);
  };

  const chooseMethod = (method: ScanMethod) => {
    if (method === "manual") {
      patch((s) => ({
        scanMethod: method,
        addStep: 3,
        manualName: "",
        manualSectionId: s.fridges[s.addFridgeIndex]?.sections[0]?.id || "",
        manualSectionAuto: true,
        manualIcon: "leftovers",
        manualIconAuto: true,
        manualCategory: "other_extras",
        manualCategoryAuto: true,
        manualLocation: "fridge",
        manualExpiryDate: defaultExpiryDate(),
        manualNote: "",
      }));
      return;
    }
    if (method === "barcode") {
      patch({ scanMethod: method, addStep: 4, barcodeInput: "", barcodeError: null, expiryScanNote: null, expiryPhotoError: null });
      return;
    }
    // Receipt & photo scanning: hand off to the camera capture UI (addStep 1).
    // The actual API call happens in captureReceiptOrPhoto once a frame is captured.
    patch({ scanMethod: method, addStep: 1, scanImageError: null });
  };

  // Brand-new fridges used to get a single generic "General" section created on the fly the
  // first time an item needed one. Default sections are now the 6 nutrition categories instead,
  // created together (only the ones missing) so STORE IN always has somewhere meaningful to
  // route an item to, matching FOOD GROUP one-for-one.
  const ensureCategorySections = async (fridgeIndex: number, fridge: Fridge): Promise<Section[]> => {
    const existingNames = new Set(fridge.sections.map((sec) => sec.name));
    const missing = NUTRITION_CATEGORIES.filter((c) => !existingNames.has(c.label));
    if (!missing.length) return fridge.sections;
    const created = await Promise.all(missing.map((c) => createSection(fridge.id, c.label)));
    const sections = [...fridge.sections, ...created];
    patch((s) => ({ fridges: s.fridges.map((f, i) => (i === fridgeIndex ? { ...f, sections } : f)) }));
    return sections;
  };
  // "Other/Extras" is the closest thing to a generic catch-all in the new taxonomy, so it's
  // what receipt/barcode scanning bootstraps with before any items are known to classify -
  // once detected, each item still routes to its own matched category section below.
  const catchAllSectionId = (sections: Section[]) => sections.find((sec) => sec.name === "Other/Extras")?.id ?? sections[0]?.id;

  const captureReceiptOrPhoto = async (file: File) => {
    patch({ scanImageLoading: true, scanImageError: null });
    try {
      let fridgeIndex = state.addFridgeIndex;
      let fridge = state.fridges[fridgeIndex];
      if (!fridge) {
        // Brand-new users start with zero fridges — create one on the fly, same as barcode/manual.
        fridge = await createFridge("My Fridge");
        fridgeIndex = state.fridges.length;
        patch((s) => ({ fridges: [...s.fridges, fridge], activeFridge: fridgeIndex, addFridgeIndex: fridgeIndex }));
      }
      if (fridge.sections.length === 0) {
        fridge = { ...fridge, sections: await ensureCategorySections(fridgeIndex, fridge) };
      }
      const sectionId = catchAllSectionId(fridge.sections);

      let detected: DetectedItem[] = [];

      if (state.scanMethod === "receipt") {
        const result = await scanReceipt(sectionId, file);
        detected = result.detected_items.map((d, i) => {
          const icon = FOOD_ICON_KEYS.includes(d.icon) ? d.icon : guessIcon(d.parsed_name) || "leftovers";
          const group = guessNutritionCategoryLabel(icon);
          return {
            id: "rc" + Date.now() + i,
            name: d.parsed_name,
            icon,
            section: (group && findSectionIdForGroup(fridge.sections, group.toLowerCase())) || sectionId,
            checked: true,
            qty: Math.max(1, d.parsed_quantity || 1),
            expiryDate: "",
            location: "fridge" as StorageLocation,
            condition: null,
          };
        });
      } else {
        const result = await scanFridgePhoto(sectionId, file);
        detected = result.detected_items.map((d, i) => {
          const icon = FOOD_ICON_KEYS.includes(d.icon) ? d.icon : guessIcon(d.parsed_name) || "leftovers";
          const group = guessNutritionCategoryLabel(icon);
          const category = guessNutritionCategory(icon);
          return {
            id: "ph" + Date.now() + i,
            name: d.parsed_name,
            icon,
            section: (group && findSectionIdForGroup(fridge.sections, group.toLowerCase())) || sectionId,
            checked: true,
            qty: 1,
            expiryDate: "",
            location: "fridge" as StorageLocation,
            // Re-gated against our own category guess (not just trusting the vision call's
            // "vegetable"/"fruit" icon bucket) so this stays produce-only even if the model
            // mislabels something - same PRODUCE_CATEGORIES rule manual add uses.
            condition: category && PRODUCE_CATEGORIES.has(category) ? d.condition : null,
          };
        });
      }

      if (detected.length === 0) {
        patch({
          scanImageLoading: false,
          scanImageError:
            state.scanMethod === "receipt"
              ? "Couldn't find any items on that receipt — try a clearer photo, or add items manually."
              : "Couldn't spot any items in that photo — try a clearer shot, or add items manually.",
        });
        return;
      }

      patch({ addStep: 2, detected, scanImageLoading: false });
    } catch (err) {
      patch({ scanImageLoading: false, scanImageError: describeError(err, "Couldn't process that photo.") });
    }
  };
  const onBarcodeInputChange = (value: string) => patch({ barcodeInput: value, barcodeError: null });
  const lookupBarcode = async (explicitBarcode?: string) => {
    const barcode = (explicitBarcode ?? state.barcodeInput).trim();
    if (!barcode) return;
    patch({ barcodeLoading: true, barcodeError: null, barcodeInput: barcode });
    try {
      let fridgeIndex = state.addFridgeIndex;
      let fridge = state.fridges[fridgeIndex];
      if (!fridge) {
        // Brand-new users start with zero fridges — create one on the fly, same as sections.
        fridge = await createFridge("My Fridge");
        fridgeIndex = state.fridges.length;
        patch((s) => ({ fridges: [...s.fridges, fridge], activeFridge: fridgeIndex, addFridgeIndex: fridgeIndex }));
      }
      if (fridge.sections.length === 0) {
        fridge = { ...fridge, sections: await ensureCategorySections(fridgeIndex, fridge) };
      }
      const sectionId = catchAllSectionId(fridge.sections);
      const product = await scanBarcode(sectionId, barcode);
      const icon = FOOD_ICON_KEYS.includes(product.icon) ? product.icon : guessIcon(product.name) || "leftovers";
      const group = guessNutritionCategoryLabel(icon);
      const target = new Date();
      target.setDate(target.getDate() + (product.default_shelf_life_days || suggestShelfLifeDays(icon)));
      const detected: DetectedItem = {
        id: "bc" + Date.now(),
        name: product.name,
        icon,
        section: (group && findSectionIdForGroup(fridge.sections, group.toLowerCase())) || sectionId,
        checked: true,
        qty: 1,
        expiryDate: toISODate(target),
        location: product.location || guessLocation(product.name),
        condition: null,
      };
      patch({ addStep: 6, detected: [detected], barcodeLoading: false, barcodeInput: "", expiryPhotoTargetId: detected.id });
    } catch (err) {
      patch({ barcodeLoading: false, barcodeError: describeError(err, "Couldn't look up that barcode.") });
    }
  };
  // Grounds the "guess from the name" flows (manual add, detected-items review) in the same
  // real-date camera scan the barcode flow already used - captureExpiryPhoto/skipExpiryPhoto
  // below route by expiryPhotoTargetId instead of assuming a single barcode-detected item.
  const startExpiryScanForDetected = (id: string) => {
    patch({ expiryPhotoTargetId: id, addStep: 6, expiryPhotoError: null });
  };
  const startExpiryScanForManual = async () => {
    try {
      let fridgeIndex = state.addFridgeIndex;
      let fridge = state.fridges[fridgeIndex];
      if (!fridge) {
        // Brand-new users start with zero fridges — create one on the fly, same as manual add.
        fridge = await createFridge("My Fridge");
        fridgeIndex = state.fridges.length;
        patch((s) => ({ fridges: [...s.fridges, fridge], activeFridge: fridgeIndex, addFridgeIndex: fridgeIndex }));
      }
      if (fridge.sections.length === 0) {
        fridge = { ...fridge, sections: await ensureCategorySections(fridgeIndex, fridge) };
      }
      const group = guessNutritionCategoryLabel(state.manualIcon);
      const sectionId =
        state.manualSectionId || (group && findSectionIdForGroup(fridge.sections, group.toLowerCase())) || catchAllSectionId(fridge.sections);
      patch({ expiryPhotoTargetId: "manual", manualSectionId: sectionId, addStep: 6, expiryPhotoError: null });
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't start the expiry scan.") });
    }
  };
  const captureExpiryPhoto = async (file: File) => {
    const targetId = state.expiryPhotoTargetId;
    const sectionId = targetId === "manual" ? state.manualSectionId : state.detected.find((d) => d.id === targetId)?.section;
    if (!sectionId) return;
    patch({ expiryPhotoLoading: true, expiryPhotoError: null });
    try {
      const result = await scanExpiryPhoto(sectionId, file);
      if (!result.found || !result.date) {
        patch({ expiryPhotoLoading: false, expiryPhotoError: result.message || "Couldn't read a date on that photo." });
        return;
      }
      if (targetId === "manual") {
        patch({
          manualExpiryDate: result.date!,
          expiryPhotoLoading: false,
          expiryPhotoError: null,
          addStep: 3,
        });
      } else {
        const note = `AI read the expiry date as ${result.date}${result.confidence ? ` (${result.confidence} confidence)` : ""} — double-check before adding.`;
        patch((s) => ({
          detected: s.detected.map((d) => (d.id === targetId ? { ...d, expiryDate: result.date! } : d)),
          expiryPhotoLoading: false,
          expiryPhotoError: null,
          expiryScanNote: note,
          addStep: 2,
        }));
      }
    } catch (err) {
      patch({ expiryPhotoLoading: false, expiryPhotoError: describeError(err, "Couldn't read a date on that photo.") });
    }
  };
  const skipExpiryPhoto = () => {
    const returnStep = state.expiryPhotoTargetId === "manual" ? 3 : 2;
    patch({ addStep: returnStep, expiryPhotoError: null, expiryScanNote: null });
  };
  const toggleDetected = (id: string) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, checked: !d.checked } : d)) }));
  const onDetectedNameChange = (id: string, name: string) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, name } : d)) }));
  const onDetectedIconChange = (id: string, icon: string) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, icon } : d)) }));
  const onDetectedSectionChange = (id: string, sectionId: string) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, section: sectionId } : d)) }));
  const adjustDetectedQty = (id: string, delta: number) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, qty: Math.max(1, d.qty + delta) } : d)) }));
  const onDetectedExpiryChange = (id: string, value: string) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, expiryDate: value } : d)) }));
  const onDetectedLocationChange = (id: string, location: StorageLocation) =>
    patch((s) => ({ detected: s.detected.map((d) => (d.id === id ? { ...d, location } : d)) }));
  // Covers the scan missing an item entirely - drops a blank row into the same detected list so
  // it gets the same name/icon/section/qty/expiry editing (and Auto-fill) as anything the scan
  // did catch, rather than needing a separate manual-add detour after confirming the batch.
  const addBlankDetectedItem = () => {
    const fridge = state.fridges[state.addFridgeIndex];
    if (!fridge) return;
    const sectionId = catchAllSectionId(fridge.sections);
    if (!sectionId) return;
    const item: DetectedItem = {
      id: "add" + Date.now(),
      name: "",
      icon: "leftovers",
      section: sectionId,
      checked: true,
      qty: 1,
      expiryDate: "",
      location: "fridge",
      condition: null,
    };
    patch((s) => ({ detected: [...s.detected, item] }));
  };
  const removeDetectedItem = (id: string) => patch((s) => ({ detected: s.detected.filter((d) => d.id !== id) }));
  // item.condition only ever comes from a photo-of-fridge vision read (see
  // captureReceiptOrPhoto) - applying it here means produce from that add method gets the same
  // condition-adjusted estimate as manual add's picker, but without asking, since the AI already
  // read it off the photo. Shared by the single-item and "Auto-fill all" paths below.
  const fetchDetectedSuggestion = (item: DetectedItem) =>
    suggestItemDetails(item.name, item.icon).then(({ shelf_life_days, location }) => {
      const days = item.condition ? Math.max(1, Math.round(shelf_life_days * CONDITION_SHELF_LIFE_MULTIPLIER[item.condition])) : shelf_life_days;
      const target = new Date();
      target.setDate(target.getDate() + days);
      return { expiryDate: toISODate(target), location };
    });
  const suggestDetectedDetails = (id: string) => {
    const item = state.detected.find((d) => d.id === id);
    if (!item || !item.name.trim() || state.detectedAutoFillLoadingId || state.detectedAutoFillAllLoading) return;
    patch({ detectedAutoFillLoadingId: id });
    fetchDetectedSuggestion(item)
      .then(({ expiryDate, location }) => {
        patch((s) => ({
          detected: s.detected.map((d) => (d.id === id ? { ...d, expiryDate, location } : d)),
          detectedAutoFillLoadingId: null,
        }));
      })
      .catch((err) => {
        patch({ detectedAutoFillLoadingId: null, syncError: describeError(err, "Couldn't get a suggestion for that item.") });
      });
  };
  const suggestAllDetectedDetails = () => {
    const items = state.detected.filter((d) => d.checked && d.name.trim());
    if (!items.length || state.detectedAutoFillLoadingId || state.detectedAutoFillAllLoading) return;
    patch({ detectedAutoFillAllLoading: true });
    Promise.allSettled(items.map((item) => fetchDetectedSuggestion(item).then((suggestion) => ({ id: item.id, ...suggestion }))))
      .then((results) => {
        const succeeded = results.filter(
          (r): r is PromiseFulfilledResult<{ id: string; expiryDate: string; location: StorageLocation }> => r.status === "fulfilled"
        );
        const byId = new Map(succeeded.map((r) => [r.value.id, r.value]));
        patch((s) => ({
          detected: s.detected.map((d) => {
            const hit = byId.get(d.id);
            return hit ? { ...d, expiryDate: hit.expiryDate, location: hit.location } : d;
          }),
          detectedAutoFillAllLoading: false,
          ...(succeeded.length < items.length
            ? { syncError: `Couldn't get a suggestion for ${items.length - succeeded.length} item${items.length - succeeded.length === 1 ? "" : "s"}.` }
            : {}),
        }));
      });
  };

  const onManualNameChange = (value: string) =>
    patch((s) => {
      const icon = guessIcon(value);
      const fridge = s.fridges[s.addFridgeIndex];
      const group = icon ? guessNutritionCategoryLabel(icon) : null;
      const guessedSectionId = group && fridge ? findSectionIdForGroup(fridge.sections, group.toLowerCase()) : null;
      const category = icon ? guessNutritionCategory(icon) : null;
      return {
        manualName: value,
        ...(s.manualIconAuto && icon ? { manualIcon: icon } : {}),
        ...(s.manualSectionAuto && guessedSectionId ? { manualSectionId: guessedSectionId } : {}),
        ...(s.manualCategoryAuto && category ? { manualCategory: category } : {}),
      };
    });
  const onManualSectionChange = (value: string) => patch({ manualSectionId: value, manualSectionAuto: false });
  const onManualIconChange = (value: string) =>
    patch((s) => {
      const category = guessNutritionCategory(value);
      const groupLabel = guessNutritionCategoryLabel(value);
      const fridge = s.fridges[s.addFridgeIndex];
      const guessedSectionId = groupLabel && fridge ? findSectionIdForGroup(fridge.sections, groupLabel.toLowerCase()) : null;
      return {
        manualIcon: value,
        manualIconAuto: false,
        ...(s.manualCategoryAuto && category ? { manualCategory: category } : {}),
        ...(s.manualSectionAuto && guessedSectionId ? { manualSectionId: guessedSectionId } : {}),
      };
    });
  const onManualCategoryChange = (value: string) => patch({ manualCategory: value, manualCategoryAuto: false });
  const onManualExpiryDateChange = (value: string) => patch({ manualExpiryDate: value });
  const onManualLocationChange = (location: StorageLocation) => patch({ manualLocation: location });
  // Receipt/barcode-detected items get suggestDetectedDetails below with no condition question -
  // a receipt line item was, by definition, just bought, so "freshly unopened" is a safe
  // presumption. Manual add has no such signal (could be a fridge staple, could be something
  // picked up at a farmers market days ago), so for produce specifically - where visible
  // condition swings remaining shelf life the most - we ask instead of presuming.
  const runManualAutoFill = (condition: ProduceCondition | null) => {
    const name = state.manualName.trim();
    if (!name || state.manualAutoFillLoading) return;
    patch({ manualAutoFillLoading: true, manualAutoFillAskCondition: false });
    suggestItemDetails(name, state.manualIcon)
      .then(({ shelf_life_days, location }) => {
        const days = condition ? Math.max(1, Math.round(shelf_life_days * CONDITION_SHELF_LIFE_MULTIPLIER[condition])) : shelf_life_days;
        const target = new Date();
        target.setDate(target.getDate() + days);
        patch({ manualExpiryDate: toISODate(target), manualLocation: location, manualAutoFillLoading: false });
      })
      .catch((err) => {
        patch({ manualAutoFillLoading: false, syncError: describeError(err, "Couldn't get a suggestion for that item.") });
      });
  };
  const suggestManualDetails = () => {
    if (state.manualAutoFillAskCondition) {
      patch({ manualAutoFillAskCondition: false });
      return;
    }
    if (PRODUCE_CATEGORIES.has(state.manualCategory)) {
      patch({ manualAutoFillAskCondition: true });
      return;
    }
    runManualAutoFill(null);
  };
  const chooseManualCondition = (condition: ProduceCondition) => runManualAutoFill(condition);
  const onManualNoteChange = (value: string) => patch({ manualNote: value });
  const confirmManualAdd = async () => {
    const name = state.manualName.trim();
    if (!name) return;
    const note = state.manualNote.trim() || "Added manually";
    const location = state.manualLocation;
    const expiryDate = state.manualExpiryDate;
    const shelfLifeDays = Math.max(1, daysUntil(expiryDate));

    patch({ screen: state.lastMainScreen, addStep: 0, scanMethod: null, manualName: "", manualNote: "" });

    try {
      let fridgeIndex = state.addFridgeIndex;
      let fridge = state.fridges[fridgeIndex];
      if (!fridge) {
        // Brand-new users start with zero fridges — create one on the fly, same as sections.
        fridge = await createFridge("My Fridge");
        fridgeIndex = state.fridges.length;
        patch((s) => ({ fridges: [...s.fridges, fridge], activeFridge: fridgeIndex, addFridgeIndex: fridgeIndex }));
      }
      if (fridge.sections.length === 0) {
        fridge = { ...fridge, sections: await ensureCategorySections(fridgeIndex, fridge) };
      }
      const icon = state.manualIcon || "leftovers";
      const category = state.manualCategory || guessNutritionCategory(icon);
      let sectionId = state.manualSectionId;
      if (!sectionId || !fridge.sections.some((sec) => sec.id === sectionId)) {
        const group = guessNutritionCategoryLabel(icon);
        sectionId = (group && findSectionIdForGroup(fridge.sections, group.toLowerCase())) || catchAllSectionId(fridge.sections);
      }
      const item = await createItem(sectionId!, {
        name,
        icon,
        nutrition_category: category as NutritionCategory | null,
        location,
        quantity: 1,
        expiry_date: expiryDate,
        shelf_life_days: shelfLifeDays,
        note,
      });
      patch((s) => ({
        fridges: s.fridges.map((f, i) =>
          i === fridgeIndex
            ? { ...f, sections: f.sections.map((sec) => (sec.id === sectionId ? { ...sec, items: [...sec.items, item] } : sec)) }
            : f
        ),
      }));
    } catch (err) {
      patch({ syncError: describeError(err, "Couldn't add the item.") });
    }
  };

  const confirmAdd = async () => {
    const fridgeIndex = state.addFridgeIndex;
    const toAdd = state.detected.filter((d) => d.checked && d.name.trim());
    patch({ screen: state.lastMainScreen, addStep: 0, scanMethod: null, detected: [], expiryScanNote: null, expiryPhotoError: null });
    if (!toAdd.length) return;

    const results = await Promise.allSettled(
      toAdd.map(async (d) => {
        const shelfLifeDays = d.expiryDate ? Math.max(1, daysUntil(d.expiryDate)) : suggestShelfLifeDays(d.icon);
        const expiryDate =
          d.expiryDate ||
          (() => {
            const target = new Date();
            target.setDate(target.getDate() + shelfLifeDays);
            return toISODate(target);
          })();
        const item = await createItem(d.section, {
          name: d.name,
          icon: d.icon,
          location: d.location,
          quantity: d.qty,
          expiry_date: expiryDate,
          shelf_life_days: shelfLifeDays,
          note: "Just added",
        });
        return { sectionId: d.section, item };
      })
    );

    const succeeded = results.filter(
      (r): r is PromiseFulfilledResult<{ sectionId: string; item: Item }> => r.status === "fulfilled"
    );
    const failedCount = results.length - succeeded.length;

    if (succeeded.length) {
      patch((s) => ({
        fridges: s.fridges.map((f, i) =>
          i === fridgeIndex
            ? {
                ...f,
                sections: f.sections.map((sec) => {
                  const toAppend = succeeded.filter((r) => r.value.sectionId === sec.id).map((r) => r.value.item);
                  return toAppend.length ? { ...sec, items: [...sec.items, ...toAppend] } : sec;
                }),
              }
            : f
        ),
      }));
    }
    if (failedCount) {
      patch({ syncError: `Couldn't add ${failedCount} item${failedCount > 1 ? "s" : ""}.` });
    }
  };

  const actions = {
    setAuthMode,
    onAuthNameChange,
    onAuthUsernameChange,
    onAuthEmailChange,
    onAuthPasswordChange,
    onAuthConfirmPasswordChange,
    submitAuth,
    signOut,
    selectHero,
    onHeroSwipeStart,
    onHeroSwipeEnd,
    onNewFridgeNameChange,
    onNewFridgeNameKeyDown,
    addFridge,
    openProfile,
    closeProfile,
    selectFridgeFromProfile,
    openFindFriend,
    onFriendSearchChange,
    openFriendProfile,
    closeFriendProfile,
    sendJoinRequest,
    toggleFavoriteFriendRecipe,
    openNotifications,
    openNotificationHistory,
    dismissNotificationWithUndo,
    openAbout,
    toggleNotificationPref,
    openGoals,
    updateUserGoalSettings,
    openBadges,
    awardBadgeProgress,
    openAIDataSettings,
    deleteChatThread,
    clearAllChatData,
    deleteUsageHistoryEntry,
    clearUsageHistory,
    deleteMemoryFact,
    clearMemoryFacts,
    openStylePicker,
    closeStylePicker,
    selectFridgeStyle,
    updateFridgePhoto,
    renameFridge,
    renameFridgeBlur,
    deleteFridge,
    approveJoinRequestAction,
    declineJoinRequestAction,
    onInviteSearchChange,
    sendFridgeInvite,
    acceptMyInvite,
    declineMyInvite,
    removeFridgeMemberAction,
    leaveFridgeAction,
    openSearch,
    openRecipesHub,
    openShoppingHub,
    openGuardianTab,
    openOrganizerTab,
    selectFoodTab,
    onSwipeStart,
    onSwipeEnd,
    openRecipeDetail,
    closeRecipeDetail,
    toggleFavoriteRecipe,
    openNewRecipeForm,
    openEditRecipeForm,
    closeRecipeForm,
    onRecipeFormNameChange,
    onRecipeFormMinutesChange,
    onRecipeFormCategoryChange,
    addRecipeFormIngredient,
    removeRecipeFormIngredient,
    onRecipeFormIngredientNameChange,
    addRecipeFormStep,
    removeRecipeFormStep,
    onRecipeFormStepChange,
    onRecipeFormLinkUrlChange,
    importRecipeFormLink,
    addRecipeFormAttachment,
    removeRecipeFormAttachment,
    isRecipeFormValid,
    saveRecipeForm,
    deleteCustomRecipe,
    addSuggestedRecipeToLibrary,
    openMarkRecipeMade,
    setMarkMadeStatus,
    removeMarkMadeCandidate,
    closeMarkRecipeMade,
    confirmMarkMade,
    openWhatToEat,
    closeWhatToEat,
    toggleWhatToEatMealType,
    toggleWhatToEatVibe,
    toggleWhatToEatFoodFocus,
    findMeals,
    shuffleMeals,
    askChefInstead,
    onNewShoppingChange,
    onNewShoppingKeyDown,
    addShoppingItem,
    toggleShoppingItem,
    removeShoppingItem,
    clearBought,
    addPredictedToShopping,
    onSearchChange,
    onDraftChange,
    startNewChat,
    openChatHistory,
    closeChatHistory,
    restoreChatThread,
    sendMessage,
    askQuick,
    activateAgent,
    ensureAgentInsight,
    dismissAgentInsight,
    goHome,
    goTab,
    openAdd,
    selectAddFridge,
    onBarcodeInputChange,
    lookupBarcode,
    startExpiryScanForDetected,
    startExpiryScanForManual,
    captureExpiryPhoto,
    captureReceiptOrPhoto,
    skipExpiryPhoto,
    selectItem,
    adjustItemQty,
    markUsed,
    markItemConsumed,
    discardItemWasted,
    startEditItem,
    cancelEditItem,
    onEditNameChange,
    onEditSectionChange,
    onEditIconChange,
    onEditCategoryChange,
    onEditExpiryDateChange,
    onEditNoteChange,
    confirmEditItem,
    undoLastRemoval,
    dismissSyncError,
    chooseMethod,
    toggleDetected,
    onDetectedNameChange,
    onDetectedIconChange,
    onDetectedSectionChange,
    adjustDetectedQty,
    onDetectedExpiryChange,
    onDetectedLocationChange,
    suggestDetectedDetails,
    suggestAllDetectedDetails,
    addBlankDetectedItem,
    removeDetectedItem,
    onManualNameChange,
    onManualSectionChange,
    onManualIconChange,
    onManualCategoryChange,
    onManualExpiryDateChange,
    onManualLocationChange,
    suggestManualDetails,
    chooseManualCondition,
    onManualNoteChange,
    confirmManualAdd,
    confirmAdd,
    setItemLocation,
    selectFridgeScope,
    setInventorySortMode,
    applyOrganizerMove,
    dismissOrganizerMove,
  };

  return { state, actions, chatScrollRef };
}

export type ThatFridgeActions = ReturnType<typeof useThatFridge>["actions"];