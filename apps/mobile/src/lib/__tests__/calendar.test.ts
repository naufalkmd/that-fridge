import type { CalendarEntry } from "@thatfridge/core";
import {
  addDays,
  addMonths,
  shortDayLabel,
  weekDays,
  weekRangeLabel,
  dayDots,
  filterEntries,
  groupByDate,
  monthGrid,
  sectionsForDay,
  toISO,
  weekdayLabels,
} from "@/lib/calendar";

const entry = (kind: CalendarEntry["kind"], date = "2026-09-10", id = `${kind}:${date}`): CalendarEntry => ({
  id, kind, date, time: null, title: kind, meta: null, tone: null, refs: {},
});

describe("toISO", () => {
  test("uses the local date, not UTC", () => {
    expect(toISO(new Date(2026, 8, 5, 23, 59))).toBe("2026-09-05");
    expect(toISO(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("monthGrid", () => {
  test("September 2026 (starts on a Tuesday), Sunday-first", () => {
    const g = monthGrid(2026, 8, 0);
    expect(g.cells).toHaveLength(42);
    expect(g.cells[0]).toEqual({ date: "2026-08-30", day: 30, inMonth: false });
    expect(g.cells[2]).toEqual({ date: "2026-09-01", day: 1, inMonth: true });
    expect(g.cells.filter((c) => c.inMonth)).toHaveLength(30);
    expect(g.from).toBe("2026-08-30");
    expect(g.to).toBe("2026-10-10");
  });

  test("Monday-first starts a day later", () => {
    const g = monthGrid(2026, 8, 1);
    expect(g.cells[0].date).toBe("2026-08-31");
    expect(g.cells[1].date).toBe("2026-09-01");
  });

  test("a month that starts on the first weekday has no leading days", () => {
    const g = monthGrid(2026, 1, 0); // 1 Feb 2026 is a Sunday
    expect(g.cells[0]).toEqual({ date: "2026-02-01", day: 1, inMonth: true });
    expect(g.cells.filter((c) => c.inMonth)).toHaveLength(28);
  });

  test("leap February and year boundaries", () => {
    const leap = monthGrid(2028, 1, 0);
    expect(leap.cells.filter((c) => c.inMonth)).toHaveLength(29);
    const dec = monthGrid(2026, 11, 0);
    expect(dec.cells.some((c) => c.date === "2027-01-01" && !c.inMonth)).toBe(true);
  });

  test("consecutive days, no gaps or repeats", () => {
    const dates = monthGrid(2026, 2, 0).cells.map((c) => c.date); // includes a DST-prone March
    expect(new Set(dates).size).toBe(42);
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(`${dates[i - 1]}T12:00:00`);
      const next = new Date(`${dates[i]}T12:00:00`);
      expect(Math.round((next.getTime() - prev.getTime()) / 86400000)).toBe(1);
    }
  });

  test("the grid never exceeds the server's 62-day range", () => {
    const g = monthGrid(2026, 8);
    const span = (new Date(`${g.to}T12:00:00`).getTime() - new Date(`${g.from}T12:00:00`).getTime()) / 86400000;
    expect(span).toBeLessThanOrEqual(62);
  });
});

describe("addMonths / weekdayLabels", () => {
  test("wraps across years both ways", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths(2026, 5, 0)).toEqual({ year: 2026, month: 5 });
  });

  test("rotates to the week start", () => {
    expect(weekdayLabels(0)).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(weekdayLabels(1)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
  });
});

describe("entries", () => {
  test("groupByDate buckets by day", () => {
    const grouped = groupByDate([entry("expiry", "2026-09-10"), entry("added", "2026-09-10"), entry("used", "2026-09-11")]);
    expect(Object.keys(grouped).sort()).toEqual(["2026-09-10", "2026-09-11"]);
    expect(grouped["2026-09-10"]).toHaveLength(2);
  });

  test("dayDots are distinct, ordered and capped at three", () => {
    expect(dayDots(undefined)).toEqual([]);
    expect(dayDots([entry("added"), entry("expiry"), entry("expiry", "2026-09-10", "b")])).toEqual(["expiry", "added"]);
    expect(dayDots([entry("added"), entry("used"), entry("wasted"), entry("machine_run"), entry("expiry")])).toEqual([
      "expiry",
      "machine_run",
      "wasted",
    ]);
    // Meals always lead, since planned meals are what people look for first.
    expect(dayDots([entry("expiry"), entry("added"), entry("meal")])).toEqual(["meal", "expiry", "added"]);
  });

  test("filterEntries hides whole groups", () => {
    const all = [entry("expiry"), entry("machine_run"), entry("machine_scheduled"), entry("used")];
    expect(filterEntries(all, new Set()).length).toBe(4);
    expect(filterEntries(all, new Set(["automation"])).map((e) => e.kind)).toEqual(["expiry", "used"]);
    expect(filterEntries(all, new Set(["meals", "expiry", "automation", "activity"]))).toEqual([]);
    expect(filterEntries([...all, entry("meal")], new Set(["meals"])).map((e) => e.kind)).not.toContain("meal");
  });

  test("sectionsForDay keeps group order and drops empty groups", () => {
    const sections = sectionsForDay([entry("added"), entry("machine_run"), entry("expiry"), entry("meal")]);
    expect(sections.map((s) => s.group)).toEqual(["meals", "expiry", "automation", "activity"]);
    expect(sectionsForDay([entry("used")]).map((s) => s.group)).toEqual(["activity"]);
    expect(sectionsForDay([])).toEqual([]);
  });
});

describe("week helpers", () => {
  test("addDays crosses months, years and DST changes without skipping or repeating a day", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US spring-forward
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US fall-back
    expect(addDays("2026-09-26", 0)).toBe("2026-09-26");
    let day = "2026-01-01";
    for (let i = 0; i < 400; i++) day = addDays(day, 1);
    expect(day).toBe("2027-02-05");
  });

  test("weekDays returns 7 consecutive days containing the given day, from the week's first day", () => {
    // 26 Sep 2026 is a Saturday.
    expect(weekDays("2026-09-26", 0)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"]);
    expect(weekDays("2026-09-26", 1)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(weekDays("2026-09-20", 0)[0]).toBe("2026-09-20"); // a Sunday starts its own week
    expect(weekDays("2026-09-30", 0)).toContain("2026-10-03"); // spans a month end
  });

  test("labels", () => {
    expect(weekRangeLabel(weekDays("2026-09-26", 0))).toMatch(/20.*26|Sep.*20|20.*Sep/);
    expect(shortDayLabel("2026-09-26")).toMatchObject({ day: 26 });
    expect(shortDayLabel("2026-09-26").weekday.length).toBeGreaterThan(0);
  });
});
