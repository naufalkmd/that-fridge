import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  describeError,
  flattenItems,
  type BarcodeSuggestion,
  type CreateItemInput,
  type FlatItem,
  type Fridge,
  type UpdateItemInput,
} from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface InventoryContextValue {
  fridges: Fridge[];
  items: FlatItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (data: Omit<CreateItemInput, "icon"> & { icon?: string }) => Promise<void>;
  lookupBarcode: (barcode: string) => Promise<BarcodeSuggestion>;
  ensureFridgeId: () => Promise<string>;
  setItemQty: (itemId: string, qty: number) => Promise<void>;
  patchItem: (itemId: string, data: UpdateItemInput) => Promise<void>;
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

  // Ensure the account has at least one fridge, returning its id (creating "My Fridge"
  // for a brand-new account).
  const ensureFridgeId = useCallback(async (): Promise<string> => {
    if (fridges.length > 0) return fridges[0].id;
    const fridge = await api.createFridge("My Fridge");
    setFridges([fridge]);
    return fridge.id;
  }, [fridges]);

  // Resolve where a new item goes: first section of the first fridge, creating a
  // fridge and/or "General" section on the fly for a brand-new account.
  const resolveTarget = useCallback(async (): Promise<string> => {
    const fridgeId = await ensureFridgeId();
    const current = fridges.find((f) => f.id === fridgeId);
    let fridge = current ?? (await api.listFridges()).find((f) => f.id === fridgeId)!;
    if (fridge.sections.length === 0) {
      const section = await api.createSection(fridge.id, "General");
      fridge = { ...fridge, sections: [section] };
      setFridges((prev) => {
        const has = prev.some((f) => f.id === fridge.id);
        return has ? prev.map((f) => (f.id === fridge.id ? fridge : f)) : [fridge, ...prev];
      });
    }
    return fridge.sections[0].id;
  }, [fridges, ensureFridgeId]);

  const addItem = useCallback<InventoryContextValue["addItem"]>(
    async (data) => {
      const sectionId = await resolveTarget();
      await api.createItem(sectionId, { icon: "generic", ...data });
      await load();
    },
    [resolveTarget, load],
  );

  const lookupBarcode = useCallback(
    async (barcode: string) => {
      const sectionId = await resolveTarget();
      return api.scanBarcode(sectionId, barcode);
    },
    [resolveTarget],
  );

  const patchItem = useCallback(
    async (itemId: string, data: UpdateItemInput) => {
      const updated = await api.updateItem(itemId, data);
      setFridges((prev) =>
        prev.map((f) => ({
          ...f,
          sections: f.sections.map((s) => ({
            ...s,
            items: s.items.map((it) => (it.id === itemId ? { ...it, ...updated } : it)),
          })),
        })),
      );
    },
    [],
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
    () => ({
      fridges,
      items,
      loading,
      error,
      refresh: load,
      addItem,
      lookupBarcode,
      ensureFridgeId,
      setItemQty,
      patchItem,
      removeItem,
      itemById,
    }),
    [
      fridges,
      items,
      loading,
      error,
      load,
      addItem,
      lookupBarcode,
      ensureFridgeId,
      setItemQty,
      patchItem,
      removeItem,
      itemById,
    ],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within <InventoryProvider>");
  return ctx;
}
