import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { routeChatAgent, useThatFridge } from "./useThatFridge";
import * as api from "./api";

vi.mock("./api");

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.localStorage.clear();
  // sendChat always fires this fire-and-forget after a reply lands - give every test a
  // sane default so tests that don't care about memory extraction don't hit an unhandled
  // rejection from calling .then() on the auto-mock's default `undefined` return value.
  vi.mocked(api.extractMemory).mockResolvedValue([]);
});

describe("routeChatAgent", () => {
  it("routes expiry/safety language to Guardian", () => {
    expect(routeChatAgent("is this milk still safe to eat?")).toBe("Guardian");
    expect(routeChatAgent("my spinach is moldy")).toBe("Guardian");
  });

  // Regression coverage: this exact string is one of the Chat screen's 4 built-in "Quick
  // Chat" suggestions (ChatScreen.tsx's QUICK_ASKS). It matched none of the agent keyword
  // patterns and fell through to the Chef default, so tapping it always got an off-topic
  // recipe pitch instead of an actual answer about the fridge's status.
  it("routes the 'How's my fridge doing?' quick-ask to Guardian, not the Chef default", () => {
    expect(routeChatAgent("How's my fridge doing?")).toBe("Guardian");
  });

  it("routes shopping language to Shopkeeper", () => {
    expect(routeChatAgent("what should I buy this week?")).toBe("Shopkeeper");
    expect(routeChatAgent("I'm running low on eggs")).toBe("Shopkeeper");
  });

  it("routes storage language to Organizer", () => {
    expect(routeChatAgent("where should I store this?")).toBe("Organizer");
    expect(routeChatAgent("freezer or fridge for this?")).toBe("Organizer");
  });

  it("routes cooking language to Chef", () => {
    expect(routeChatAgent("what can I cook for dinner tonight?")).toBe("Chef");
  });

  it("defaults to Chef for anything ambiguous", () => {
    expect(routeChatAgent("hello there")).toBe("Chef");
  });
});

describe("useThatFridge sendChat", () => {
  it("does not send a second message while the first reply is still pending", async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof api.sendChatMessage>>) => void;
    const firstReplyPromise = new Promise<Awaited<ReturnType<typeof api.sendChatMessage>>>((resolve) => {
      resolveFirst = resolve;
    });

    const sendChatMessageMock = vi.mocked(api.sendChatMessage).mockReturnValueOnce(firstReplyPromise);

    const { result } = renderHook(() => useThatFridge());

    act(() => {
      result.current.actions.askQuick("What's expiring?");
    });
    expect(result.current.state.isTyping).toBe(true);

    // A second message sent before the first one resolves must be a no-op - previously
    // this raced, with both calls reading the same stale currentSessionId and the backend
    // creating two separate chat sessions instead of continuing one.
    act(() => {
      result.current.actions.askQuick("What should I cook?");
    });

    expect(sendChatMessageMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({
        agent: "Chef",
        user_message: "What's expiring?",
        agent_response: "Try using it soon!",
        session_id: "session-1",
        recipe_suggestion: null,
        mocked: false,
      });
      await firstReplyPromise;
    });

    await waitFor(() => expect(result.current.state.isTyping).toBe(false));

    // Now that the first exchange is done, a new message is allowed through again.
    sendChatMessageMock.mockResolvedValueOnce({
      agent: "Chef",
      user_message: "What should I cook?",
      agent_response: "How about pasta?",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });

    act(() => {
      result.current.actions.askQuick("What should I cook?");
    });

    expect(sendChatMessageMock).toHaveBeenCalledTimes(2);
  });
});

describe("useThatFridge shopping list seeding", () => {
  // Regression coverage for ensureShoppingSeed: it used to require /left|remaining/i to
  // match an item's note (in addition to quantity), which incorrectly matched notes like
  // "Leftovers from Tuesday" and excluded items whose note just didn't happen to say so.
  it("seeds the shopping list from real quantity, not from what an item's note happens to say", async () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [] });
    // A brand-new fridge now gets one section per nutrition category (not a single "General"
    // section), created via several parallel createSection calls - each needs its own distinct
    // id/name here, or every "created" section would collapse into duplicate copies of the
    // same section id and the items below would appear to live in all of them at once.
    vi.mocked(api.createSection).mockImplementation((fridgeId, name) => Promise.resolve({ id: `sec-${name}`, name, items: [] }));
    vi.mocked(api.createItem)
      .mockResolvedValueOnce({
        id: "i1",
        name: "Rice",
        icon: "leftovers",
        freshness: 90,
        days: 30,
        note: "Leftovers from Tuesday",
        qty: 5, // well-stocked
      })
      .mockResolvedValueOnce({
        id: "i2",
        name: "Milk",
        icon: "milk",
        freshness: 90,
        days: 7,
        note: "fresh carton",
        qty: 1, // genuinely low stock
      });

    const { result } = renderHook(() => useThatFridge());

    act(() => result.current.actions.onManualNameChange("Rice"));
    act(() => result.current.actions.onManualNoteChange("Leftovers from Tuesday"));
    await act(async () => {
      await result.current.actions.confirmManualAdd();
    });

    act(() => result.current.actions.onManualNameChange("Milk"));
    act(() => result.current.actions.onManualNoteChange("fresh carton"));
    await act(async () => {
      await result.current.actions.confirmManualAdd();
    });

    act(() => result.current.actions.openShoppingHub());

    const names = result.current.state.shoppingList.map((i) => i.name);
    expect(names).toContain("Milk");
    expect(names).not.toContain("Rice");
  });
});

describe("useThatFridge Organizer suggested moves", () => {
  const setUpTwoItems = () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [] });
    // A brand-new fridge now gets one section per nutrition category (not a single "General"
    // section), created via several parallel createSection calls - each needs its own distinct
    // id/name here, or every "created" section would collapse into duplicate copies of the
    // same section id and the items below would appear to live in all of them at once.
    vi.mocked(api.createSection).mockImplementation((fridgeId, name) => Promise.resolve({ id: `sec-${name}`, name, items: [] }));
    vi.mocked(api.createItem)
      .mockResolvedValueOnce({ id: "i1", name: "Frozen Peas", icon: "leftovers", freshness: 90, days: 90, note: "", qty: 1, location: "fridge" })
      .mockResolvedValueOnce({ id: "i2", name: "Milk", icon: "milk", freshness: 90, days: 7, note: "", qty: 1, location: "fridge" });
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      agent: "Organizer",
      user_message: "How should I organize my fridge right now?",
      agent_response: "Looks fine.",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });
    vi.mocked(api.updateNotificationPrefs).mockResolvedValue({
      expiryAlerts: true,
      lowStock: true,
      recipeTips: true,
      weeklyDigest: false,
      crewActionsEnabled: true,
    });
  };

  const addTwoItems = async (result: { current: ReturnType<typeof useThatFridge> }) => {
    act(() => result.current.actions.onManualNameChange("Frozen Peas"));
    await act(async () => {
      await result.current.actions.confirmManualAdd();
    });
    act(() => result.current.actions.onManualNameChange("Milk"));
    await act(async () => {
      await result.current.actions.confirmManualAdd();
    });
  };

  it("only suggests moving the item whose AI-suggested location differs from its current one", async () => {
    setUpTwoItems();
    vi.mocked(api.suggestItemDetails).mockImplementation(async (name) =>
      name === "Frozen Peas" ? { shelf_life_days: 180, location: "freezer" } : { shelf_life_days: 7, location: "fridge" }
    );

    const { result } = renderHook(() => useThatFridge());
    await addTwoItems(result);

    act(() => result.current.actions.toggleNotificationPref("crewActionsEnabled"));
    expect(result.current.state.notificationPrefs.crewActionsEnabled).toBe(true);

    act(() => result.current.actions.activateAgent("Organizer"));
    await waitFor(() => expect(result.current.state.organizerMovesLoading).toBe(false));

    expect(result.current.state.organizerSuggestedMoves).toEqual([{ itemId: "i1", itemName: "Frozen Peas", location: "freezer" }]);
  });

  it("does not check for moves when the user hasn't allowed the crew to take actions", async () => {
    setUpTwoItems();
    const suggestMock = vi.mocked(api.suggestItemDetails);

    const { result } = renderHook(() => useThatFridge());
    await addTwoItems(result);

    // crewActionsEnabled defaults to false - never toggled on here.
    expect(result.current.state.notificationPrefs.crewActionsEnabled).toBe(false);
    act(() => result.current.actions.activateAgent("Organizer"));
    await waitFor(() => expect(result.current.state.agentInsightLoading.Organizer).toBe(false));

    expect(suggestMock).not.toHaveBeenCalled();
    expect(result.current.state.organizerSuggestedMoves).toEqual([]);
  });

  it("applying a suggested move updates the item's location and clears just that suggestion", async () => {
    setUpTwoItems();
    // Both items come back mismatched here (everything "should" be in the freezer) - the
    // point of this test is that applying one only clears and moves that one, not the other.
    vi.mocked(api.suggestItemDetails).mockResolvedValue({ shelf_life_days: 180, location: "freezer" });
    vi.mocked(api.updateItem).mockResolvedValue({
      id: "i1",
      name: "Frozen Peas",
      icon: "leftovers",
      freshness: 90,
      days: 90,
      note: "",
      qty: 1,
      location: "freezer",
    });

    const { result } = renderHook(() => useThatFridge());
    await addTwoItems(result);
    act(() => result.current.actions.toggleNotificationPref("crewActionsEnabled"));
    act(() => result.current.actions.activateAgent("Organizer"));
    await waitFor(() => expect(result.current.state.organizerSuggestedMoves).toHaveLength(2));

    act(() => result.current.actions.applyOrganizerMove("i1", "freezer"));

    const remaining = result.current.state.organizerSuggestedMoves;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].itemId).toBe("i2"); // Milk's suggestion is untouched

    // Items are now routed to whichever of the several default category sections matches
    // their icon, not necessarily sections[0] - search across all of them.
    const moved = result.current.state.fridges[0].sections.flatMap((sec) => sec.items).find((i) => i.id === "i1");
    expect(moved?.location).toBe("freezer");
    expect(result.current.state.undoMessage).toContain("Frozen Peas");
  });
});

describe("useThatFridge memory", () => {
  it("shows the chat reply without waiting for memory extraction to finish", async () => {
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      agent: "Chef",
      user_message: "What can I cook?",
      agent_response: "Try pasta!",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });

    let resolveExtraction!: (facts: string[]) => void;
    const extractionPromise = new Promise<string[]>((resolve) => {
      resolveExtraction = resolve;
    });
    vi.mocked(api.extractMemory).mockReturnValueOnce(extractionPromise);

    const { result } = renderHook(() => useThatFridge());

    act(() => result.current.actions.askQuick("What can I cook?"));

    // The reply is already shown and typing has stopped, even though the extraction call
    // triggered alongside it is still unresolved - it must never block the reply.
    await waitFor(() => expect(result.current.state.isTyping).toBe(false));
    expect(result.current.state.chatMessages.some((m) => m.text === "Try pasta!")).toBe(true);
    expect(result.current.state.memoryFacts).toEqual([]);

    await act(async () => {
      resolveExtraction(["Vegetarian"]);
      await extractionPromise;
    });

    await waitFor(() => expect(result.current.state.memoryFacts).toEqual(["Vegetarian"]));
  });

  it("does not update memoryFacts when extraction fails", async () => {
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      agent: "Chef",
      user_message: "hi",
      agent_response: "hello!",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });
    vi.mocked(api.extractMemory).mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useThatFridge());
    act(() => result.current.actions.askQuick("hi"));

    await waitFor(() => expect(result.current.state.isTyping).toBe(false));
    // Give the rejected extraction promise a tick to settle (silently, via .catch(() => {})).
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.memoryFacts).toEqual([]);
    expect(result.current.state.syncError).toBeNull(); // best-effort - must not surface as a user-facing error
  });

  const seedTwoFacts = async () => {
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      agent: "Chef",
      user_message: "hi",
      agent_response: "hello!",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });
    vi.mocked(api.extractMemory).mockResolvedValueOnce(["Vegetarian", "Dislikes cilantro"]);

    const { result } = renderHook(() => useThatFridge());
    act(() => result.current.actions.askQuick("hi"));
    await waitFor(() => expect(result.current.state.memoryFacts).toEqual(["Vegetarian", "Dislikes cilantro"]));
    return result;
  };

  it("deleteMemoryFact removes one fact by index", async () => {
    const result = await seedTwoFacts();
    vi.mocked(api.deleteMemoryFactApi).mockResolvedValue(["Dislikes cilantro"]);

    act(() => result.current.actions.deleteMemoryFact(0));

    expect(result.current.state.memoryFacts).toEqual(["Dislikes cilantro"]);
    expect(api.deleteMemoryFactApi).toHaveBeenCalledWith(0);
  });

  it("clearMemoryFacts clears everything", async () => {
    const result = await seedTwoFacts();
    vi.mocked(api.clearMemoryFactsApi).mockResolvedValue(undefined);

    act(() => result.current.actions.clearMemoryFacts());

    expect(result.current.state.memoryFacts).toEqual([]);
  });
});

describe("useThatFridge expiry scan routing", () => {
  it("startExpiryScanForManual creates a fridge/section on the fly and routes to the camera step", async () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [] });
    // A brand-new fridge now gets one section per nutrition category (not a single "General"
    // section), created via several parallel createSection calls - each needs its own distinct
    // id/name here, or every "created" section would collapse into duplicate copies of the
    // same section id and the items below would appear to live in all of them at once.
    vi.mocked(api.createSection).mockImplementation((fridgeId, name) => Promise.resolve({ id: `sec-${name}`, name, items: [] }));

    const { result } = renderHook(() => useThatFridge());

    await act(async () => {
      await result.current.actions.startExpiryScanForManual();
    });

    expect(result.current.state.addStep).toBe(6);
    expect(result.current.state.expiryPhotoTargetId).toBe("manual");
    // No name/icon typed yet, so manualIcon is still its "leftovers" default, which maps to
    // the "Other/Extras" catch-all category - it's the section that gets picked.
    expect(result.current.state.manualSectionId).toBe("sec-Other/Extras");
  });

  it("captureExpiryPhoto for the manual target fills manualExpiryDate and returns to the manual form", async () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [] });
    // A brand-new fridge now gets one section per nutrition category (not a single "General"
    // section), created via several parallel createSection calls - each needs its own distinct
    // id/name here, or every "created" section would collapse into duplicate copies of the
    // same section id and the items below would appear to live in all of them at once.
    vi.mocked(api.createSection).mockImplementation((fridgeId, name) => Promise.resolve({ id: `sec-${name}`, name, items: [] }));
    vi.mocked(api.scanExpiryPhoto).mockResolvedValue({ found: true, date: "2026-09-01", confidence: "high" });

    const { result } = renderHook(() => useThatFridge());
    await act(async () => {
      await result.current.actions.startExpiryScanForManual();
    });

    const file = new File(["x"], "label.jpg", { type: "image/jpeg" });
    await act(async () => {
      await result.current.actions.captureExpiryPhoto(file);
    });

    expect(result.current.state.manualExpiryDate).toBe("2026-09-01");
    expect(result.current.state.addStep).toBe(3);
  });

  it("captureExpiryPhoto for a detected item updates just that item and returns to the review step", async () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [{ id: "s1", name: "General", items: [] }] });
    vi.mocked(api.scanBarcode).mockResolvedValue({
      name: "Milk",
      icon: "milk",
      category: null,
      default_shelf_life_days: 7,
      location: "fridge",
      barcode: "123",
      image_url: null,
    });
    vi.mocked(api.scanExpiryPhoto).mockResolvedValue({ found: true, date: "2026-08-20", confidence: "high" });

    const { result } = renderHook(() => useThatFridge());
    await act(async () => {
      await result.current.actions.lookupBarcode("123");
    });
    expect(result.current.state.addStep).toBe(6);
    const detectedId = result.current.state.detected[0].id;

    const file = new File(["x"], "label.jpg", { type: "image/jpeg" });
    await act(async () => {
      await result.current.actions.captureExpiryPhoto(file);
    });

    expect(result.current.state.detected[0].id).toBe(detectedId);
    expect(result.current.state.detected[0].expiryDate).toBe("2026-08-20");
    expect(result.current.state.addStep).toBe(2);
  });

  it("skipExpiryPhoto returns to the manual form when the scan was started from there", async () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [] });
    // A brand-new fridge now gets one section per nutrition category (not a single "General"
    // section), created via several parallel createSection calls - each needs its own distinct
    // id/name here, or every "created" section would collapse into duplicate copies of the
    // same section id and the items below would appear to live in all of them at once.
    vi.mocked(api.createSection).mockImplementation((fridgeId, name) => Promise.resolve({ id: `sec-${name}`, name, items: [] }));

    const { result } = renderHook(() => useThatFridge());
    await act(async () => {
      await result.current.actions.startExpiryScanForManual();
    });

    act(() => result.current.actions.skipExpiryPhoto());

    expect(result.current.state.addStep).toBe(3);
  });
});

describe("useThatFridge memory undo", () => {
  const mockChatReply = () => {
    vi.mocked(api.sendChatMessage).mockResolvedValue({
      agent: "Chef",
      user_message: "hi",
      agent_response: "hello!",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });
  };

  it("shows an undo toast naming only the newly added facts, not ones already known", async () => {
    mockChatReply();
    vi.mocked(api.extractMemory).mockResolvedValueOnce(["Vegetarian"]);

    const { result } = renderHook(() => useThatFridge());
    act(() => result.current.actions.askQuick("I'm vegetarian"));
    await waitFor(() => expect(result.current.state.memoryFacts).toEqual(["Vegetarian"]));

    vi.mocked(api.extractMemory).mockResolvedValueOnce(["Vegetarian", "Dislikes cilantro"]);
    act(() => result.current.actions.askQuick("also I dislike cilantro"));
    await waitFor(() => expect(result.current.state.memoryFacts).toEqual(["Vegetarian", "Dislikes cilantro"]));

    expect(result.current.state.undoMessage).toBe("Remembered: Dislikes cilantro");
  });

  it("does not show a toast when nothing new was extracted", async () => {
    mockChatReply();
    vi.mocked(api.extractMemory).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useThatFridge());
    act(() => result.current.actions.askQuick("hi"));
    await waitFor(() => expect(result.current.state.isTyping).toBe(false));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.undoMessage).toBeNull();
  });

  it("undo restores the previous facts locally and deletes the new ones server-side", async () => {
    mockChatReply();
    vi.mocked(api.extractMemory).mockResolvedValueOnce(["Vegetarian", "Dislikes cilantro"]);
    vi.mocked(api.deleteMemoryFactApi).mockResolvedValue([]);

    const { result } = renderHook(() => useThatFridge());
    act(() => result.current.actions.askQuick("I'm vegetarian and dislike cilantro"));
    await waitFor(() => expect(result.current.state.memoryFacts).toEqual(["Vegetarian", "Dislikes cilantro"]));

    act(() => result.current.actions.undoLastRemoval());

    expect(result.current.state.memoryFacts).toEqual([]);
    expect(api.deleteMemoryFactApi).toHaveBeenCalledWith(0);
    expect(api.deleteMemoryFactApi).toHaveBeenCalledWith(1);
  });
});
