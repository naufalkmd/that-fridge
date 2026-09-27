import { ApiError } from "@thatfridge/core";

import { describeBulkAutofill, runBulkAutofill } from "../bulkAutofill";

const apiError = (status: number) => new ApiError(status, "x", {} as never);

describe("runBulkAutofill", () => {
  it("saves only the items that got new details", async () => {
    const save = jest.fn(async () => {});
    const autofill = jest.fn(async (id: string) => ({ fields: id === "b" ? {} : { shelf_life_days: 7 } }));
    const progress = jest.fn();

    const r = await runBulkAutofill(["a", "b", "c"], autofill, save, progress);

    expect(r).toEqual({ filled: 2, unchanged: 1, failed: 0, skipped: 0, stopped: null });
    expect(save).toHaveBeenCalledWith("a", { shelf_life_days: 7 });
    expect(save).not.toHaveBeenCalledWith("b", expect.anything());
    expect(progress).toHaveBeenLastCalledWith(3);
    expect(describeBulkAutofill(r)).toBe("Filled in 2 items · 1 already complete");
  });

  it("stops handing out calls once the server runs out of credits", async () => {
    const autofill = jest.fn(async (id: string) => {
      if (id === "a") return { fields: { shelf_life_days: 3 } };
      throw apiError(402);
    });
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];

    const r = await runBulkAutofill(ids, autofill, async () => {});

    expect(r.stopped).toBe("credits");
    expect(r.filled).toBe(1);
    expect(autofill.mock.calls.length).toBeLessThan(ids.length); // the rest were never tried
    expect(describeBulkAutofill(r)).toMatch(/Out of credits/);
  });

  it("counts an ordinary failure and carries on", async () => {
    const autofill = jest.fn(async (id: string) => {
      if (id === "b") throw new Error("network");
      return { fields: { calories: 90 } };
    });

    const r = await runBulkAutofill(["a", "b", "c"], autofill, async () => {});

    expect(r).toMatchObject({ filled: 2, failed: 1, stopped: null });
  });
});
