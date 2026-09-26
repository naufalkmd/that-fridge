import type { CalendarEntry, UsageHistoryEntry } from "@thatfridge/core";

import {
  balanceHint, calorieHeadline, calorieSummary, dayInitial, foodGroupShares, freshnessAtUse, roundKcal, scoreBand, topUsed,
  wasteHeadline, wasteSummary, weekColumnLabel,
} from "@/lib/insights";

const entry = (over: Partial<CalendarEntry> & Pick<CalendarEntry, "kind" | "date">): CalendarEntry => ({
  id: `${over.kind}:${over.date}:${Math.random()}`, time: null, title: "x", meta: null, tone: null, refs: {}, ...over,
});
const usage = (over: Partial<UsageHistoryEntry>): UsageHistoryEntry => ({
  id: "1", key: "milk", name: "Milk", icon: "milk", category: "dairy", count: 1, freshUseCount: 0,
  freshnessSum: 0, freshnessSampleCount: 0, lastAt: 0, ...over,
});

// 2026-09-15 is a Tuesday; the Sunday-first week is 13-19 Sep.
const TODAY = "2026-09-15";

describe("wasteSummary", () => {
  test("buckets used / thrown-out counts into the last weeks and works out the waste rate", () => {
    const s = wasteSummary(
      [
        entry({ kind: "used", date: "2026-09-14", count: 6 }),
        entry({ kind: "wasted", date: "2026-09-14", count: 2 }),
        entry({ kind: "used", date: "2026-09-02", count: 2 }), // two weeks back
        entry({ kind: "used", date: "2026-08-01", count: 9 }), // older than 4 weeks: ignored
        entry({ kind: "expiry", date: "2026-09-14", count: 5 }), // not history: ignored
      ],
      TODAY,
    );

    expect(s.weeks.map((w) => w.start)).toEqual(["2026-08-23", "2026-08-30", "2026-09-06", "2026-09-13"]);
    expect(s.weeks[3]).toEqual({ start: "2026-09-13", used: 6, wasted: 2 });
    expect(s.weeks[1]).toEqual({ start: "2026-08-30", used: 2, wasted: 0 });
    expect(s.used).toBe(8);
    expect(s.wasted).toBe(2);
    expect(s.wasteRate).toBe(20);
  });

  test("with nothing removed there is no rate, but the chart still has every week", () => {
    const s = wasteSummary([], TODAY);
    expect(s.wasteRate).toBeNull();
    expect(s.weeks).toHaveLength(4);
  });
});

describe("calorieSummary", () => {
  const meal = (over: Partial<CalendarEntry>) => entry({ kind: "meal", date: "2026-09-15", status: "planned", calories: 500, ...over });

  test("adds planned and cooked kcal per day, ignores skipped and other weeks, and counts unknowns", () => {
    const s = calorieSummary(
      [
        meal({ calories: 600 }),
        meal({ status: "cooked", calories: 400 }),
        meal({ date: "2026-09-17", calories: 700 }),
        meal({ status: "skipped", calories: 900 }),
        meal({ calories: null }),
        meal({ date: "2026-09-25", calories: 800 }), // next week
      ],
      TODAY,
    );

    expect(s.days).toHaveLength(7);
    expect(s.days.find((d) => d.date === "2026-09-15")).toEqual({ date: "2026-09-15", planned: 600, cooked: 400 });
    expect(s.plannedTotal).toBe(1300);
    expect(s.cookedTotal).toBe(400);
    expect(s.dailyAverage).toBe(850); // (1300 + 400) over the two days with meals
    expect(s.unknown).toBe(1);
  });

  test("no meals means no average", () => {
    expect(calorieSummary([], TODAY).dailyAverage).toBeNull();
  });
});

describe("usage helpers", () => {
  test("food group shares are of categorised uses and empty without any", () => {
    expect(foodGroupShares([usage({ category: null })])).toEqual([]);
    const shares = foodGroupShares([usage({ category: "dairy", count: 3 }), usage({ id: "2", category: "fruit", count: 1 })]);
    expect(shares.find((g) => g.key === "dairy")).toMatchObject({ count: 3, percent: 75 });
    expect(shares.find((g) => g.key === "fruit")).toMatchObject({ count: 1, percent: 25 });
    expect(shares.find((g) => g.key === "protein")).toMatchObject({ count: 0, percent: 0 });
  });

  test("top used sorts by count then name and is capped", () => {
    const top = topUsed([usage({ id: "a", name: "Egg", count: 2 }), usage({ id: "b", name: "Apple", count: 2 }), usage({ id: "c", name: "Rice", count: 9 })], 2);
    expect(top.map((u) => u.name)).toEqual(["Rice", "Apple"]);
  });

  test("freshness at use averages over samples", () => {
    expect(freshnessAtUse([usage({})])).toBeNull();
    expect(freshnessAtUse([usage({ freshnessSum: 150, freshnessSampleCount: 2 }), usage({ id: "2", freshnessSum: 30, freshnessSampleCount: 1 })])).toBe(60);
  });
});

describe("plain-language summaries", () => {
  test("score bands", () => {
    expect(scoreBand(null)).toEqual({ label: "Building", tone: "none" });
    expect(scoreBand(80).tone).toBe("good");
    expect(scoreBand(79).tone).toBe("warn");
    expect(scoreBand(55).tone).toBe("warn");
    expect(scoreBand(54)).toEqual({ label: "Needs care", tone: "bad" });
  });

  test("the waste sentence says what happened, or that nothing has", () => {
    const base = { used: 0, wasted: 0, wasteRate: null, weeks: [] };
    expect(wasteHeadline(base)).toBeNull();
    expect(wasteHeadline({ ...base, used: 8, wasted: 2 })).toBe("You used up 8 of 10 items. 2 were thrown out.");
    expect(wasteHeadline({ ...base, used: 4, wasted: 1 })).toBe("You used up 4 of 5 items. 1 was thrown out.");
    expect(wasteHeadline({ ...base, used: 3, wasted: 0 })).toBe("You used up all 3 items. Nothing wasted.");
    expect(wasteHeadline({ ...base, used: 1, wasted: 0 })).toBe("You used up all 1 item. Nothing wasted.");
  });

  test("calories round to the nearest 50 and say what the number is", () => {
    expect(roundKcal(1847)).toBe(1850);
    expect(roundKcal(1824)).toBe(1800);
    const summary = { days: [], plannedTotal: 1000, cookedTotal: 0, dailyAverage: 1847, unknown: 0 };
    expect(calorieHeadline(summary)).toEqual({ value: 1850, caption: "kcal a day, as planned" });
    expect(calorieHeadline({ ...summary, cookedTotal: 500 })?.caption).toBe("kcal a day, planned and cooked");
    expect(calorieHeadline({ ...summary, dailyAverage: null })).toBeNull();
  });

  test("the balance hint names a missing group first, then the lightest", () => {
    const share = (key: string, label: string, count: number, percent: number) => ({ key, label, count, percent }) as never;
    expect(balanceHint([])).toBeNull();
    expect(balanceHint([share("protein", "Protein", 5, 50), share("fruit", "Fruit", 0, 0), share("dairy", "Dairy", 3, 30)])).toBe("Fruit hasn't come up yet. Adding some would round out your plate.");
    const all = ["protein", "vegetables", "fruit", "grains", "dairy"].map((k, i) => share(k, k[0].toUpperCase() + k.slice(1), 1, 10 + i * 5));
    expect(balanceHint(all)).toBe("All five groups are covered. Protein is the lightest.");
    expect(balanceHint([share("other_extras", "Other", 4, 100)])).toBeNull(); // extras don't count as a group
  });

  test("chart labels", () => {
    expect(dayInitial("2026-09-15")).toBe("T"); // Tuesday
    expect(weekColumnLabel(3, 4)).toBe("This");
    expect(weekColumnLabel(2, 4)).toBe("Last");
    expect(weekColumnLabel(0, 4)).toBe("3w ago");
  });
});
