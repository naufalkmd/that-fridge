"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FOOD_ICON_KEYS, FOOD_TAB_ORDER, ICON_SECTION, guessIcon, guessLocation, suggestShelfLifeDays } from "./data";
import {
  clearUsageHistoryApi,
  createFridge,
  createItem,
  createSection,
  createShoppingItem,
  deleteChatSession,
  deleteFridge as apiDeleteFridge,
  deleteItem,
  deleteShoppingItem,
  deleteUsageHistoryEntryApi,
  fetchChatHistory,
  fetchChatSessionMessages,
  fetchChatSessions,
  fetchFridges,
  fetchMe,
  fetchNotificationEvents,
  fetchNotificationPrefs,
  fetchRecipes,
  fetchShoppingItems,
  fetchUsageHistory,
  login,
  logout,
  recordItemUsage,
  register,
  scanBarcode,
  scanExpiryPhoto,
  scanFridgePhoto,
  scanReceipt,
  sendChatMessage,
  suggestItemDetails,
  type ChatAgentName,
  updateFridge,
  updateItem,
  updateNotificationEvent,
  updateNotificationPrefs,
  updateShoppingItem,
} from "./api";
import { ApiError, clearToken, getToken } from "./apiClient";
import { findItem, findSectionIdForGroup } from "./selectors";
import type {
  AuthMode,
  ChatMessage,
  ChatThread,
  CurrentUser,
  DetectedItem,
  FoodSubtab,
  Fridge,
  FridgeStyleKey,
  Item,
  NotificationEvent,
  NotificationPrefs,
  Recipe,
  Screen,
  ScanMethod,
  ShoppingItem,
  StorageLocation,
  UsageHistoryEntry,
} from "./types";
const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [{ id: "m0", from: "bot", text: "Hi! Ask me anything about what's in your fridge." }];

function buildInventorySummary(fridge: Fridge | undefined): string | undefined {
  if (!fridge) return undefined;
  const lines = fridge.sections.flatMap((section) =>
    section.items.map((item) => `${item.name} — qty ${item.qty}, ${item.location ?? "fridge"}, use within ${item.days} day${item.days === 1 ? "" : "s"}`)
  );
  return lines.length ? lines.join("\n") : "Fridge is currently empty.";
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

const DEFAULT_ICON_BY_SECTION: Record<string, string> = {
  dairy: "milk",
  produce: "carrot",
  protein: "meat",
  leftovers: "leftovers",
};

export interface ThatFridgeState {
  screen: Screen;
  lastMainScreen: "home" | "inventory";
  isLoading: boolean;
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  authMode: AuthMode;
  authName: string;
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
  scanImageLoading: boolean;
  scanImageError: string | null;
  manualAutoFillLoading: boolean;
  detectedAutoFillLoadingId: string | null;
  manualName: string;
  manualSectionId: string;
  manualSectionAuto: boolean;
  manualIcon: string;
  manualIconAuto: boolean;
  manualLocation: StorageLocation;
  manualExpiryDate: string;
  manualNote: string;
  usageHistory: UsageHistoryEntry[];
  searchQuery: string;
  foodSubtab: FoodSubtab;
  selectedRecipeId: string | null;
  newShoppingText: string;
  shoppingList: ShoppingItem[];
  shoppingSeeded: boolean;
  chatMessages: ChatMessage[];
  chatDraft: string;
  isTyping: boolean;
  chatThreads: ChatThread[];
  currentSessionId: string | null;
  stylingFridgeIndex: number;
  undoMessage: string | null;
  syncError: string | null;
  notificationPrefs: NotificationPrefs;
  notificationEvents: NotificationEvent[];
  kitchenScope: "active" | "all";
  inventorySortMode: "category" | "expiry" | "name";
  agentInsights: Partial<Record<ChatAgentName, string>>;
  // Per-agent, not a single value — Home can auto-activate Guardian/Chef/Shopkeeper
  // concurrently on load, not just one at a time like the FoodHub "Activate" button did.
  agentInsightLoading: Partial<Record<ChatAgentName, boolean>>;
  // Guards the *auto* activation only (Home's tip cards) so a failed fetch doesn't retry on
  // every re-render; the manual "Activate"/"Refresh insight" button in FoodHub bypasses this.
  agentAutoFetched: Partial<Record<ChatAgentName, boolean>>;
}

function initialState(): ThatFridgeState {
  return {
    screen: "home",
    lastMainScreen: "home",
    isLoading: false,
    isAuthenticated: false,
    currentUser: null,
    authMode: "login",
    authName: "",
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
    scanImageLoading: false,
    scanImageError: null,
    manualAutoFillLoading: false,
    detectedAutoFillLoadingId: null,
    manualName: "",
    manualSectionId: "",
    manualSectionAuto: true,
    manualIcon: "leftovers",
    manualIconAuto: true,
    manualLocation: "fridge",
    manualExpiryDate: defaultExpiryDate(),
    manualNote: "",
    usageHistory: [],
    searchQuery: "",
    foodSubtab: "recipes",
    selectedRecipeId: null,
    newShoppingText: "",
    shoppingList: [],
    shoppingSeeded: false,
    chatMessages: DEFAULT_CHAT_MESSAGES,
    chatDraft: "",
    isTyping: false,
    chatThreads: [],
    currentSessionId: null,
    stylingFridgeIndex: 0,
    undoMessage: null,
    syncError: null,
    notificationPrefs: { expiryAlerts: true, lowStock: true, recipeTips: true, weeklyDigest: false },
    notificationEvents: [],
    kitchenScope: "all",
    inventorySortMode: "category",
    agentInsights: {},
    agentInsightLoading: {},
    agentAutoFetched: {},
  };
}

const UNDO_WINDOW_MS = 5000;

// Routes a free-form chat message to whichever agent persona actually fits it,
// instead of every message getting Chef's recipe-focused system prompt
// regardless of what's being asked. Falls back to Chef for general chit-chat,
// since that was the original default and works fine for anything ambiguous.
const AGENT_KEYWORDS: { agent: ChatAgentName; pattern: RegExp }[] = [
  { agent: "Guardian", pattern: /\b(expir(e|es|ing|ed|y)|spoil(ed|ing)?|go(es|ing)? bad|moldy|mold|smell(s|y)?|safe to eat|food safety|throw (it|them) out)\b/i },
  { agent: "Shopkeeper", pattern: /\b(buy|shopping|shopping list|restock|grocery|groceries|running low|need to (get|buy)|out of|purchase)\b/i },
  { agent: "Organizer", pattern: /\b(organi[sz]e|storage|store (it|them)|arrange|where should|which shelf|fridge vs freezer|freezer or fridge)\b/i },
  { agent: "Chef", pattern: /\b(cook|recipe|meal|make (for|tonight)|dinner|lunch|breakfast|dish|ingredients)\b/i },
];

function routeChatAgent(message: string): ChatAgentName {
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
      if (password !== state.authConfirmPassword) return patch({ authError: "Passwords don't match." });
      try {
        const { user } = await register(name, email, password);
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
    ]).then(
      ([fridges, recipes, shoppingList, notificationPrefs, notificationEvents, chatHistory, usageHistory]) => {
        if (cancelled) return;
        const restoredChatMessages: ChatMessage[] = chatHistory.messages.flatMap((row) => [
          { id: `u${row.id}`, from: "user" as const, text: row.user_message },
          ...(row.agent_response ? [{ id: `b${row.id}`, from: "bot" as const, text: row.agent_response }] : []),
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

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
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

  const openStylePicker = (i: number) => patch({ stylingFridgeIndex: i, screen: "fridgeStyle" });
  const closeStylePicker = () => patch({ screen: "home" });
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
          ...(row.agent_response ? [{ id: `b${row.id}`, from: "bot" as const, text: row.agent_response }] : []),
        ]);
        patch({ chatMessages: restored.length ? restored : DEFAULT_CHAT_MESSAGES, currentSessionId: result.session_id });
      })
      .catch((err) => patch({ syncError: describeError(err, "Couldn't load that conversation.") }));
  };
  const sendChat = (text: string, attachmentName?: string) => {
    if (state.isTyping) return;
    const trimmed = (text || "").trim();
    if (!trimmed && !attachmentName) return;
    const userMsg: ChatMessage = { id: "u" + Date.now(), from: "user", text: trimmed, attachmentName };
    patch((s) => ({ chatMessages: [...s.chatMessages, userMsg], chatDraft: "", isTyping: true }));

    if (!trimmed) {
      const reply: ChatMessage = { id: "b" + Date.now(), from: "bot", text: `Thanks for sharing "${attachmentName}" — I'll take a look!` };
      patch((s) => ({ chatMessages: [...s.chatMessages, reply], isTyping: false }));
      return;
    }

    const inventory = buildInventorySummary(state.fridges[state.activeFridge]);
    const usageSummary = buildUsageSummary(state.usageHistory);
    sendChatMessage(trimmed, routeChatAgent(trimmed), inventory, state.currentSessionId, usageSummary)
      .then((res) => {
        const reply: ChatMessage = { id: "b" + Date.now(), from: "bot", text: res.agent_response, mocked: res.mocked };
        patch((s) => ({ chatMessages: [...s.chatMessages, reply], isTyping: false, currentSessionId: res.session_id }));
      })
      .catch((err) => {
        const reply: ChatMessage = { id: "b" + Date.now(), from: "bot", text: describeError(err, "Sorry, I couldn't reach the assistant right now.") };
        patch((s) => ({ chatMessages: [...s.chatMessages, reply], isTyping: false }));
      });
  };
  const sendMessage = (attachmentName?: string) => sendChat(state.chatDraft, attachmentName);
  const onChatKeyDown = (key: string) => {
    if (key === "Enter") sendMessage();
  };
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
    const inventory = buildInventorySummary(state.fridges[state.activeFridge]);
    const usageSummary = buildUsageSummary(state.usageHistory);
    sendChatMessage(AGENT_ACTIVATE_PROMPT[agent], agent, inventory, undefined, usageSummary)
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
  };
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
      editFridgeIndex: found.fridgeIndex,
      editExpiryDate: toISODate(target),
      editNote: found.item.note,
    });
  };
  const cancelEditItem = () => patch({ isEditingItem: false });
  const onEditNameChange = (value: string) => patch({ editName: value });
  const onEditSectionChange = (value: string) => patch({ editSectionId: value });
  const onEditIconChange = (value: string) => patch({ editIcon: value });
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
      const updatedItem = { ...item, name, icon, note, days: newDays, freshness: newFreshness };

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

  const recordUsage = (name: string, icon: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    recordItemUsage(trimmed, icon)
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
  const markUsed = () => {
    const id = state.selectedItemId;
    if (!id) return;
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
  const discardItem = () => {
    if (!state.selectedItemId) return;
    const found = findItem(state, state.selectedItemId);
    if (!found) return;
    const { item } = found;
    removeItemWithUndo(state.selectedItemId, `Removed "${item.name}"`, () => {
      recordUsage(item.name, item.icon);
    });
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
      let sectionId = fridge.sections[0]?.id;
      if (!sectionId) {
        // Brand-new fridges start with zero sections — create one on the fly, same as barcode/manual.
        const section = await createSection(fridge.id, "General");
        sectionId = section.id;
        fridge = { ...fridge, sections: [...fridge.sections, section] };
        patch((s) => ({
          fridges: s.fridges.map((f, i) => (i === fridgeIndex ? { ...f, sections: [...f.sections, section] } : f)),
        }));
      }

      let detected: DetectedItem[] = [];

      if (state.scanMethod === "receipt") {
        const result = await scanReceipt(sectionId, file);
        detected = result.detected_items.map((d, i) => {
          const icon = FOOD_ICON_KEYS.includes(d.icon) ? d.icon : guessIcon(d.parsed_name) || "leftovers";
          const group = ICON_SECTION[icon];
          return {
            id: "rc" + Date.now() + i,
            name: d.parsed_name,
            icon,
            section: (group && findSectionIdForGroup(fridge.sections, group)) || sectionId,
            checked: true,
            qty: Math.max(1, d.parsed_quantity || 1),
            expiryDate: "",
            location: "fridge" as StorageLocation,
          };
        });
      } else {
        const result = await scanFridgePhoto(sectionId, file);
        detected = result.detected_items.map((d, i) => {
          const icon = FOOD_ICON_KEYS.includes(d.icon) ? d.icon : guessIcon(d.parsed_name) || "leftovers";
          const group = ICON_SECTION[icon];
          return {
            id: "ph" + Date.now() + i,
            name: d.parsed_name,
            icon,
            section: (group && findSectionIdForGroup(fridge.sections, group)) || sectionId,
            checked: true,
            qty: 1,
            expiryDate: "",
            location: "fridge" as StorageLocation,
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
      let sectionId = fridge.sections[0]?.id;
      if (!sectionId) {
        // Brand-new fridges start with zero sections — create one on the fly, same as manual add.
        const section = await createSection(fridge.id, "General");
        sectionId = section.id;
        fridge = { ...fridge, sections: [...fridge.sections, section] };
        patch((s) => ({
          fridges: s.fridges.map((f, i) => (i === fridgeIndex ? { ...f, sections: [...f.sections, section] } : f)),
        }));
      }
      const product = await scanBarcode(sectionId, barcode);
      const icon = FOOD_ICON_KEYS.includes(product.icon) ? product.icon : guessIcon(product.name) || "leftovers";
      const group = ICON_SECTION[icon];
      const target = new Date();
      target.setDate(target.getDate() + (product.default_shelf_life_days || suggestShelfLifeDays(icon)));
      const detected: DetectedItem = {
        id: "bc" + Date.now(),
        name: product.name,
        icon,
        section: (group && findSectionIdForGroup(fridge.sections, group)) || sectionId,
        checked: true,
        qty: 1,
        expiryDate: toISODate(target),
        location: product.location || guessLocation(product.name),
      };
      patch({ addStep: 6, detected: [detected], barcodeLoading: false, barcodeInput: "" });
    } catch (err) {
      patch({ barcodeLoading: false, barcodeError: describeError(err, "Couldn't look up that barcode.") });
    }
  };
  const captureExpiryPhoto = async (file: File) => {
    const sectionId = state.detected[0]?.section;
    if (!sectionId) return;
    patch({ expiryPhotoLoading: true, expiryPhotoError: null });
    try {
      const result = await scanExpiryPhoto(sectionId, file);
      if (!result.found || !result.date) {
        patch({ expiryPhotoLoading: false, expiryPhotoError: result.message || "Couldn't read a date on that photo." });
        return;
      }
      const note = `AI read the expiry date as ${result.date}${result.confidence ? ` (${result.confidence} confidence)` : ""} — double-check before adding.`;
      patch((s) => ({
        detected: s.detected.map((d, i) => (i === 0 ? { ...d, expiryDate: result.date! } : d)),
        expiryPhotoLoading: false,
        expiryPhotoError: null,
        expiryScanNote: note,
        addStep: 2,
      }));
    } catch (err) {
      patch({ expiryPhotoLoading: false, expiryPhotoError: describeError(err, "Couldn't read a date on that photo.") });
    }
  };
  const skipExpiryPhoto = () => patch({ addStep: 2, expiryPhotoError: null, expiryScanNote: null });
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
  const suggestDetectedDetails = (id: string) => {
    const item = state.detected.find((d) => d.id === id);
    if (!item || state.detectedAutoFillLoadingId) return;
    patch({ detectedAutoFillLoadingId: id });
    suggestItemDetails(item.name, item.icon)
      .then(({ shelf_life_days, location }) => {
        const target = new Date();
        target.setDate(target.getDate() + shelf_life_days);
        const expiryDate = toISODate(target);
        patch((s) => ({
          detected: s.detected.map((d) => (d.id === id ? { ...d, expiryDate, location } : d)),
          detectedAutoFillLoadingId: null,
        }));
      })
      .catch((err) => {
        patch({ detectedAutoFillLoadingId: null, syncError: describeError(err, "Couldn't get a suggestion for that item.") });
      });
  };

  const onManualNameChange = (value: string) =>
    patch((s) => {
      const icon = guessIcon(value);
      const fridge = s.fridges[s.addFridgeIndex];
      const group = icon ? ICON_SECTION[icon] : null;
      const guessedSectionId = group && fridge ? findSectionIdForGroup(fridge.sections, group) : null;
      return {
        manualName: value,
        ...(s.manualIconAuto && icon ? { manualIcon: icon } : {}),
        ...(s.manualSectionAuto && guessedSectionId ? { manualSectionId: guessedSectionId } : {}),
      };
    });
  const onManualSectionChange = (value: string) => patch({ manualSectionId: value, manualSectionAuto: false });
  const onManualIconChange = (value: string) => patch({ manualIcon: value, manualIconAuto: false });
  const onManualExpiryDateChange = (value: string) => patch({ manualExpiryDate: value });
  const onManualLocationChange = (location: StorageLocation) => patch({ manualLocation: location });
  const suggestManualDetails = () => {
    const name = state.manualName.trim();
    if (!name || state.manualAutoFillLoading) return;
    patch({ manualAutoFillLoading: true });
    suggestItemDetails(name, state.manualIcon)
      .then(({ shelf_life_days, location }) => {
        const target = new Date();
        target.setDate(target.getDate() + shelf_life_days);
        patch({ manualExpiryDate: toISODate(target), manualLocation: location, manualAutoFillLoading: false });
      })
      .catch((err) => {
        patch({ manualAutoFillLoading: false, syncError: describeError(err, "Couldn't get a suggestion for that item.") });
      });
  };
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
      let sectionId = state.manualSectionId || fridge.sections[0]?.id;
      if (!fridge.sections.some((sec) => sec.id === sectionId)) {
        const section = await createSection(fridge.id, "General");
        sectionId = section.id;
        patch((s) => ({
          fridges: s.fridges.map((f, i) => (i === fridgeIndex ? { ...f, sections: [...f.sections, section] } : f)),
        }));
      }
      const icon = state.manualIcon || (sectionId && DEFAULT_ICON_BY_SECTION[sectionId]) || "leftovers";
      const item = await createItem(sectionId!, {
        name,
        icon,
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
    const toAdd = state.detected.filter((d) => d.checked);
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
    openNotifications,
    openNotificationHistory,
    dismissNotificationWithUndo,
    openAbout,
    toggleNotificationPref,
    openAIDataSettings,
    deleteChatThread,
    clearAllChatData,
    deleteUsageHistoryEntry,
    clearUsageHistory,
    openStylePicker,
    closeStylePicker,
    selectFridgeStyle,
    updateFridgePhoto,
    renameFridge,
    renameFridgeBlur,
    deleteFridge,
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
    onNewShoppingChange,
    onNewShoppingKeyDown,
    addShoppingItem,
    toggleShoppingItem,
    removeShoppingItem,
    clearBought,
    addPredictedToShopping,
    onSearchChange,
    onDraftChange,
    onChatKeyDown,
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
    captureExpiryPhoto,
    captureReceiptOrPhoto,
    skipExpiryPhoto,
    selectItem,
    adjustItemQty,
    markUsed,
    discardItem,
    startEditItem,
    cancelEditItem,
    onEditNameChange,
    onEditSectionChange,
    onEditIconChange,
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
    onManualNameChange,
    onManualSectionChange,
    onManualIconChange,
    onManualExpiryDateChange,
    onManualLocationChange,
    suggestManualDetails,
    onManualNoteChange,
    confirmManualAdd,
    confirmAdd,
    setItemLocation,
    selectFridgeScope,
    setInventorySortMode,
  };

  return { state, actions, chatScrollRef };
}

export type ThatFridgeActions = ReturnType<typeof useThatFridge>["actions"];