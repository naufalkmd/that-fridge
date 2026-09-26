import { caloriesLabel, caloriesSuffix } from "@/lib/recipeCalories";

describe("caloriesLabel", () => {
  test("rounds and marks the figure as an estimate", () => {
    expect(caloriesLabel({ calories: 420 })).toBe("≈ 420 kcal");
    expect(caloriesLabel({ calories: 419.6 })).toBe("≈ 420 kcal");
  });

  test("can say it is per serving", () => {
    expect(caloriesLabel({ calories: 420 }, true)).toBe("≈ 420 kcal per serving");
  });

  test("shows nothing when there is no usable number", () => {
    expect(caloriesLabel({})).toBeNull();
    expect(caloriesLabel({ calories: null })).toBeNull();
    expect(caloriesLabel({ calories: 0 })).toBeNull();
    expect(caloriesLabel({ calories: Number.NaN })).toBeNull();
    expect(caloriesLabel({ calories: "300" as never })).toBeNull(); // a wrongly-typed value never renders
  });
});

describe("caloriesSuffix", () => {
  test("appends to a meta line, or adds nothing", () => {
    expect(`20 min${caloriesSuffix({ calories: 380 })} · 3/4 ready`).toBe("20 min · ≈ 380 kcal · 3/4 ready");
    expect(`20 min${caloriesSuffix({ calories: null })} · 3/4 ready`).toBe("20 min · 3/4 ready");
    expect(caloriesSuffix({ calories: 380 }, true)).toBe(" · ≈ 380 kcal per serving");
  });
});
