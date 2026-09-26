import { ApiError } from "@thatfridge/core";

import { nextBatch, runSweep, SWEEP_BATCH, type SweepItem } from "@/lib/organizerSweep";

const item = (id: string, location: SweepItem["location"] = "fridge"): SweepItem => ({ id, name: `Item ${id}`, icon: "x", location });
const many = (n: number) => Array.from({ length: n }, (_, i) => item(String(i + 1)));

describe("nextBatch", () => {
  test("is capped, so one sweep stays under the server throttle", () => {
    expect(nextBatch(many(40), new Set())).toHaveLength(SWEEP_BATCH);
    expect(SWEEP_BATCH).toBeLessThan(20);
  });

  test("carries on with items not yet checked, and starts over once everything has been", () => {
    const items = many(20);
    const first = nextBatch(items, new Set());
    const second = nextBatch(items, new Set(first.map((i) => i.id)));
    expect(second.map((i) => i.id)).toEqual(["16", "17", "18", "19", "20"]);

    const all = new Set(items.map((i) => i.id));
    expect(nextBatch(items, all).map((i) => i.id)).toEqual(first.map((i) => i.id));
  });
});

describe("runSweep", () => {
  test("collects the items the server says belong elsewhere and counts only answered checks", async () => {
    const suggest = jest.fn(async (name: string) => ({ location: name === "Item 2" ? ("freezer" as const) : ("fridge" as const) }));

    const result = await runSweep([item("1"), item("2"), item("3", "pantry")], suggest);

    expect(result.checked).toBe(3);
    expect(result.unchecked).toBe(0);
    expect(result.stopped).toBeNull();
    expect(result.moves.map((m) => [m.id, m.from, m.to])).toEqual([["2", "fridge", "freezer"], ["3", "pantry", "fridge"]]);
  });

  test("a failed check leaves that item unchecked, not correct", async () => {
    const suggest = jest.fn(async (name: string) => {
      if (name === "Item 2") throw new Error("boom");
      return { location: "fridge" as const };
    });

    const result = await runSweep([item("1"), item("2"), item("3")], suggest);

    expect(result.checked).toBe(2);
    expect(result.unchecked).toBe(1);
    expect(result.checkedIds.sort()).toEqual(["1", "3"]);
    expect(result.stopped).toBeNull();
  });

  test("running out of credits stops the sweep and reports it", async () => {
    let calls = 0;
    const suggest = jest.fn(async () => {
      calls += 1;
      if (calls > 2) throw new ApiError(402, "insufficient_credits");
      return { location: "fridge" as const };
    });

    const result = await runSweep(many(15), suggest);

    expect(result.stopped).toBe("credits");
    expect(result.checked).toBe(2);
    expect(result.unchecked).toBe(13);
    expect(suggest.mock.calls.length).toBeLessThan(15); // it stopped asking
  });

  test("a throttle response stops it too", async () => {
    const suggest = jest.fn(async () => {
      throw new ApiError(429, "Too Many Attempts");
    });

    const result = await runSweep(many(15), suggest);

    expect(result.stopped).toBe("throttled");
    expect(result.checked).toBe(0);
  });

  test("an empty batch does nothing", async () => {
    const result = await runSweep([], jest.fn());
    expect(result).toMatchObject({ checked: 0, unchecked: 0, stopped: null, moves: [] });
  });
});
