import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  describeError,
  flattenItems,
  type FlatItem,
  type Fridge,
} from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface InventoryContextValue {
  fridges: Fridge[];
  items: FlatItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setItemQty: (itemId: string, qty: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  itemById: (itemId: string) => FlatItem | undefined;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [fridges, setFridges] = useState<Fridge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setFridges(await api.listFridges());
    } catch (err) {
      setError(describeError(err, "Couldn't load your inventory."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "signedIn") {
      setLoading(true);
      load();
    } else if (status === "signedOut") {
      setFridges([]);
      setLoading(false);
    }
  }, [status, load]);

  const setItemQty = useCallback(
    async (itemId: string, qty: number) => {
      const next = Math.max(1, qty);
      // optimistic
      setFridges((prev) =>
        prev.map((f) => ({
          ...f,
          sections: f.sections.map((s) => ({
            ...s,
            items: s.items.map((it) => (it.id === itemId ? { ...it, qty: next } : it)),
          })),
        })),
      );
      try {
        await api.updateItem(itemId, { quantity: next });
      } catch {
        load(); // reconcile on failure
      }
    },
    [load],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const snapshot = fridges;
      setFridges((prev) =>
        prev.map((f) => ({
          ...f,
          sections: f.sections.map((s) => ({
            ...s,
            items: s.items.filter((it) => it.id !== itemId),
          })),
        })),
      );
      try {
        await api.deleteItem(itemId);
      } catch {
        setFridges(snapshot); // roll back
        throw new Error("Couldn't delete that item.");
      }
    },
    [fridges],
  );

  const items = useMemo(() => flattenItems(fridges), [fridges]);
  const itemById = useCallback((id: string) => items.find((i) => i.id === id), [items]);

  const value = useMemo(
    () => ({ fridges, items, loading, error, refresh: load, setItemQty, removeItem, itemById }),
    [fridges, items, loading, error, load, setItemQty, removeItem, itemById],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within <InventoryProvider>");
  return ctx;
}
