import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { routeChatAgent, useThatFridge } from "./useThatFridge";
import { getRecipesView, getScopedItems } from "./selectors";
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
  // checkOrganizerMoves() fires this fire-and-forget after every sweep, same reasoning as
  // extractMemory above - give every test a sane default so tests that don't care about the
  // Tidiness tally don't hit an unhandled rejection either.
  vi.mocked(api.incrementOrganizerTally).mockResolvedValue({ itemsCheckedTotal: 0, itemsCorrectTotal: 0, lastCheckedAt: null });
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

  // Quick Chat's photo-attach button (ChatScreen.tsx) - covers both the request (image
  // forwarded, a default prompt used when there's no caption) and the optimistic sent bubble
  // (a local thumbnail, not just a filename).
  it("sends an attached photo through to the API and shows a thumbnail in the sent bubble, defaulting the message when there's no caption", async () => {
    const sendChatMessageMock = vi.mocked(api.sendChatMessage).mockResolvedValueOnce({
      agent: "Chef",
      user_message: "What do you see in this photo?",
      agent_response: "That's a fridge full of veggies!",
      session_id: "session-1",
      recipe_suggestion: null,
      mocked: false,
    });

    const { result } = renderHook(() => useThatFridge());
    const photo = new File(["fake-image-bytes"], "fridge.jpg", { type: "image/jpeg" });

    await act(async () => {
      result.current.actions.sendMessage(photo);
    });

    expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
    const [message, , , , , , , image] = sendChatMessageMock.mock.calls[0];
    expect(message).toBe("What do you see in this photo?");
    expect(image).toBe(photo);

    const userMsg = result.current.state.chatMessages.find((m) => m.from === "user" && m.attachmentUrl);
    expect(userMsg?.attachmentName).toBe("fridge.jpg");
    expect(userMsg?.attachmentUrl).toMatch(/^blob:/);

    await waitFor(() => expect(result.current.state.isTyping).toBe(false));
  });
});

describe("useThatFridge sendJoinRequest", () => {
  async function openAFriendProfile() {
    vi.mocked(api.fetchFriendProfile).mockResolvedValue({
      id: "u2",
      name: "Riley",
      username: "riley",
      fridges: [{ id: "f1", name: "Riley's Kitchen", memberCount: 1, role: null, requestStatus: null }],
      recipes: [],
    });

    const { result } = renderHook(() => useThatFridge());
    act(() => {
      result.current.actions.openFriendProfile("riley");
    });
    await waitFor(() => expect(result.current.state.friendProfile).not.toBeNull());
    return result;
  }

  it("optimistically marks the fridge as requested and calls the API", async () => {
    const requestMock = vi.mocked(api.requestJoinFridge).mockResolvedValue({
      id: "r1",
      fridgeId: "f1",
      requesterId: "me",
      requesterName: "Me",
      requesterUsername: "me",
      status: "pending",
      createdAt: Date.now(),
    });
    const result = await openAFriendProfile();

    act(() => {
      result.current.actions.sendJoinRequest("f1");
    });

    expect(requestMock).toHaveBeenCalledWith("f1");
    expect(result.current.state.friendProfile?.fridges[0].requestStatus).toBe("pending");
  });

  it("rolls back the optimistic update and surfaces a sync error on failure", async () => {
    vi.mocked(api.requestJoinFridge).mockRejectedValue(new Error("already a member"));
    const result = await openAFriendProfile();

    act(() => {
      result.current.actions.sendJoinRequest("f1");
    });

    await waitFor(() => expect(result.current.state.syncError).toBeTruthy());
    expect(result.current.state.friendProfile?.fridges[0].requestStatus).toBeNull();
  });
});

describe("useThatFridge toggleFavoriteFriendRecipe", () => {
  const friendRecipe = {
    id: "rec1",
    name: "Chili",
    minutes: 30,
    category: null,
    ingredients: [{ icon: "leftovers", name: "Beans" }],
    steps: ["Cook it"],
    attachments: [],
    mealType: null,
    vibes: [],
    foodFocus: [],
    madeCount: 0,
    isFavorite: false,
    isCustom: true,
    isMine: false,
    ownerName: "Riley",
    ownerUsername: "riley",
  };

  async function openAFriendProfileWithARecipe() {
    vi.mocked(api.fetchFriendProfile).mockResolvedValue({
      id: "u2",
      name: "Riley",
      username: "riley",
      fridges: [],
      recipes: [friendRecipe],
    });

    const { result } = renderHook(() => useThatFridge());
    act(() => {
      result.current.actions.openFriendProfile("riley");
    });
    await waitFor(() => expect(result.current.state.friendProfile).not.toBeNull());
    return result;
  }

  it("optimistically favorites a friend's recipe and calls the API", async () => {
    const favoriteMock = vi.mocked(api.favoriteRecipe).mockResolvedValue({ ...friendRecipe, isFavorite: true });
    const result = await openAFriendProfileWithARecipe();

    act(() => {
      result.current.actions.toggleFavoriteFriendRecipe("rec1");
    });

    expect(favoriteMock).toHaveBeenCalledWith("rec1");
    expect(result.current.state.friendProfile?.recipes[0].isFavorite).toBe(true);
  });

  it("rolls back the optimistic favorite and surfaces a sync error on failure", async () => {
    vi.mocked(api.favoriteRecipe).mockRejectedValue(new Error("network error"));
    const result = await openAFriendProfileWithARecipe();

    act(() => {
      result.current.actions.toggleFavoriteFriendRecipe("rec1");
    });

    await waitFor(() => expect(result.current.state.syncError).toBeTruthy());
    expect(result.current.state.friendProfile?.recipes[0].isFavorite).toBe(false);
  });
});

describe("useThatFridge edit/delete gating on isMine", () => {
  it("does not open the edit form or delete a custom recipe favorited from someone else", async () => {
    mockInitFetch();
    // mockInitFetch() defaults fetchRecipes to [] - override after, not before, calling it.
    vi.mocked(api.fetchRecipes).mockResolvedValue([
      {
        id: "rec1",
        name: "Riley's Chili",
        minutes: 30,
        category: null,
        ingredients: [{ icon: "leftovers", name: "Beans" }],
        steps: ["Cook it"],
        attachments: [],
        mealType: null,
        vibes: [],
        foodFocus: [],
        madeCount: 0,
        isFavorite: true,
        isCustom: true,
        isMine: false,
        ownerName: "Riley",
        ownerUsername: "riley",
      },
    ]);
    const { result } = renderHook(() => useThatFridge());
    act(() => result.current.actions.onAuthEmailChange("joey@thatfridge.test"));
    act(() => result.current.actions.onAuthPasswordChange("password123"));
    await act(async () => {
      await result.current.actions.submitAuth();
    });
    await waitFor(() => expect(result.current.state.recipes).toHaveLength(1));

    act(() => result.current.actions.openEditRecipeForm("rec1"));
    expect(result.current.state.screen).not.toBe("recipeForm");

    act(() => result.current.actions.deleteCustomRecipe("rec1"));
    expect(result.current.state.recipes).toHaveLength(1);
    expect(api.deleteRecipe).not.toHaveBeenCalled();
  });
});

describe("useThatFridge join request approve/decline", () => {
  async function setUpAnOwnedFridgeWithAPendingRequest() {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "Mine", role: "owner", memberCount: 1, sections: [] });
    vi.mocked(api.fetchFridgeMembers).mockResolvedValue([]);
    vi.mocked(api.fetchJoinRequests).mockResolvedValue([
      { id: "r1", fridgeId: "f1", requesterId: "u2", requesterName: "Riley", requesterUsername: "riley", status: "pending", createdAt: Date.now() },
    ]);

    const { result } = renderHook(() => useThatFridge());
    await act(async () => {
      await result.current.actions.addFridge();
    });
    act(() => {
      result.current.actions.openStylePicker(0);
    });
    await waitFor(() => expect(result.current.state.joinRequests).toHaveLength(1));
    return result;
  }

  it("approving removes the request, bumps the member count, and calls the API", async () => {
    const approveMock = vi.mocked(api.approveJoinRequest).mockResolvedValue(undefined);
    const result = await setUpAnOwnedFridgeWithAPendingRequest();

    act(() => {
      result.current.actions.approveJoinRequestAction("r1");
    });

    expect(approveMock).toHaveBeenCalledWith("r1");
    expect(result.current.state.joinRequests).toHaveLength(0);
    expect(result.current.state.fridges[0].memberCount).toBe(2);
  });

  it("declining removes the request without creating a membership, and calls the API", async () => {
    const declineMock = vi.mocked(api.declineJoinRequest).mockResolvedValue(undefined);
    const result = await setUpAnOwnedFridgeWithAPendingRequest();

    act(() => {
      result.current.actions.declineJoinRequestAction("r1");
    });

    expect(declineMock).toHaveBeenCalledWith("r1");
    expect(result.current.state.joinRequests).toHaveLength(0);
    expect(result.current.state.fridges[0].memberCount).toBe(1);
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

describe("useThatFridge Mark as made", () => {
  it("marking an ingredient 'remaining' keeps the item in the fridge, opened, and still countable for other recipes", async () => {
    vi.mocked(api.createFridge).mockResolvedValue({ id: "f1", name: "My Fridge", sections: [] });
    vi.mocked(api.createSection).mockImplementation((fridgeId, name) => Promise.resolve({ id: `sec-${name}`, name, items: [] }));
    vi.mocked(api.createItem).mockResolvedValue({ id: "i1", name: "Milk", icon: "milk", freshness: 90, days: 7, note: "", qty: 1 });
    vi.mocked(api.markRecipeMade).mockResolvedValue({
      id: "r1",
      name: "Pancakes",
      minutes: 20,
      category: "breakfast",
      ingredients: [{ icon: "milk", name: "Milk" }],
      steps: [],
      attachments: [],
      mealType: null,
      vibes: [],
      foodFocus: [],
      madeCount: 1,
      isFavorite: false,
      isCustom: true,
      isMine: true,
      ownerName: null,
      ownerUsername: null,
    });
    vi.mocked(api.createRecipe)
      .mockResolvedValueOnce({
        id: "r1",
        name: "Pancakes",
        minutes: 20,
        category: "breakfast",
        ingredients: [{ icon: "milk", name: "Milk" }],
        steps: [],
        attachments: [],
        mealType: null,
        vibes: [],
        foodFocus: [],
        madeCount: 0,
        isFavorite: false,
        isCustom: true,
        isMine: true,
        ownerName: null,
        ownerUsername: null,
      })
      .mockResolvedValueOnce({
        id: "r2",
        name: "Milkshake",
        minutes: 5,
        category: "snack",
        ingredients: [{ icon: "milk", name: "Milk" }],
        steps: [],
        attachments: [],
        mealType: null,
        vibes: [],
        foodFocus: [],
        madeCount: 0,
        isFavorite: false,
        isCustom: true,
        isMine: true,
        ownerName: null,
        ownerUsername: null,
      });

    const { result } = renderHook(() => useThatFridge());

    act(() => result.current.actions.onManualNameChange("Milk"));
    await act(async () => {
      await result.current.actions.confirmManualAdd();
    });

    await act(async () => {
      await result.current.actions.addSuggestedRecipeToLibrary({
        name: "Pancakes",
        description: "",
        minutes: 20,
        category: "breakfast",
        ingredients: [{ name: "Milk" }],
        steps: [],
      });
      await result.current.actions.addSuggestedRecipeToLibrary({
        name: "Milkshake",
        description: "",
        minutes: 5,
        category: "snack",
        ingredients: [{ name: "Milk" }],
        steps: [],
      });
    });

    act(() => result.current.actions.openMarkRecipeMade("r1"));
    const candidate = result.current.state.markMadeCandidates[0];
    expect(candidate.ingredientName).toBe("Milk");

    act(() => result.current.actions.setMarkMadeStatus(candidate.id, "remaining"));
    act(() => result.current.actions.confirmMarkMade());

    // Still in the fridge, marked opened - not consumed or removed.
    const item = result.current.state.fridges[0].sections.flatMap((sec) => sec.items).find((i) => i.id === "i1");
    expect(item?.opened).toBe(true);
    expect(api.recordItemUsage).not.toHaveBeenCalled();
    expect(api.deleteItem).not.toHaveBeenCalled();

    // Still counts as "have it" for the other recipe that also needs milk.
    const milkshakeView = getRecipesView(result.current.state).find((r) => r.id === "r2");
    expect(milkshakeView?.ingredientsView[0].have).toBe(true);
  });
});

// Shared by the fridge-scope tests below - logs in through the real authenticated init-fetch
// path (login -> fetchFridges) with joey's exact real fridge shape: two empty "New Fridge"
// entries plus a non-empty "Garage", matching how an existing user's fridges actually arrive
// (not via addFridge()/confirmManualAdd(), which target addFridgeIndex - the Add-item flow's
// own fridge pointer, synced from activeFridge by openAdd(), unrelated to what's displayed
// elsewhere).
function mockInitFetch() {
  vi.mocked(api.login).mockResolvedValue({ user: { id: "u-joey", name: "Joey", username: "joey", email: "joey@thatfridge.test" }, token: "t1" });
  vi.mocked(api.fetchFridges).mockResolvedValue([
    { id: "f1", name: "New Fridge", sections: [] },
    { id: "f2", name: "New Fridge", sections: [] },
    { id: "f3", name: "Garage", sections: [{ id: "s1", name: "Protein", items: [{ id: "i1", name: "Eggs", icon: "eggs", freshness: 90, days: 11, note: "", qty: 1 }] }] },
  ]);
  vi.mocked(api.fetchRecipes).mockResolvedValue([]);
  vi.mocked(api.fetchShoppingItems).mockResolvedValue([]);
  vi.mocked(api.fetchNotificationPrefs).mockResolvedValue({ expiryAlerts: true, lowStock: true, recipeTips: true, weeklyDigest: false, crewActionsEnabled: false });
  vi.mocked(api.fetchNotificationEvents).mockResolvedValue([]);
  vi.mocked(api.fetchChatHistory).mockResolvedValue({ messages: [], session_id: null });
  vi.mocked(api.fetchUsageHistory).mockResolvedValue([]);
  vi.mocked(api.fetchMemoryFacts).mockResolvedValue([]);
  vi.mocked(api.fetchUserGoal).mockResolvedValue({ metricType: "waste_rate", targetValue: 20, period: "weekly", isActive: true, updatedAt: 0 });
  vi.mocked(api.fetchScoreSnapshots).mockResolvedValue([]);
  vi.mocked(api.fetchBadges).mockResolvedValue([]);
}

async function loginAsJoeyWithMockedFridges(result: { current: ReturnType<typeof useThatFridge> }) {
  mockInitFetch();
  act(() => result.current.actions.onAuthEmailChange("joey@thatfridge.test"));
  act(() => result.current.actions.onAuthPasswordChange("password123"));
  await act(async () => {
    await result.current.actions.submitAuth();
  });
  await waitFor(() => expect(result.current.state.fridges).toHaveLength(3));
}

describe("useThatFridge fridge scope switching", () => {
  it("still shows every fridge's items after switching to a specific fridge and back to All Fridges", async () => {
    const { result } = renderHook(() => useThatFridge());
    await loginAsJoeyWithMockedFridges(result);

    // Default scope ("all") already finds Garage's item, across all 3 fridges.
    expect(getScopedItems(result.current.state).map((i) => i.name)).toEqual(["Eggs"]);

    const garageIndex = result.current.state.fridges.findIndex((f) => f.name === "Garage");
    act(() => result.current.actions.selectFridgeScope(garageIndex));
    expect(getScopedItems(result.current.state).map((i) => i.name)).toEqual(["Eggs"]);

    act(() => result.current.actions.selectFridgeScope("all"));
    expect(result.current.state.kitchenScope).toBe("all");
    expect(getScopedItems(result.current.state).map((i) => i.name)).toEqual(["Eggs"]);
  });
});

describe("useThatFridge Crew insight inventory context", () => {
  // Reported: generating a Crew member's insight while scoped to "All Fridges" said the fridge
  // was empty even though Garage (a different, non-active fridge) clearly wasn't. Root cause:
  // buildInventorySummary was handed just state.fridges[state.activeFridge] - a single fridge -
  // completely ignoring kitchenScope. activeFridge defaults to 0 (the first empty "New Fridge"
  // here, exactly joey's real shape), so the agent only ever saw that one, empty, fridge even
  // though kitchenScope was "all" the whole time.
  it("sends every scoped fridge's items to the agent, not just whichever fridge happens to be active", async () => {
    const { result } = renderHook(() => useThatFridge());
    await loginAsJoeyWithMockedFridges(result);
    expect(result.current.state.activeFridge).toBe(0); // the first, empty "New Fridge"
    expect(result.current.state.kitchenScope).toBe("all");

    vi.mocked(api.sendChatMessage).mockResolvedValue({
      agent: "Chef",
      user_message: "What can I cook tonight with what I have?",
      agent_response: "Try an omelette!",
      session_id: null,
      recipe_suggestion: null,
      mocked: false,
    });

    act(() => result.current.actions.activateAgent("Chef"));
    await waitFor(() => expect(api.sendChatMessage).toHaveBeenCalled());

    const inventory = vi.mocked(api.sendChatMessage).mock.calls[0][2];
    expect(inventory).toContain("Eggs");
    expect(inventory).not.toBe("Fridge is currently empty.");
  });
});
