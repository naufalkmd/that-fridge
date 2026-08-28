// Home-screen pure logic — the mobile port of apps/web's selectors.ts + scoring.ts +
// streak.ts, adapted to take explicit inputs instead of the web's ThatFridgeState. Kept
// framework-free so both apps/mobile and (eventually) apps/web can share it.

import { freshColor } from "./domain";
import type { FlatItem } from "./api";
import type {
  Fridge,
  FridgeStyleKey,
  NotificationEvent,
  NutritionCategory,
  OrganizerTally,
  ScoreSnapshot,
  ShoppingItem,
  UsageHistoryEntry,
} from "./types";

// ---- fridge / crew selectors ----------------------------------------------------------

/** The single item most in need of attention — lowest freshness in the given set. */
export function guardianItem(items: FlatItem[]): FlatItem | null {
  return items.length ? items.reduce((a, b) => (a.freshness < b.freshness ? a : b)) : null;
}

/** First low-stock item (qty ≤ 2) that isn't already the Guardian pick. */
export function lowStockItem(items: FlatItem[], excludeId?: string | null): FlatItem | null {
  return items.find((i) => i.qty <= 2 && i.id !== excludeId) ?? null;
}

/** Up to `limit` items under 50% fresh, worst first — the "use it up" / needs-attention list. */
export function expiringOwnedItems(items: FlatItem[], limit = 5): FlatItem[] {
  return [...items]
    .sort((a, b) => a.freshness - b.freshness)
    .filter((i) => i.freshness < 50)
    .slice(0, limit);
}

// Alternate fridge-look background tints — mirrors FRIDGE_STYLES in apps/web/lib/thatfridge/data.ts.
// The photo asset itself is resolved in the RN component (require() by style key); this only
// carries the data-derived fields + the backdrop colour shown while the photo loads.
const FRIDGE_STYLE_BG: Record<string, string> = {
  photo: "#4a89c9",
  classic: "#4a89c9",
  french: "#dbe6f2",
  retro: "#8fcda6",
  mini: "#eaf3fb",
  custom: "#4a89c9",
};

export interface FridgeHeroView {
  id: string;
  name: string;
  itemCount: number;
  freshness: number;
  color: string;
  style: FridgeStyleKey;
  isCustom: boolean;
  photoUrl: string | null;
  bg: string;
  isShared: boolean;
}

export function fridgeHeroViews(fridges: Fridge[]): FridgeHeroView[] {
  return fridges.map((f) => {
    const items = f.sections.flatMap((s) => s.items);
    const freshness = items.length
      ? Math.round(items.reduce((a, i) => a + i.freshness, 0) / items.length)
      : 0;
    const style = (f.style || "photo") as FridgeStyleKey;
    return {
      id: f.id,
      name: f.name,
      itemCount: items.length,
      freshness,
      color: freshColor(freshness),
      style,
      isCustom: style === "custom",
      photoUrl: f.photoUrl ?? null,
      bg: FRIDGE_STYLE_BG[style] ?? "#4a89c9",
      isShared: (f.memberCount ?? 1) > 1,
    };
  });
}

// ---- "Your Kitchen This Week" scoring ------------------------------------------------
//
// Faithful port of apps/web/lib/thatfridge/scoring.ts. The web version reads everything off
// ThatFridgeState; here each compute* takes an explicit `KitchenScoreInput`. Fields the mobile
// app doesn't fetch yet (usageHistory, organizerTally, shoppingList, scoreSnapshots) default to
// empty, which makes the affected sub-scores return `score: null` ("Building your score…") —
// exactly the web's own not-enough-data state.

export interface KitchenScoreInput {
  items: { days: number; freshness: number }[];
  notificationEvents?: Pick<NotificationEvent, "kind" | "done">[];
  usageHistory?: UsageHistoryEntry[];
  organizerTally?: OrganizerTally | null;
  shoppingList?: Pick<ShoppingItem, "checked">[];
}

export interface KitchenScoreResult {
  key: "waste" | "balance" | "organizer" | "shopkeeper";
  label: string;
  /** null = not enough data yet to say anything meaningful. */
  score: number | null;
  headline: string;
  detail: string;
}

const BUILDING = "Building your score — keep using ThatFridge!";

// ---- Waste Saver --------------------------------------------------------------------

const WASTE_BASE_SCORE = 75;
const WASTE_SCORE_FLOOR = 20;
const WASTE_SCORE_CEILING = 98;
const OVERDUE_PENALTY_CAP = 30;
const RESPONSIVENESS_SWING = 30;
const ENGAGEMENT_BONUS_CAP = 10;
const ENGAGEMENT_LOOKBACK_DAYS = 14;

export function getOverdueItemStats(items: { days: number }[]) {
  const overdueCount = items.filter((i) => i.days < 0).length;
  return {
    overdueCount,
    totalCount: items.length,
    overdueRatio: items.length > 0 ? overdueCount / items.length : 0,
  };
}

export function computeWasteSaverScore(input: KitchenScoreInput): KitchenScoreResult {
  const items = input.items;
  const usageHistory = input.usageHistory ?? [];
  const expiringEvents = (input.notificationEvents ?? []).filter((e) => e.kind === "expiring");

  if (items.length === 0 && usageHistory.length === 0) {
    return {
      key: "waste",
      label: "Waste Saver",
      score: null,
      headline: BUILDING,
      detail: "Add and use up a few items to start tracking this.",
    };
  }

  const { overdueCount, overdueRatio } = getOverdueItemStats(items);
  const overduePenalty = Math.min(OVERDUE_PENALTY_CAP, Math.round(overdueRatio * 60));

  const doneCount = expiringEvents.filter((e) => e.done).length;
  const responsivenessAdj =
    expiringEvents.length > 0
      ? Math.round((doneCount / expiringEvents.length - 0.5) * RESPONSIVENESS_SWING)
      : 0;

  const recentUsageCount = usageHistory.filter(
    (h) => Date.now() - h.lastAt <= ENGAGEMENT_LOOKBACK_DAYS * 86400000,
  ).length;
  const engagementBonus = Math.min(ENGAGEMENT_BONUS_CAP, recentUsageCount * 2);

  const raw = WASTE_BASE_SCORE - overduePenalty + responsivenessAdj + engagementBonus;
  const score = Math.max(WASTE_SCORE_FLOOR, Math.min(WASTE_SCORE_CEILING, Math.round(raw)));

  const detailParts: string[] = [
    overdueCount === 0 ? "Nothing sitting past its date." : "A few things need clearing.",
  ];
  if (expiringEvents.length > 0) detailParts.push(`${doneCount}/${expiringEvents.length} alerts cleared.`);
  if (recentUsageCount > 0) detailParts.push(`${recentUsageCount} used recently.`);

  return {
    key: "waste",
    label: "Waste Saver",
    score,
    headline:
      score >= 80
        ? "Keeping waste low — great work"
        : score >= 55
          ? "Doing alright, room to improve"
          : "A few things going stale — worth a look",
    detail: detailParts.join(" "),
  };
}

// ---- Food Balance ------------------------------------------------------------------

const COUNTED_CATEGORIES: NutritionCategory[] = ["protein", "vegetables", "fruit", "grains", "dairy"];
const CATEGORY_LABELS: Record<string, string> = {
  protein: "Protein",
  vegetables: "Vegetables",
  fruit: "Fruit",
  grains: "Grains & Starches",
  dairy: "Dairy",
};
const BALANCE_MIN_ENTRIES = 3;
const BALANCE_LOOKBACK_DAYS = 30;
const VARIETY_WEIGHT = 55;
const EVENNESS_WEIGHT = 45;
const BALANCE_SCORE_FLOOR = 20;
const BALANCE_SCORE_CEILING = 98;

function countableUsage(usageHistory: UsageHistoryEntry[]) {
  return usageHistory
    .filter((h) => Date.now() - h.lastAt <= BALANCE_LOOKBACK_DAYS * 86400000)
    .filter((h): h is UsageHistoryEntry & { category: NutritionCategory } =>
      COUNTED_CATEGORIES.includes((h.category ?? "") as NutritionCategory),
    );
}

function tallyByCategory(usage: (UsageHistoryEntry & { category: NutritionCategory })[]) {
  const counts = Object.fromEntries(COUNTED_CATEGORIES.map((c) => [c, 0])) as Record<NutritionCategory, number>;
  for (const u of usage) counts[u.category] += u.count;
  return counts;
}

export function hasFullFoodGroupVariety(usageHistory: UsageHistoryEntry[] = []): boolean {
  const counts = tallyByCategory(countableUsage(usageHistory));
  return COUNTED_CATEGORIES.every((g) => counts[g] > 0);
}

export function computeFoodBalanceScore(input: KitchenScoreInput): KitchenScoreResult {
  const usage = countableUsage(input.usageHistory ?? []);

  if (usage.length < BALANCE_MIN_ENTRIES) {
    return {
      key: "balance",
      label: "Food Balance",
      score: null,
      headline: BUILDING,
      detail: "Use up items across a few food groups to start tracking this.",
    };
  }

  const counts = tallyByCategory(usage);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const usedGroups = COUNTED_CATEGORIES.filter((g) => counts[g] > 0);
  const varietyRatio = usedGroups.length / COUNTED_CATEGORIES.length;
  const maxShare = total > 0 ? Math.max(...Object.values(counts)) / total : 1;

  const raw = VARIETY_WEIGHT * varietyRatio + EVENNESS_WEIGHT * (1 - maxShare);
  const score = Math.max(BALANCE_SCORE_FLOOR, Math.min(BALANCE_SCORE_CEILING, Math.round(raw)));

  const missing = COUNTED_CATEGORIES.filter((g) => counts[g] === 0);
  const detail =
    (missing.length === 0
      ? "Good spread this month."
      : `Still missing ${missing.map((m) => CATEGORY_LABELS[m] ?? m).join("/")}.`) +
    " Not nutrition or medical advice.";

  return {
    key: "balance",
    label: "Food Balance",
    score,
    headline:
      score >= 80
        ? "Nice variety lately"
        : score >= 55
          ? "Decent mix, could spread out more"
          : "Mostly one type of food lately",
    detail,
  };
}

// ---- Tidiness (Organizer) --------------------------------------------------------

const ORGANIZER_MIN_CHECKED = 5;
const ORGANIZER_SCORE_FLOOR = 20;
const ORGANIZER_SCORE_CEILING = 98;

export function computeOrganizerScore(input: KitchenScoreInput): KitchenScoreResult {
  const tally = input.organizerTally;

  if (!tally || tally.itemsCheckedTotal < ORGANIZER_MIN_CHECKED) {
    return {
      key: "organizer",
      label: "Tidiness",
      score: null,
      headline: BUILDING,
      detail: "Activate Organizer a few times (crew actions on) to start tracking this.",
    };
  }

  const correctRatio = tally.itemsCorrectTotal / tally.itemsCheckedTotal;
  const score = Math.max(
    ORGANIZER_SCORE_FLOOR,
    Math.min(ORGANIZER_SCORE_CEILING, Math.round(correctRatio * 100)),
  );
  const misplaced = tally.itemsCheckedTotal - tally.itemsCorrectTotal;

  return {
    key: "organizer",
    label: "Tidiness",
    score,
    headline: score >= 80 ? "Everything's got a home" : score >= 55 ? "Mostly put away right" : "Worth a tidy-up",
    detail:
      misplaced === 0
        ? "Everything checked was already in place."
        : "Most items checked were already in place.",
  };
}

// ---- Shopkeeper (list follow-through) ------------------------------------------

const SHOPKEEPER_MIN_ITEMS = 3;
const SHOPKEEPER_SCORE_FLOOR = 20;
const SHOPKEEPER_SCORE_CEILING = 98;

export function computeShopkeeperScore(input: KitchenScoreInput): KitchenScoreResult {
  const list = input.shoppingList ?? [];

  if (list.length < SHOPKEEPER_MIN_ITEMS) {
    return {
      key: "shopkeeper",
      label: "Shopping List",
      score: null,
      headline: BUILDING,
      detail: "Add a few items to your shopping list to start tracking this.",
    };
  }

  const checked = list.filter((i) => i.checked).length;
  const score = Math.max(
    SHOPKEEPER_SCORE_FLOOR,
    Math.min(SHOPKEEPER_SCORE_CEILING, Math.round((checked / list.length) * 100)),
  );

  return {
    key: "shopkeeper",
    label: "Shopping List",
    score,
    headline:
      score >= 80
        ? "Almost everything's picked up"
        : score >= 55
          ? "Halfway through the list"
          : "A lot still on the list",
    detail: checked === list.length ? "Whole list picked up." : "Still picking up items on the list.",
  };
}

/** Simple average of whichever sub-scores currently have a value — null only if all four do. */
export function getOverallScore(results: KitchenScoreResult[]): number | null {
  const scored = results.filter((r): r is KitchenScoreResult & { score: number } => r.score !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length);
}

export function kitchenScoreResults(input: KitchenScoreInput): KitchenScoreResult[] {
  return [
    computeWasteSaverScore(input),
    computeFoodBalanceScore(input),
    computeOrganizerScore(input),
    computeShopkeeperScore(input),
  ];
}

// ---- Streak (loss-aversion mechanic on Waste Saver) --------------------------

export const WASTE_STREAK_THRESHOLD = 70;

/**
 * Delta of a live sub-score vs the most recent weekly snapshot — the "▲ +3 vs last week"
 * readout on the Waste Saver / Food Balance cards. null when there's no snapshot or no live score.
 */
export function getScoreTrend(
  snapshots: ScoreSnapshot[],
  key: "waste" | "balance",
  currentScore: number | null,
): { delta: number; weekOf: string } | null {
  if (currentScore === null || snapshots.length === 0) return null;
  const mostRecent = [...snapshots].sort((a, b) =>
    a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0,
  )[0];
  const compare = key === "waste" ? mostRecent.wasteScore : mostRecent.balanceScore;
  if (compare === null) return null;
  return { delta: currentScore - compare, weekOf: mostRecent.weekOf };
}

export function computeStreak(
  snapshots: ScoreSnapshot[],
  threshold: number = WASTE_STREAK_THRESHOLD,
): number {
  const sorted = [...snapshots].sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0));
  let streak = 0;
  for (const snap of sorted) {
    if (snap.wasteScore < threshold) break;
    streak++;
  }
  return streak;
}
