import { addContext, contextKey, dayLabel, dayOptions, MAX_CONTEXTS, toRefs, weekOptions, type ChatContext } from "@/lib/chatContext";

const ctx = (over: Partial<ChatContext> = {}): ChatContext => ({ type: "item", id: "1", label: "Milk", ...over });

describe("addContext", () => {
  test("adds, ignores an exact duplicate, and treats a different id or type as different", () => {
    let list = addContext([], ctx());
    list = addContext(list, ctx({ label: "Milk again" }));
    expect(list).toHaveLength(1);
    list = addContext(list, ctx({ id: "2", label: "Eggs" }));
    list = addContext(list, ctx({ type: "recipe", id: "1", label: "Pad Thai" }));
    expect(list.map((c) => contextKey(c))).toEqual(["item:1", "item:2", "recipe:1"]);
  });

  test("stops at the cap the server enforces", () => {
    let list: ChatContext[] = [];
    for (let i = 0; i < MAX_CONTEXTS + 3; i++) list = addContext(list, ctx({ id: String(i) }));
    expect(list).toHaveLength(MAX_CONTEXTS);
    expect(MAX_CONTEXTS).toBe(6);
  });

  test("parameterless contexts (shopping, expiring) are deduped by type", () => {
    const list = addContext(addContext([], { type: "expiring", label: "Expiring" }), { type: "expiring", label: "Expiring" });
    expect(list).toHaveLength(1);
  });
});

describe("toRefs", () => {
  test("drops the label and leaves out a missing id", () => {
    expect(toRefs([ctx(), { type: "shopping", label: "Shopping list" }])).toEqual([{ type: "item", id: "1" }, { type: "shopping" }]);
  });
});

describe("date pickers", () => {
  // Tue 15 Sep 2026; the Sunday-first week starts 13 Sep.
  test("days run from three back to ten ahead and name today and tomorrow", () => {
    const days = dayOptions("2026-09-15");
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-09-12");
    expect(days[13].date).toBe("2026-09-25");
    expect(days[3].label).toMatch(/^Today/);
    expect(days[4].label).toMatch(/^Tomorrow/);
  });

  test("chip labels for a day", () => {
    expect(dayLabel("2026-09-15", "2026-09-15")).toBe("Today");
    expect(dayLabel("2026-09-16", "2026-09-15")).toBe("Tomorrow");
    expect(dayLabel("2026-09-20", "2026-09-15")).toMatch(/20/);
  });

  test("weeks start on the week's first day", () => {
    expect(weekOptions("2026-09-15")).toEqual([
      { start: "2026-09-13", label: "This week" },
      { start: "2026-09-20", label: "Next week" },
      { start: "2026-09-06", label: "Last week" },
    ]);
  });
});
