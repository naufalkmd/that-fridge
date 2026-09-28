import { useEffect, useState } from "react";

import type { ChatAgentName } from "@thatfridge/core";

// The one-sentence tip a crew member gave when the user tapped "Ask {agent} for a tip" in its
// Activate sheet (Crew tab). Kept for the session and shared, so the crew member's Home tip card
// shows it too instead of its data-driven fallback. Nothing here calls the AI itself.

const tips = new Map<ChatAgentName, string>();
const listeners = new Set<() => void>();

export function setCrewTip(agent: ChatAgentName, text: string | null): void {
  if (text) tips.set(agent, text);
  else tips.delete(agent);
  listeners.forEach((l) => l());
}

export function useCrewTip(agent: ChatAgentName): string | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return tips.get(agent) ?? null;
}
