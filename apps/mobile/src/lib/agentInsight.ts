import { useEffect, useState } from "react";

import { daysLabel, type ChatAgentName, type FlatItem } from "@thatfridge/core";

import { api } from "@/lib/api";

// One-shot agent "insight" for the Home crew tip cards — mirrors the web's ensureAgentInsight.
// Fetched at most once per agent per app launch (module cache). Still counts against the free
// weekly chat quota server-side (same shared budget as Quick Chat and "Activate {agent}"), just
// not persisted into chat_history/session list - see AgentController::send's compact handling.

const PROMPT: Record<ChatAgentName, string> = {
  Guardian: "In one short sentence, what in my fridge should I use first and why?",
  Chef: "In one short sentence, suggest one thing I could cook tonight with what I have.",
  Shopkeeper: "In one short sentence, what essential am I running low on?",
  Organizer: "In one short sentence, one quick tip to keep my fridge tidier.",
};

type State = { text: string | null; loading: boolean };
const cache = new Map<ChatAgentName, State>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function ensure(agent: ChatAgentName, items: FlatItem[]) {
  const existing = cache.get(agent);
  if (existing?.text || existing?.loading) return;
  cache.set(agent, { text: null, loading: true });
  notify();
  const inventory = items
    .slice(0, 40)
    .map((i) => `${i.name} (${daysLabel(i.days)})`)
    .join(", ");
  try {
    const res = await api.sendChat(PROMPT[agent], agent, {
      inventory,
      compact: true,
    });
    cache.set(agent, { text: res.agent_response, loading: false });
  } catch {
    cache.set(agent, { text: null, loading: false });
  }
  notify();
}

/** Returns the cached insight for an agent, kicking off a fetch the first time it's used. */
export function useAgentInsight(
  agent: ChatAgentName,
  items: FlatItem[],
  enabled: boolean,
): State {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  useEffect(() => {
    if (enabled) ensure(agent, items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, agent]);
  return cache.get(agent) ?? { text: null, loading: false };
}
