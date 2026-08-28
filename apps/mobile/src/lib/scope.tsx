import { createContext, useContext, useMemo, useState } from "react";

import type { FlatItem } from "@thatfridge/core";

// "All Fridges" vs a single fridge id — the mobile equivalent of the web's state.kitchenScope.
// Home / Inventory / Search all read the same value so switching scope is consistent app-wide.
type Scope = "all" | string;

interface ScopeContextValue {
  scope: Scope;
  setScope: (s: Scope) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<Scope>("all");
  const value = useMemo(() => ({ scope, setScope }), [scope]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope must be used within <ScopeProvider>");
  return ctx;
}

/** Filter a flat item list by the active scope. */
export function scopeItems(items: FlatItem[], scope: Scope): FlatItem[] {
  return scope === "all" ? items : items.filter((i) => i.fridgeId === scope);
}
