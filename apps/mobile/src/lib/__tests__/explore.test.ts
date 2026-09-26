import type { ExploreItem, MachineDraft } from "@thatfridge/core";

import { draftWithTimezone, planDays, planStartOptions, planSummary, sectionsByType } from "@/lib/explore";

const item = (over: Partial<ExploreItem>): ExploreItem => ({
  id: "1", type: "recipe", title: "T", blurb: null, tags: [], featured: false, imageUrl: null, recipe: null, payload: null, ...over,
});

describe("sectionsByType", () => {
  test("groups in the fixed library order and leaves empty libraries out", () => {
    const sections = sectionsByType([item({ id: "1", type: "icon" }), item({ id: "2", type: "recipe" }), item({ id: "3", type: "recipe" })]);

    expect(sections.map((s) => [s.type, s.items.length])).toEqual([["recipe", 2], ["icon", 1]]);
  });
});

describe("meal plan templates", () => {
  const plan = item({
    type: "meal_plan",
    payload: { days: [{ day: 2, slot: "Dinner", title: "B" }, { day: 0, slot: "Dinner", title: "A" }] },
  });

  test("days come sorted and the summary counts meals and the span", () => {
    expect(planDays(plan).map((d) => d.title)).toEqual(["A", "B"]);
    expect(planSummary(plan)).toBe("2 meals over 3 days");
    expect(planSummary(item({ type: "meal_plan", payload: { days: [{ day: 0, slot: "Dinner", title: "A" }] } }))).toBe("1 meal over 1 day");
    expect(planSummary(item({ type: "meal_plan", payload: { days: [] } }))).toBe("No meals");
  });

  test("start options are today and the coming Monday, never today when today is Monday", () => {
    // Tue 15 Sep 2026 -> Mon 21 Sep
    expect(planStartOptions("2026-09-15")).toEqual([
      { label: "Start today", date: "2026-09-15" },
      { label: "Start next Monday", date: "2026-09-21" },
    ]);
    // Mon 21 Sep -> Mon 28 Sep
    expect(planStartOptions("2026-09-21")[1].date).toBe("2026-09-28");
    // Sun 20 Sep -> Mon 21 Sep
    expect(planStartOptions("2026-09-20")[1].date).toBe("2026-09-21");
  });
});

describe("draftWithTimezone", () => {
  const schedule: MachineDraft = {
    name: "X",
    trigger: { type: "schedule", config: { frequency: "weekly", time: "08:00", weekday: 1 } },
    steps: [],
  } as unknown as MachineDraft;

  test("fills a schedule's timezone but keeps one that is already set", () => {
    expect(draftWithTimezone(schedule, "Asia/Kuala_Lumpur").trigger).toMatchObject({ config: { timezone: "Asia/Kuala_Lumpur", time: "08:00" } });
    const set = { ...schedule, trigger: { ...schedule.trigger, config: { ...(schedule.trigger as { config: object }).config, timezone: "Europe/London" } } } as unknown as MachineDraft;
    expect(draftWithTimezone(set, "Asia/Kuala_Lumpur").trigger).toMatchObject({ config: { timezone: "Europe/London" } });
  });

  test("other triggers are untouched", () => {
    const threshold = { name: "T", trigger: { type: "threshold", config: { field: "quantity", op: "lte", value: 5 } }, steps: [] } as unknown as MachineDraft;
    expect(draftWithTimezone(threshold, "Asia/Kuala_Lumpur")).toBe(threshold);
  });
});
