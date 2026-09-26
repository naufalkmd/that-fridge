import type { CalendarEntry, CalendarEntryKind } from "@thatfridge/core";

// Pure date + grouping logic for the in-app calendar (no React, no I/O) so the grid maths is
// unit-testable. All dates here are *local* calendar days as "YYYY-MM-DD" - the same shape the
// server returns entries in (it places timestamps on the day for the tz we send).

export const WEEK_STARTS_ON = 0; // 0 = Sunday, 1 = Monday

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date of a Date as YYYY-MM-DD (never via toISOString, which shifts to UTC). */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface GridCell {
  date: string;
  day: number;
  inMonth: boolean;
}

export interface MonthGrid {
  cells: GridCell[]; // always 42 = 6 weeks, so the layout doesn't jump between months
  from: string;
  to: string;
}

/** `month` is 0-11. */
export function monthGrid(year: number, month: number, weekStartsOn: number = WEEK_STARTS_ON): MonthGrid {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const cells: GridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - offset + i);
    cells.push({ date: toISO(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return { cells, from: cells[0].date, to: cells[41].date };
}

/** YYYY-MM-DD plus (or minus) whole days, on the local calendar (noon-anchored, so DST never shifts a day). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + days, 12));
}

/** The 7 days of the week containing `iso`, starting on `weekStartsOn`. */
export function weekDays(iso: string, weekStartsOn: number = WEEK_STARTS_ON): string[] {
  const [y, m, d] = iso.split("-").map(Number);
  const offset = (new Date(y, m - 1, d, 12).getDay() - weekStartsOn + 7) % 7;
  const start = addDays(iso, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "26 Sep – 2 Oct" for a week's first and last day. */
export function weekRangeLabel(days: readonly string[]): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  };
  return `${fmt(days[0])} – ${fmt(days[days.length - 1])}`;
}

/** "Sat 26" for a compact day label. */
export function shortDayLabel(iso: string): { weekday: string; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { weekday: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" }), day: d };
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function dayTitle(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

/** Single-letter weekday headers, rotated to the week's first day. */
export function weekdayLabels(weekStartsOn: number = WEEK_STARTS_ON): string[] {
  const base = ["S", "M", "T", "W", "T", "F", "S"];
  return [...base.slice(weekStartsOn), ...base.slice(0, weekStartsOn)];
}

// ---- entries ----------------------------------------------------------------------------

export type CalendarGroup = "meals" | "expiry" | "automation" | "activity";

export const KIND_GROUP: Record<CalendarEntryKind, CalendarGroup> = {
  meal: "meals",
  expiry: "expiry",
  machine_scheduled: "automation",
  machine_run: "automation",
  used: "activity",
  wasted: "activity",
  added: "activity",
};

export const GROUP_LABEL: Record<CalendarGroup, string> = {
  meals: "Meals",
  expiry: "Expiry",
  automation: "Automations",
  activity: "Activity",
};

export const GROUPS: CalendarGroup[] = ["meals", "expiry", "automation", "activity"];

export function filterEntries(entries: CalendarEntry[], hidden: ReadonlySet<CalendarGroup>): CalendarEntry[] {
  return entries.filter((e) => !hidden.has(KIND_GROUP[e.kind]));
}

export function groupByDate(entries: CalendarEntry[]): Record<string, CalendarEntry[]> {
  const out: Record<string, CalendarEntry[]> = {};
  for (const e of entries) (out[e.date] ??= []).push(e);
  return out;
}

/** Kinds to draw as dots under a day number: distinct, in a fixed order, at most 3. */
export function dayDots(entries: CalendarEntry[] | undefined): CalendarEntryKind[] {
  if (!entries?.length) return [];
  const order: CalendarEntryKind[] = ["meal", "expiry", "machine_scheduled", "machine_run", "wasted", "used", "added"];
  const present = new Set(entries.map((e) => e.kind));
  return order.filter((k) => present.has(k)).slice(0, 3);
}

/** A day's entries split into their groups (in group order), for the day sheet's sections. */
export function sectionsForDay(entries: CalendarEntry[]): { group: CalendarGroup; entries: CalendarEntry[] }[] {
  return GROUPS.map((group) => ({ group, entries: entries.filter((e) => KIND_GROUP[e.kind] === group) })).filter(
    (s) => s.entries.length > 0,
  );
}
