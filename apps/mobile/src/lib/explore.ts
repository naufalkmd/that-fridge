import type { ExploreItem, ExploreType, MachineDraft, MealPlanTemplateDay } from "@thatfridge/core";

import { addDays, toISO } from "@/lib/calendar";

// Pure helpers for the Explore screen (no React, no I/O).

export const EXPLORE_TYPES: { key: ExploreType; label: string; singular: string; icon: string }[] = [
  { key: "recipe", label: "Recipes", singular: "Recipe", icon: "restaurant-outline" },
  { key: "machine", label: "Machines", singular: "Machine", icon: "flask-outline" },
  { key: "meal_plan", label: "Meal plans", singular: "Meal plan", icon: "calendar-outline" },
  { key: "icon", label: "Food icons", singular: "Food icon", icon: "images-outline" },
];

export const typeMeta = (type: ExploreType) => EXPLORE_TYPES.find((t) => t.key === type)!;

/** Items split into one section per library, in the fixed library order; empty libraries are left out. */
export function sectionsByType(items: ExploreItem[]): { type: ExploreType; items: ExploreItem[] }[] {
  return EXPLORE_TYPES.map((t) => ({ type: t.key, items: items.filter((i) => i.type === t.key) })).filter((s) => s.items.length > 0);
}

/** The template's days as the plan list shows them: `{ day, slot, title }` sorted by day then slot order of first use. */
export function planDays(item: ExploreItem): MealPlanTemplateDay[] {
  const payload = item.payload as { days?: MealPlanTemplateDay[] } | null;
  return [...(payload?.days ?? [])].sort((a, b) => a.day - b.day);
}

/** "7 meals over 7 days" for a meal-plan template. */
export function planSummary(item: ExploreItem): string {
  const days = planDays(item);
  if (days.length === 0) return "No meals";
  const span = Math.max(...days.map((d) => d.day)) + 1;
  return `${days.length} meal${days.length === 1 ? "" : "s"} over ${span} day${span === 1 ? "" : "s"}`;
}

/** Where a meal plan can start: today, or the coming Monday (never today when today is already Monday). */
export function planStartOptions(today: string): { label: string; date: string }[] {
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  const untilMonday = ((8 - weekday) % 7) || 7;
  return [
    { label: "Start today", date: today },
    { label: "Start next Monday", date: addDays(today, untilMonday) },
  ];
}

/** A schedule template stores no timezone (it depends on who uses it): fill in the device's. */
export function draftWithTimezone(draft: MachineDraft, timezone: string): MachineDraft {
  if (draft.trigger.type !== "schedule") return draft;
  return { ...draft, trigger: { ...draft.trigger, config: { ...draft.trigger.config, timezone: draft.trigger.config.timezone ?? timezone } } } as MachineDraft;
}

export const todayISO = () => toISO(new Date());
