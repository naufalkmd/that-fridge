import type { ChatContextRef, ChatContextType } from "@thatfridge/core";

import { addDays, shortDayLabel, weekDays } from "@/lib/calendar";

// Pure helpers for Quick Chat's "add context" (no React, no I/O).

/** A pinned piece of the user's kitchen: what the server needs (`type`, `id`) plus how it reads on a chip. */
export interface ChatContext extends ChatContextRef {
  label: string;
}

/** Keep in step with ChatContextService::MAX_CONTEXTS on the server. */
export const MAX_CONTEXTS = 6;

export const CONTEXT_TYPES: { type: ChatContextType; label: string; hint: string; icon: string }[] = [
  { type: "item", label: "An item", hint: "Ask about one thing in your fridge", icon: "nutrition-outline" },
  { type: "fridge", label: "A fridge", hint: "Everything in it, soonest to expire first", icon: "cube-outline" },
  { type: "recipe", label: "A recipe", hint: "Its ingredients and steps", icon: "restaurant-outline" },
  { type: "day", label: "A day", hint: "Meals, expiries and activity on that date", icon: "calendar-outline" },
  { type: "meal_plan", label: "A week of the meal plan", hint: "Meals and calories, day by day", icon: "calendar-number-outline" },
  { type: "shopping", label: "Shopping list", hint: "What you still need to buy", icon: "cart-outline" },
  { type: "expiring", label: "What's expiring", hint: "Everything within 3 days or past date", icon: "alarm-outline" },
];

export const contextIcon = (type: ChatContextType) => CONTEXT_TYPES.find((t) => t.type === type)?.icon ?? "attach-outline";

export const contextKey = (c: ChatContextRef) => `${c.type}:${c.id ?? ""}`;

/** Add a context, ignoring one that is already pinned and stopping at the cap. */
export function addContext(list: ChatContext[], next: ChatContext): ChatContext[] {
  if (list.some((c) => contextKey(c) === contextKey(next)) || list.length >= MAX_CONTEXTS) return list;
  return [...list, next];
}

/** Just what the server needs. */
export const toRefs = (list: ChatContext[]): ChatContextRef[] => list.map(({ type, id }) => (id != null ? { type, id } : { type }));

/** Days to pick from: three back, today, and ten ahead. */
export function dayOptions(today: string): { date: string; label: string }[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 3);
    const { weekday, day } = shortDayLabel(date);
    return { date, label: date === today ? `Today · ${weekday} ${day}` : date === addDays(today, 1) ? `Tomorrow · ${weekday} ${day}` : `${weekday} ${day}` };
  });
}

/** The chip text for a day, e.g. "Fri 2". */
export function dayLabel(date: string, today: string): string {
  const { weekday, day } = shortDayLabel(date);
  return date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : `${weekday} ${day}`;
}

/** Meal-plan weeks to pick from: this week, next, and last. `start` is the week's first day. */
export function weekOptions(today: string): { start: string; label: string }[] {
  const thisWeek = weekDays(today)[0];
  return [
    { start: thisWeek, label: "This week" },
    { start: addDays(thisWeek, 7), label: "Next week" },
    { start: addDays(thisWeek, -7), label: "Last week" },
  ];
}
