import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { describeError, type ShoppingItem } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";

interface ShoppingContextValue {
  items: ShoppingItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (name: string, shopUrl?: string | null) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearChecked: () => Promise<void>;
}

const ShoppingContext = createContext<ShoppingContextValue | null>(null);

export function ShoppingProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { ensureFridgeId } = useInventory();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.listShoppingItems());
    } catch (err) {
      setError(describeError(err, "Couldn't load your shopping list."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "signedIn") {
      setLoading(true);
      load();
    } else if (status === "signedOut") {
      setItems([]);
      setLoading(false);
    }
  }, [status, load]);

  const add = useCallback(
    async (name: string, shopUrl?: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const fridgeId = await ensureFridgeId();
      const created = await api.addShoppingItem(fridgeId, trimmed, shopUrl);
      setItems((prev) => [created, ...prev]);
    },
    [ensureFridgeId],
  );

  const toggle = useCallback(
    async (id: string) => {
      const cur = items.find((i) => i.id === id);
      if (!cur) return;
      const next = !cur.checked;
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, checked: next } : i)),
      );
      try {
        await api.updateShoppingItem(id, { checked: next });
      } catch {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, checked: !next } : i)),
        );
      }
    },
    [items],
  );

  const remove = useCallback(
    async (id: string) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => i.id !== id));
      try {
        await api.deleteShoppingItem(id);
      } catch {
        setItems(snapshot);
      }
    },
    [items],
  );

  const clearChecked = useCallback(async () => {
    const checked = items.filter((i) => i.checked);
    setItems((prev) => prev.filter((i) => !i.checked));
    await Promise.allSettled(checked.map((i) => api.deleteShoppingItem(i.id)));
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      loading,
      error,
      refresh: load,
      add,
      toggle,
      remove,
      clearChecked,
    }),
    [items, loading, error, load, add, toggle, remove, clearChecked],
  );

  return (
    <ShoppingContext.Provider value={value}>
      {children}
    </ShoppingContext.Provider>
  );
}

export function useShopping(): ShoppingContextValue {
  const ctx = useContext(ShoppingContext);
  if (!ctx)
    throw new Error("useShopping must be used within <ShoppingProvider>");
  return ctx;
}
