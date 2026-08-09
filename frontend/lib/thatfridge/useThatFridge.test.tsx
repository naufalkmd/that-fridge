import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { routeChatAgent, useThatFridge } from "./useThatFridge";
import * as api from "./api";

vi.mock("./api");

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
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
    vi.mocked(api.createSection).mockResolvedValue({ id: "s1", name: "General", items: [] });
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
