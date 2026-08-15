import { NUTRITION_CATEGORIES, guessNutritionCategory } from "./data";
import { getScopedItems } from "./selectors";
import type { ThatFridgeState } from "./useThatFridge";

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
  key: "waste" | "balance";
  emoji: string;
  label: string;
  /** null = not enough data yet to say anything meaningful. */
  score: number | null;
  headline: string;
  detail: string;
}

export interface ScoreTrend {
  delta: number;
  days: number;
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
      emoji: "🌱",
      label: "Waste Saver",
      score: null,
      headline: "Building your score — keep using ThatFridge!",
      detail: "Add a few items and use some up and this will start tracking how well you're staying ahead of expiry.",
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

  const detailParts: string[] = [];
  detailParts.push(
    overdueCount === 0
      ? "Nothing is sitting past its date right now — nice work staying on top of it."
      : `${overdueCount} item${overdueCount === 1 ? " is" : "s are"} past its date and still in your fridge — clearing ${overdueCount === 1 ? "it" : "them"} out is the fastest way to raise this score.`
  );
  if (expiringEvents.length > 0) {
    detailParts.push(`You've cleared ${doneCount} of ${expiringEvents.length} expiry alerts.`);
  }
  if (recentUsageCount > 0) {
    detailParts.push(`${recentUsageCount} item${recentUsageCount === 1 ? "" : "s"} used up in the last ${ENGAGEMENT_LOOKBACK_DAYS} days.`);
  }

  return {
    key: "waste",
    emoji: "🌱",
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

export function computeFoodBalanceScore(state: ThatFridgeState): KitchenScoreResult {
  const recentUsage = state.usageHistory.filter((h) => Date.now() - h.lastAt <= BALANCE_LOOKBACK_DAYS * 86400000);

  // entry.category may be missing on rows recorded before this taxonomy existed - fall back to
  // guessing from the icon so old usage history isn't silently dropped out of the score. Falls
  // through to null (excluded, same as other_extras) when neither resolves to a counted group.
  const countableUsage = recentUsage
    .map((h) => ({ h, category: h.category ?? guessNutritionCategory(h.icon) }))
    .filter((x): x is { h: (typeof recentUsage)[number]; category: (typeof COUNTED_CATEGORIES)[number] } =>
      (COUNTED_CATEGORIES as string[]).includes(x.category ?? "")
    );

  if (countableUsage.length < BALANCE_MIN_ENTRIES) {
    return {
      key: "balance",
      emoji: "🥗",
      label: "Food Balance",
      score: null,
      headline: "Building your score — keep using ThatFridge!",
      detail: "Use up a few more items across different food groups and this will start reflecting your variety.",
    };
  }

  const groupCounts = Object.fromEntries(COUNTED_CATEGORIES.map((c) => [c, 0])) as Record<(typeof COUNTED_CATEGORIES)[number], number>;
  for (const { h, category } of countableUsage) groupCounts[category] += h.count;

  const total = Object.values(groupCounts).reduce((a, b) => a + b, 0);
  const usedGroups = COUNTED_CATEGORIES.filter((g) => groupCounts[g] > 0);
  const varietyRatio = usedGroups.length / COUNTED_CATEGORIES.length;
  const maxShare = total > 0 ? Math.max(...Object.values(groupCounts)) / total : 1;

  const raw = VARIETY_WEIGHT * varietyRatio + EVENNESS_WEIGHT * (1 - maxShare);
  const score = Math.max(BALANCE_SCORE_FLOOR, Math.min(BALANCE_SCORE_CEILING, Math.round(raw)));

  const labelFor = (key: string) => NUTRITION_CATEGORIES.find((c) => c.key === key)?.label ?? key;
  const missingGroups = COUNTED_CATEGORIES.filter((g) => groupCounts[g] === 0);
  const detail =
    missingGroups.length === 0
      ? "You've used items across every food group we track recently — good spread."
      : `You've recently used ${usedGroups.map(labelFor).join(", ") || "nothing yet"} — try adding some ${missingGroups.map(labelFor).join("/")} for a wider mix.`;

  return {
    key: "balance",
    emoji: "🥗",
    label: "Food Balance",
    score,
    headline: score >= 80 ? "Nice variety lately" : score >= 55 ? "Decent mix, could spread out more" : "Mostly one type of food lately",
    detail: detail + " This is a lightweight variety signal only — not nutrition or medical advice.",
  };
}

// ---- Trend (local, per-browser history) ----------------------------------------------------
//
// There's no backend table tracking score history over time, and adding one is out of scope
// for a derived/presentational number like this - so the week-over-week trend is approximated
// by snapshotting today's scores to localStorage (namespaced per user email) and comparing
// against whatever's closest to 7 days old. This means the trend is per-browser (clearing site
// data or switching devices resets it), not a synced account-level history - an explicit,
// documented trade-off rather than fabricating one.

const HISTORY_KEY_PREFIX = "thatfridge_kitchen_score_history";
const HISTORY_MAX_DAYS = 60;
const TREND_LOOKBACK_MIN_DAYS = 5;
const TREND_LOOKBACK_MAX_DAYS = 9;

interface ScoreSnapshot {
  date: string; // YYYY-MM-DD
  waste: number;
  balance: number;
}

function historyKey(userEmail: string | null | undefined): string {
  return userEmail ? `${HISTORY_KEY_PREFIX}:${userEmail}` : HISTORY_KEY_PREFIX;
}

function loadHistory(userEmail: string | null | undefined): ScoreSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(historyKey(userEmail));
    return raw ? (JSON.parse(raw) as ScoreSnapshot[]) : [];
  } catch {
    return [];
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Idempotent per calendar day - safe to call on every Home render. */
export function recordDailyScoreSnapshot(userEmail: string | null | undefined, waste: number | null, balance: number | null): void {
  if (typeof window === "undefined" || waste === null || balance === null) return;
  const today = todayKey();
  const history = loadHistory(userEmail);
  if (history.some((h) => h.date === today)) return;

  const cutoff = Date.now() - HISTORY_MAX_DAYS * 86400000;
  const pruned = history.filter((h) => new Date(h.date).getTime() >= cutoff);
  pruned.push({ date: today, waste, balance });

  try {
    window.localStorage.setItem(historyKey(userEmail), JSON.stringify(pruned));
  } catch {
    // Storage full/unavailable - the trend just won't have today's point. Not worth surfacing.
  }
}

function findWeekAgoSnapshot(history: ScoreSnapshot[]): ScoreSnapshot | null {
  let best: { snap: ScoreSnapshot; diff: number } | null = null;
  for (const snap of history) {
    const ageDays = (Date.now() - new Date(snap.date).getTime()) / 86400000;
    if (ageDays < TREND_LOOKBACK_MIN_DAYS || ageDays > TREND_LOOKBACK_MAX_DAYS) continue;
    const diff = Math.abs(ageDays - 7);
    if (!best || diff < best.diff) best = { snap, diff };
  }
  return best?.snap ?? null;
}

export function getScoreTrend(userEmail: string | null | undefined, key: "waste" | "balance", currentScore: number | null): ScoreTrend | null {
  if (currentScore === null) return null;
  const weekAgo = findWeekAgoSnapshot(loadHistory(userEmail));
  if (!weekAgo) return null;
  const days = Math.round((Date.now() - new Date(weekAgo.date).getTime()) / 86400000);
  return { delta: currentScore - weekAgo[key], days };
}
