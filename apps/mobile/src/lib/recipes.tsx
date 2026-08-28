import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { describeError, type Recipe, type RecipeInput } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface RecipesContextValue {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  byId: (id: string) => Recipe | undefined;
  toggleFavorite: (id: string) => Promise<void>;
  create: (data: RecipeInput) => Promise<Recipe>;
  update: (id: string, data: Partial<RecipeInput>) => Promise<Recipe>;
  remove: (id: string) => Promise<void>;
}

const RecipesContext = createContext<RecipesContextValue | null>(null);

export function RecipesProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecipes(await api.listRecipes());
    } catch (e) {
      setError(describeError(e, "Couldn't load your recipes."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "signedIn") {
      setLoading(true);
      load();
    } else if (status === "signedOut") {
      setRecipes([]);
      setLoading(false);
    }
  }, [status, load]);

  const replace = (r: Recipe) => setRecipes((prev) => prev.map((x) => (x.id === r.id ? r : x)));

  const toggleFavorite = useCallback(
    async (id: string) => {
      const r = recipes.find((x) => x.id === id);
      if (!r) return;
      replace({ ...r, isFavorite: !r.isFavorite }); // optimistic
      try {
        replace(r.isFavorite ? await api.unfavoriteRecipe(id) : await api.favoriteRecipe(id));
      } catch {
        replace(r); // revert
      }
    },
    [recipes],
  );

  const create = useCallback<RecipesContextValue["create"]>(async (data) => {
    const r = await api.createRecipe(data);
    setRecipes((prev) => [r, ...prev]);
    return r;
  }, []);

  const update = useCallback<RecipesContextValue["update"]>(async (id, data) => {
    const r = await api.updateRecipe(id, data);
    replace(r);
    return r;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteRecipe(id);
    setRecipes((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      recipes,
      loading,
      error,
      refresh: load,
      byId: (id: string) => recipes.find((r) => r.id === id),
      toggleFavorite,
      create,
      update,
      remove,
    }),
    [recipes, loading, error, load, toggleFavorite, create, update, remove],
  );

  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>;
}

export function useRecipes(): RecipesContextValue {
  const ctx = useContext(RecipesContext);
  if (!ctx) throw new Error("useRecipes must be used within <RecipesProvider>");
  return ctx;
}
