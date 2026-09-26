import { useCallback, useMemo, useState } from "react";
import { describeError, type CalendarEntry, type MealStatus } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { cancelMealReminder, syncMealReminder } from "@/lib/localNotifications";
import { defaultFridgeId, draftToInput, userSlots, validateDraft, type MealDraft } from "@/lib/mealPlan";
import { useScope } from "@/lib/scope";

/**
 * Everything that changes the meal plan, in one place so the calendar and the Meal plan screen
 * behave identically: save (create or update), delete, the quick "cooked" tick, and the user's slot
 * list. `onChanged` runs after each successful change so the screen can refetch.
 */
export function useMealActions(onChanged: () => void) {
  const { user, updateMealSlots } = useAuth();
  const { fridges } = useInventory();
  const { scope } = useScope();
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(() => userSlots(user), [user]);
  const fridgeId = defaultFridgeId(fridges, scope);

  /** Save a meal; resolves to an error message to show in the form, or null on success. */
  const saveMeal = useCallback(
    async (draft: MealDraft): Promise<string | null> => {
      const problem = validateDraft(draft);
      if (problem) return problem;
      try {
        const input = draftToInput(draft);
        const saved = draft.id ? await api.updateMealEntry(draft.id, input) : await api.createMealEntry(input);
        void syncMealReminder(saved);
        setError(null);
        onChanged();
        return null;
      } catch (e) {
        return describeError(e, "Couldn't save that meal.");
      }
    },
    [onChanged],
  );

  const deleteMeal = useCallback(
    async (entry: { id: string }) => {
      try {
        await api.deleteMealEntry(entry.id);
        void cancelMealReminder(entry.id);
        setError(null);
        onChanged();
      } catch {
        setError("Couldn't delete that meal.");
      }
    },
    [onChanged],
  );

  const quickStatus = useCallback(
    async (entry: CalendarEntry, status: MealStatus) => {
      const id = entry.refs.mealEntryId;
      if (!id) return;
      try {
        const saved = await api.updateMealEntry(id, { status });
        void syncMealReminder(saved);
        setError(null);
        onChanged();
      } catch {
        setError("Couldn't update that meal.");
      }
    },
    [onChanged],
  );

  return { slots, fridgeId, saveMeal, deleteMeal, quickStatus, saveSlots: updateMealSlots, error, clearError: () => setError(null) };
}
