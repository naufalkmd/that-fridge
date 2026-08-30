import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  describeError,
  flattenItems,
  type BarcodeSuggestion,
  type CreateItemInput,
  type FlatItem,
  type Fridge,
  type NutritionCategory,
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
  addManyItems: (
    items: {
      name: string;
      icon?: string;
      icon_url?: string | null;
      location?: "fridge" | "freezer" | "pantry";
      quantity?: number;
      sectionId?: string;
      nutrition_category?: NutritionCategory | null;
      expiry_date?: string;
      shelf_life_days?: number;
    }[],
  ) => Promise<number>;
  lookupBarcode: (barcode: string) => Promise<BarcodeSuggestion>;
  ensureFridgeId: () => Promise<string>;
  ensureSectionId: () => Promise<string>;
  setItemQty: (itemId: string, qty: number) => Promise<void>;
  patchItem: (itemId: string, data: UpdateItemInput) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  restoreItem: (item: FlatItem) => Promise<void>;
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

  // Batch add (receipt / photo scan) — resolve the target section once, create in parallel,
  // reload once. Returns how many succeeded.
  const addManyItems = useCallback<InventoryContextValue["addManyItems"]>(
    async (list) => {
      if (list.length === 0) return 0;
      const sectionId = await resolveTarget();
      const results = await Promise.allSettled(
        list.map((d) =>
          api.createItem(d.sectionId || sectionId, {
            name: d.name,
            icon: d.icon || "generic",
            ...(d.icon_url ? { icon_url: d.icon_url } : {}),
            location: d.location ?? "fridge",
            quantity: d.quantity ?? 1,
            ...(d.nutrition_category ? { nutrition_category: d.nutrition_category } : {}),
            ...(d.expiry_date ? { expiry_date: d.expiry_date, shelf_life_days: d.shelf_life_days } : {}),
            note: "Just added",
          }),
        ),
      );
      await load();
      return results.filter((r) => r.status === "fulfilled").length;
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

  // Re-create a just-deleted item (undo). A fresh row/id — the API has no un-delete.
  const restoreItem = useCallback(async (item: FlatItem) => {
    await api.createItem(item.sectionId, {
      name: item.name,
      icon: item.icon || "generic",
      nutrition_category: item.nutritionCategory ?? null,
      location: item.location,
      quantity: item.qty,
      note: item.note || undefined,
    });
    await load();
  }, [load]);

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
      addManyItems,
      lookupBarcode,
      ensureFridgeId,
      ensureSectionId: resolveTarget,
      setItemQty,
      patchItem,
      removeItem,
      restoreItem,
      itemById,
    }),
    [
      fridges,
      items,
      loading,
      error,
      load,
      addItem,
      addManyItems,
      lookupBarcode,
      ensureFridgeId,
      resolveTarget,
      setItemQty,
      patchItem,
      restoreItem,
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
