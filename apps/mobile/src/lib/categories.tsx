import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { describeError, type Category } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";

interface CategoriesContextValue {
  categories: Category[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<Category>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Assign a category (or null to clear) to many items; reloads inventory so rows update. */
  assign: (itemIds: string[], categoryId: string | null) => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const { refresh: refreshInventory } = useInventory();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCategories(await api.listCategories());
    } catch (err) {
      setError(describeError(err, "Couldn't load your categories."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "signedIn") {
      setLoading(true);
      load();
    } else if (status === "signedOut") {
      setCategories([]);
      setLoading(false);
    }
  }, [status, load]);

  const create = useCallback(async (name: string) => {
    const created = await api.createCategory(name.trim());
    setCategories((prev) => [...prev, created]);
    return created;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    const updated = await api.updateCategory(id, { name: name.trim() });
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const snapshot = categories;
      setCategories((prev) => prev.filter((c) => c.id !== id));
      try {
        await api.deleteCategory(id);
        await refreshInventory(); // items pointing at it are now Uncategorized
      } catch {
        setCategories(snapshot);
      }
    },
    [categories, refreshInventory],
  );

  const assign = useCallback(
    async (itemIds: string[], categoryId: string | null) => {
      if (itemIds.length === 0) return;
      await api.setItemsCategory(itemIds, categoryId);
      await refreshInventory();
    },
    [refreshInventory],
  );

  const value = useMemo(
    () => ({
      categories,
      loading,
      error,
      refresh: load,
      create,
      rename,
      remove,
      assign,
    }),
    [categories, loading, error, load, create, rename, remove, assign],
  );

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories(): CategoriesContextValue {
  const ctx = useContext(CategoriesContext);
  if (!ctx)
    throw new Error("useCategories must be used within <CategoriesProvider>");
  return ctx;
}
