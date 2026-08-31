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
  /** Cached recipe or, on a miss, one fetched by id (e.g. opened from a friend's profile). */
  ensureRecipe: (id: string) => Promise<Recipe | null>;
  toggleFavorite: (id: string) => Promise<void>;
  /** Favorite/unfavorite a recipe we hold in full but may not have cached yet. */
  setFavorite: (recipe: Recipe, next: boolean) => Promise<Recipe | null>;
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

  // Upsert — a recipe favorited off a profile isn't in the list until we add it.
  const upsert = useCallback(
    (r: Recipe) =>
      setRecipes((prev) =>
        prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev],
      ),
    [],
  );

  const ensureRecipe = useCallback<RecipesContextValue["ensureRecipe"]>(
    async (id) => {
      const cached = recipes.find((x) => x.id === id);
      if (cached) return cached;
      try {
        const r = await api.getRecipe(id);
        upsert(r);
        return r;
      } catch {
        return null;
      }
    },
    [recipes, upsert],
  );

  const setFavorite = useCallback<RecipesContextValue["setFavorite"]>(
    async (recipe, next) => {
      upsert({ ...recipe, isFavorite: next }); // optimistic
      try {
        const saved = next ? await api.favoriteRecipe(recipe.id) : await api.unfavoriteRecipe(recipe.id);
        // Unfavoriting someone else's recipe drops it back out of your book.
        if (!next && !saved.isMine) {
          setRecipes((prev) => prev.filter((x) => x.id !== recipe.id));
        } else {
          upsert(saved);
        }
        return saved;
      } catch {
        upsert(recipe); // revert
        return null;
      }
    },
    [upsert],
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      const r = recipes.find((x) => x.id === id);
      if (!r) return;
      await setFavorite(r, !r.isFavorite);
    },
    [recipes, setFavorite],
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
      ensureRecipe,
      toggleFavorite,
      setFavorite,
      create,
      update,
      remove,
    }),
    [
      recipes,
      loading,
      error,
      load,
      ensureRecipe,
      toggleFavorite,
      setFavorite,
      create,
      update,
      remove,
    ],
  );

  return <RecipesContext.Provider value={value}>{children}</RecipesContext.Provider>;
}

export function useRecipes(): RecipesContextValue {
  const ctx = useContext(RecipesContext);
  if (!ctx) throw new Error("useRecipes must be used within <RecipesProvider>");
  return ctx;
}
