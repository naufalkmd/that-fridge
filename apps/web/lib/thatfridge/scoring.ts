import { NUTRITION_CATEGORIES, guessNutritionCategory } from "./data";
import { getScopedItems } from "./selectors";
import type { ThatFridgeState } from "./useThatFridge";
import type { ScoreSnapshot as ScoreSnapshotSlice } from "./types";

// "Your Kitchen This Week" scoring - two lightweight, explainable scores computed entirely
// from data the app already has (items, notification_events, usage_history). No new backend
// state. Both formulas are isolated here, with named/commented constants, specifically so the
// weighting can be tuned later without touching the UI that renders them.
//
// Known data limitations (see README notes in each function below for where they bite):
// - Item removal is now split into "Used it up" (consumed - logs to usage_history) vs "Throw
//   away" (wasted - doesn't), so usage_history is an honest consumption signal. Waste Saver
//   still doesn't get a direct "wasted" event feed from that split (see its own notes below) -
//   it uses the overdue-items-still-present proxy instead, which stays accurate either way.
// - `freshness`/`days` collapse a missing expiry_date to 0 client-side (see apiClient.ts's
//   toClientItem), which is indistinguishable from "expires today" - so freshness=0 alone isn't
//   a safe "expired" signal. `days < 0` is safe (it can only happen from a real past expiry_date),
//   so that's what waste risk is based on instead.
// - There's no purchase/receipt history tied to "already had one of these", so "avoids
//   unnecessary duplicate shopping" (mentioned in the brief) isn't included - there's no existing
//   signal for it, and inventing one would be fake precision.

export interface KitchenScoreResult {
  key: "waste" | "balance" | "organizer" | "shopkeeper";
  label: string;
  /** null = not enough data yet to say anything meaningful. */
  score: number | null;
  headline: string;
  detail: string;
}

export interface ScoreTrend {
  delta: number;
  weekOf: string;
}

export interface ScoreSeriesPoint {
  weekOf: string;
  score: number;
}

// ---- Waste Saver -----------------------------------------------------------------------

const WASTE_BASE_SCORE = 75; // starts neutral-positive rather than 0, per "avoid harsh punishment"
const WASTE_SCORE_FLOOR = 20; // never shown lower than this - a bad week shouldn't feel hopeless
const WASTE_SCORE_CEILING = 98; // reserve 99-100 rather than implying a formula this rough is ever "perfect"
const OVERDUE_PENALTY_CAP = 30;
const RESPONSIVENESS_SWING = 30; // max +/- from expiry-alert follow-through
const ENGAGEMENT_BONUS_CAP = 10;
const ENGAGEMENT_LOOKBACK_DAYS = 14;

/**
 * The one unambiguous "still here past its date" signal (see the file header for why
 * freshness=0 isn't used for this instead) - shared with goals.ts's waste_rate metric so both
 * read the same live snapshot the same way instead of two slightly-different reimplementations.
 */
export function getOverdueItemStats(items: { days: number }[]): { overdueCount: number; totalCount: number; overdueRatio: number } {
  const overdueCount = items.filter((i) => i.days < 0).length;
  return { overdueCount, totalCount: items.length, overdueRatio: items.length > 0 ? overdueCount / items.length : 0 };
}

export function computeWasteSaverScore(state: ThatFridgeState): KitchenScoreResult {
  const items = getScopedItems(state);
  const usageHistory = state.usageHistory;
  const expiringEvents = state.notificationEvents.filter((e) => e.kind === "expiring");

  const hasAnyData = items.length > 0 || usageHistory.length > 0;
  if (!hasAnyData) {
    return {
      key: "waste",
      label: "Waste Saver",
      score: null,
      headline: "Building your score — keep using ThatFridge!",
      detail: "Add and use up a few items to start tracking this.",
    };
  }

  const { overdueCount, overdueRatio } = getOverdueItemStats(items);
  const overduePenalty = Math.min(OVERDUE_PENALTY_CAP, Math.round(overdueRatio * 60));

  // Of the expiry alerts Guardian has raised, how many did the user actually clear? No events
  // yet = neutral (0 swing) rather than guessing.
  const doneCount = expiringEvents.filter((e) => e.done).length;
  const responsivenessAdj =
    expiringEvents.length > 0 ? Math.round((doneCount / expiringEvents.length - 0.5) * RESPONSIVENESS_SWING) : 0;

  // Recent usage activity is a proxy for "actively rotating through food" rather than letting
  // it sit - a small bonus, not the main driver.
  const recentUsageCount = usageHistory.filter((h) => Date.now() - h.lastAt <= ENGAGEMENT_LOOKBACK_DAYS * 86400000).length;
  const engagementBonus = Math.min(ENGAGEMENT_BONUS_CAP, recentUsageCount * 2);

  const raw = WASTE_BASE_SCORE - overduePenalty + responsivenessAdj + engagementBonus;
  const score = Math.max(WASTE_SCORE_FLOOR, Math.min(WASTE_SCORE_CEILING, Math.round(raw)));

  // Kept short: the Kitchen Score card's Guardian tile already shows the overdue count itself
  // as a badge, right below this text, so this only needs to add what the badge can't.
  const detailParts: string[] = [];
  detailParts.push(overdueCount === 0 ? "Nothing sitting past its date." : "A few things need clearing.");
  if (expiringEvents.length > 0) {
    detailParts.push(`${doneCount}/${expiringEvents.length} alerts cleared.`);
  }
  if (recentUsageCount > 0) {
    detailParts.push(`${recentUsageCount} used recently.`);
  }

  return {
    key: "waste",
    label: "Waste Saver",
    score,
    headline: score >= 80 ? "Keeping waste low — great work" : score >= 55 ? "Doing alright, room to improve" : "A few things going stale — worth a look",
    detail: detailParts.join(" "),
  };
}

// ---- Food Balance -----------------------------------------------------------------------

// Only the 5 real food groups count toward variety - "other_extras" (sauces, snacks,
// condiments, drinks, desserts, mixed/prepared dishes) is tracked and taggable like any other
// category, but deliberately excluded here so junk/condiments can't inflate the number. See
// NUTRITION_CATEGORIES in data.ts for the full taxonomy and the reasoning behind each bucket.
const COUNTED_CATEGORIES = NUTRITION_CATEGORIES.filter((c) => c.countsTowardVariety).map((c) => c.key);
const BALANCE_MIN_ENTRIES = 3; // fewer than this and any "variety" reading is just noise
const BALANCE_LOOKBACK_DAYS = 30;
const VARIETY_WEIGHT = 55;
const EVENNESS_WEIGHT = 45;
const BALANCE_SCORE_FLOOR = 20;
const BALANCE_SCORE_CEILING = 98;

/**
 * entry.category may be missing on rows recorded before this taxonomy existed - fall back to
 * guessing from the icon so old usage history isn't silently dropped out of the score. Falls
 * through to null (excluded, same as other_extras) when neither resolves to a counted group.
 * Shared by computeFoodBalanceScore and hasFullFoodGroupVariety so both read "countable usage"
 * the same way.
 */
function countableUsageWithin(usageHistory: ThatFridgeState["usageHistory"], lookbackDays: number) {
  const recentUsage = usageHistory.filter((h) => Date.now() - h.lastAt <= lookbackDays * 86400000);
  return recentUsage
    .map((h) => ({ h, category: h.category ?? guessNutritionCategory(h.icon) }))
    .filter((x): x is { h: (typeof recentUsage)[number]; category: (typeof COUNTED_CATEGORIES)[number] } =>
      (COUNTED_CATEGORIES as string[]).includes(x.category ?? "")
    );
}

function tallyByCategory(countableUsage: { h: { count: number }; category: (typeof COUNTED_CATEGORIES)[number] }[]) {
  const groupCounts = Object.fromEntries(COUNTED_CATEGORIES.map((c) => [c, 0])) as Record<(typeof COUNTED_CATEGORIES)[number], number>;
  for (const { h, category } of countableUsage) groupCounts[category] += h.count;
  return groupCounts;
}

/** Powers the full_week_variety badge - true the moment every counted food group has been used. */
export function hasFullFoodGroupVariety(state: ThatFridgeState): boolean {
  const countableUsage = countableUsageWithin(state.usageHistory, BALANCE_LOOKBACK_DAYS);
  const groupCounts = tallyByCategory(countableUsage);
  return COUNTED_CATEGORIES.every((g) => groupCounts[g] > 0);
}

export function computeFoodBalanceScore(state: ThatFridgeState): KitchenScoreResult {
  const countableUsage = countableUsageWithin(state.usageHistory, BALANCE_LOOKBACK_DAYS);

  if (countableUsage.length < BALANCE_MIN_ENTRIES) {
    return {
      key: "balance",
      label: "Food Balance",
      score: null,
      headline: "Building your score — keep using ThatFridge!",
      detail: "Use up items across a few food groups to start tracking this.",
    };
  }

  const groupCounts = tallyByCategory(countableUsage);

  const total = Object.values(groupCounts).reduce((a, b) => a + b, 0);
  const usedGroups = COUNTED_CATEGORIES.filter((g) => groupCounts[g] > 0);
  const varietyRatio = usedGroups.length / COUNTED_CATEGORIES.length;
  const maxShare = total > 0 ? Math.max(...Object.values(groupCounts)) / total : 1;

  const raw = VARIETY_WEIGHT * varietyRatio + EVENNESS_WEIGHT * (1 - maxShare);
  const score = Math.max(BALANCE_SCORE_FLOOR, Math.min(BALANCE_SCORE_CEILING, Math.round(raw)));

  // Kept short: the Kitchen Score card's Chef tile already shows which groups are used/missing
  // as icons, right below this text, so this only needs the disclaimer the icons can't carry.
  const labelFor = (key: string) => NUTRITION_CATEGORIES.find((c) => c.key === key)?.label ?? key;
  const missingGroups = COUNTED_CATEGORIES.filter((g) => groupCounts[g] === 0);
  const detail = missingGroups.length === 0 ? "Good spread this month." : `Still missing ${missingGroups.map(labelFor).join("/")}.`;

  return {
    key: "balance",
    label: "Food Balance",
    score,
    headline: score >= 80 ? "Nice variety lately" : score >= 55 ? "Decent mix, could spread out more" : "Mostly one type of food lately",
    detail: detail + " Not nutrition or medical advice.",
  };
}

export interface FoodGroupCoverage {
  key: string;
  label: string;
  used: boolean;
}

/**
 * Per-category breakdown backing the Food Balance card's group icons + "x/5 groups" caption.
 * Shares countableUsageWithin/tallyByCategory with computeFoodBalanceScore, and the same
 * BALANCE_MIN_ENTRIES gate, so the two never disagree about whether there's enough data yet.
 */
export function getFoodGroupCoverage(state: ThatFridgeState): FoodGroupCoverage[] | null {
  const countableUsage = countableUsageWithin(state.usageHistory, BALANCE_LOOKBACK_DAYS);
  if (countableUsage.length < BALANCE_MIN_ENTRIES) return null;
  const groupCounts = tallyByCategory(countableUsage);
  return COUNTED_CATEGORIES.map((key) => ({
    key,
    label: NUTRITION_CATEGORIES.find((c) => c.key === key)?.label ?? key,
    used: groupCounts[key] > 0,
  }));
}

// ---- Tidiness (Organizer) ---------------------------------------------------------------
//
// Unlike waste/balance, there's no synchronous "is this item in the right spot" signal -
// organizerSuggestedMoves only exists after an on-demand AI sweep (checkOrganizerMoves in
// useThatFridge.ts) and gets consumed as the user applies/dismisses each suggestion, so it
// can't back a score read on every render. Instead this reads a cumulative, all-time tally
// (organizerTally, from GET /organizer-tally) that useThatFridge.ts updates after every sweep -
// see backend/API.md's "Organizer tally" section. Never resets, so a single messy week doesn't
// erase a long track record the way a point-in-time check would.

const ORGANIZER_MIN_CHECKED = 5;
const ORGANIZER_SCORE_FLOOR = 20;
const ORGANIZER_SCORE_CEILING = 98;

export function computeOrganizerScore(state: ThatFridgeState): KitchenScoreResult {
  const tally = state.organizerTally;

  if (!tally || tally.itemsCheckedTotal < ORGANIZER_MIN_CHECKED) {
    return {
      key: "organizer",
      label: "Tidiness",
      score: null,
      headline: "Building your score — keep using ThatFridge!",
      detail: "Activate Organizer a few times (crew actions on) to start tracking this.",
    };
  }

  const correctRatio = tally.itemsCorrectTotal / tally.itemsCheckedTotal;
  const score = Math.max(ORGANIZER_SCORE_FLOOR, Math.min(ORGANIZER_SCORE_CEILING, Math.round(correctRatio * 100)));
  const misplacedTotal = tally.itemsCheckedTotal - tally.itemsCorrectTotal;

  return {
    key: "organizer",
    label: "Tidiness",
    score,
    headline: score >= 80 ? "Everything's got a home" : score >= 55 ? "Mostly put away right" : "Worth a tidy-up",
    // Kept short: the ring below this text already spells out the exact correct/checked count.
    detail: misplacedTotal === 0 ? "Everything checked was already in place." : "Most items checked were already in place.",
  };
}

// ---- Shopkeeper (list follow-through) ----------------------------------------------------
//
// The only synchronous signal here is the shopping list's own checked/unchecked split - there's
// no purchase history to tell "avoided a duplicate buy" apart from "didn't need it after all",
// so that's not attempted (same reasoning as the file header's note on money_saved). This reads
// as "how much of what you decided you needed has actually made it home", not shopping
// cleverness.

const SHOPKEEPER_MIN_ITEMS = 3;
const SHOPKEEPER_SCORE_FLOOR = 20;
const SHOPKEEPER_SCORE_CEILING = 98;

export function computeShopkeeperScore(state: ThatFridgeState): KitchenScoreResult {
  const list = state.shoppingList;

  if (list.length < SHOPKEEPER_MIN_ITEMS) {
    return {
      key: "shopkeeper",
      label: "Shopping List",
      score: null,
      headline: "Building your score — keep using ThatFridge!",
      detail: "Add a few items to your shopping list to start tracking this.",
    };
  }

  const checkedCount = list.filter((i) => i.checked).length;
  const score = Math.max(SHOPKEEPER_SCORE_FLOOR, Math.min(SHOPKEEPER_SCORE_CEILING, Math.round((checkedCount / list.length) * 100)));

  return {
    key: "shopkeeper",
    label: "Shopping List",
    score,
    headline: score >= 80 ? "Almost everything's picked up" : score >= 55 ? "Halfway through the list" : "A lot still on the list",
    // Kept short: the progress bar below this text already spells out the exact picked-up count.
    detail: checkedCount === list.length ? "Whole list picked up." : "Still picking up items on the list.",
  };
}

/** Simple average of whichever sub-scores currently have a value - null only if all four do. */
export function getOverallScore(results: KitchenScoreResult[]): number | null {
  const scored = results.filter((r): r is KitchenScoreResult & { score: number } => r.score !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length);
}

// ---- Trend (real weekly history, backend/API.md's "Score snapshots") -----------------------
//
// Snapshots are written server-side, weekly, by app:snapshot-kitchen-scores - independent of
// whether the user opened the app that week. Trend compares the live score (still computed
// instantly, client-side, above) against the most recent snapshot, so it's honest about the
// lag rather than implying day-level precision the weekly cron can't back up.

export function getScoreTrend(snapshots: ScoreSnapshotSlice[], key: "waste" | "balance", currentScore: number | null): ScoreTrend | null {
  if (currentScore === null || snapshots.length === 0) return null;
  const mostRecent = [...snapshots].sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0))[0];
  const compareScore = key === "waste" ? mostRecent.wasteScore : mostRecent.balanceScore;
  if (compareScore === null) return null;
  return { delta: currentScore - compareScore, weekOf: mostRecent.weekOf };
}

const SPARKLINE_MAX_POINTS = 8;

/**
 * Oldest-to-newest series for the Waste Saver sparkline: real weekly snapshots plus the current
 * live score as the final point, capped to the most recent SPARKLINE_MAX_POINTS so the line
 * doesn't grow unbounded over a long account history.
 */
export function getScoreSeries(snapshots: ScoreSnapshotSlice[], key: "waste" | "balance", currentScore: number | null): ScoreSeriesPoint[] {
  if (currentScore === null) return [];
  const sorted = [...snapshots].sort((a, b) => (a.weekOf < b.weekOf ? -1 : a.weekOf > b.weekOf ? 1 : 0));
  const points: ScoreSeriesPoint[] = sorted
    .map((s) => ({ weekOf: s.weekOf, score: key === "waste" ? s.wasteScore : s.balanceScore }))
    .filter((p): p is ScoreSeriesPoint => p.score !== null);
  points.push({ weekOf: "now", score: currentScore });
  return points.slice(-SPARKLINE_MAX_POINTS);
}
