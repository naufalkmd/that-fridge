import type { CalendarEntry, NutritionCategory, UsageHistoryEntry } from "@thatfridge/core";

import { addDays, weekDays } from "@/lib/calendar";

// Pure number-crunching for the Insights screen (no React, no I/O), built from what the app already
// has: the calendar feed (used / thrown-out counts per day, meals with calories) and usage history.

export interface WeekBucket {
  /** First day of the week (YYYY-MM-DD). */
  start: string;
  used: number;
  wasted: number;
}

export interface WasteSummary {
  used: number;
  wasted: number;
  /** Thrown out as a share of everything removed (0-100), null when nothing was removed. */
  wasteRate: number | null;
  /** Oldest to newest; always `weeks` long so the chart keeps its shape. */
  weeks: WeekBucket[];
}

/** Used-up vs thrown-out over the last `weeks` weeks ending with the week of `today`. */
export function wasteSummary(entries: CalendarEntry[], today: string, weeks = 4): WasteSummary {
  const thisWeek = weekDays(today)[0];
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(thisWeek, -7 * (weeks - 1 - i)),
    used: 0,
    wasted: 0,
  }));
  for (const e of entries) {
    if (e.kind !== "used" && e.kind !== "wasted") continue;
    const bucket = buckets.find((b) => e.date >= b.start && e.date <= addDays(b.start, 6));
    if (!bucket) continue;
    bucket[e.kind] += e.count ?? 0;
  }
  const used = buckets.reduce((n, b) => n + b.used, 0);
  const wasted = buckets.reduce((n, b) => n + b.wasted, 0);
  return { used, wasted, wasteRate: used + wasted > 0 ? Math.round((wasted / (used + wasted)) * 100) : null, weeks: buckets };
}

export interface CalorieDay {
  date: string;
  /** Estimated kcal of meals still planned for the day. */
  planned: number;
  /** Estimated kcal of meals marked cooked. */
  cooked: number;
}

export interface CalorieSummary {
  days: CalorieDay[];
  plannedTotal: number;
  cookedTotal: number;
  /** Average kcal per day that has any meal (planned or cooked), null when there are none. */
  dailyAverage: number | null;
  /** Meals in the week whose calories we couldn't estimate, so they're missing from the totals. */
  unknown: number;
}

/** Calories per day across the week of `anchor`. Skipped meals don't count. */
export function calorieSummary(entries: CalendarEntry[], anchor: string): CalorieSummary {
  const days: CalorieDay[] = weekDays(anchor).map((date) => ({ date, planned: 0, cooked: 0 }));
  let unknown = 0;
  for (const e of entries) {
    if (e.kind !== "meal" || e.status === "skipped") continue;
    const day = days.find((d) => d.date === e.date);
    if (!day) continue;
    if (e.calories == null) {
      unknown += 1;
      continue;
    }
    if (e.status === "cooked") day.cooked += e.calories;
    else day.planned += e.calories;
  }
  const plannedTotal = days.reduce((n, d) => n + d.planned, 0);
  const cookedTotal = days.reduce((n, d) => n + d.cooked, 0);
  const withMeals = days.filter((d) => d.planned + d.cooked > 0).length;
  return {
    days,
    plannedTotal,
    cookedTotal,
    dailyAverage: withMeals > 0 ? Math.round((plannedTotal + cookedTotal) / withMeals) : null,
    unknown,
  };
}

export interface GroupShare {
  key: NutritionCategory;
  label: string;
  count: number;
  /** Share of all categorised uses (0-100). */
  percent: number;
}

const GROUPS: { key: NutritionCategory; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "vegetables", label: "Vegetables" },
  { key: "fruit", label: "Fruit" },
  { key: "grains", label: "Grains" },
  { key: "dairy", label: "Dairy" },
  { key: "other_extras", label: "Other" },
];

/** What the household has been using up, by food group. Empty when nothing categorised was used. */
export function foodGroupShares(usage: UsageHistoryEntry[]): GroupShare[] {
  const counts = new Map<NutritionCategory, number>();
  for (const u of usage) {
    if (u.category) counts.set(u.category, (counts.get(u.category) ?? 0) + u.count);
  }
  const total = [...counts.values()].reduce((n, c) => n + c, 0);
  if (total === 0) return [];
  return GROUPS.map((g) => ({ ...g, count: counts.get(g.key) ?? 0, percent: Math.round(((counts.get(g.key) ?? 0) / total) * 100) }));
}

/** The items used most often, most first. */
export function topUsed(usage: UsageHistoryEntry[], limit = 5): UsageHistoryEntry[] {
  return [...usage].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Average freshness (0-100) of items at the moment they were used, null without samples. */
export function freshnessAtUse(usage: UsageHistoryEntry[]): number | null {
  const samples = usage.reduce((n, u) => n + u.freshnessSampleCount, 0);
  if (samples === 0) return null;
  return Math.round(usage.reduce((n, u) => n + u.freshnessSum, 0) / samples);
}

// ---- plain-language summaries: the page shows a sentence and a shape, not a table of numbers -------------------

/** The word for a 0-100 score, and its colour family. */
export function scoreBand(score: number | null): { label: string; tone: "good" | "warn" | "bad" | "none" } {
  if (score === null) return { label: "Building", tone: "none" };
  if (score >= 80) return { label: "Great", tone: "good" };
  if (score >= 55) return { label: "Okay", tone: "warn" };
  return { label: "Needs care", tone: "bad" };
}

/** "You used up 8 of 10 items." - null when nothing has been removed yet. */
export function wasteHeadline(w: WasteSummary): string | null {
  const total = w.used + w.wasted;
  if (total === 0) return null;
  if (w.wasted === 0) return `You used up all ${total} item${total === 1 ? "" : "s"}. Nothing wasted.`;

  return `You used up ${w.used} of ${total} items. ${w.wasted} ${w.wasted === 1 ? "was" : "were"} thrown out.`;
}

/** Calories are estimates, so round to the nearest 50: "≈ 1,850" reads truer than "1,847". */
export function roundKcal(n: number): number {
  return Math.round(n / 50) * 50;
}

/** The one calorie number worth showing: the daily average on days that have meals. */
export function calorieHeadline(c: CalorieSummary): { value: number; caption: string } | null {
  if (c.dailyAverage === null) return null;
  const cooked = c.cookedTotal > 0;

  return { value: roundKcal(c.dailyAverage), caption: cooked ? "kcal a day, planned and cooked" : "kcal a day, as planned" };
}

/** The five food groups that count towards a balanced plate. */
export const CORE_GROUPS: NutritionCategory[] = ["protein", "vegetables", "fruit", "grains", "dairy"];

/** A friendly nudge from the food-group mix: the first group not used at all, else the lightest. null with no data. */
export function balanceHint(shares: GroupShare[]): string | null {
  const core = shares.filter((g) => CORE_GROUPS.includes(g.key));
  if (core.length === 0) return null;
  const missing = core.find((g) => g.count === 0);
  if (missing) return `${missing.label} hasn't come up yet. Adding some would round out your plate.`;
  const lightest = [...core].sort((a, b) => a.percent - b.percent)[0];

  return `All five groups are covered. ${lightest.label} is the lightest.`;
}

/** "T" for a Tuesday: single-letter labels keep a 7-column chart readable. */
export function dayInitial(date: string): string {
  const [y, m, d] = date.split("-").map(Number);

  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "narrow" });
}

/** Short column label for a waste week, newest last: "3w ago", "2w ago", "Last", "This". */
export function weekColumnLabel(index: number, total: number): string {
  const back = total - 1 - index;

  return back === 0 ? "This" : back === 1 ? "Last" : `${back}w ago`;
}
