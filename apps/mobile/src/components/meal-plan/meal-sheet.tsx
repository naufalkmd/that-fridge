import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { MealForm } from "@/components/calendar/meal-form";
import type { MealDraft } from "@/lib/mealPlan";

/**
 * The meal form in its own bottom sheet (used by the Meal plan screen). It owns the saving / error
 * state so the screen only supplies the actions; it closes itself on a successful save or delete.
 */
export function MealSheet({
  initial,
  slots,
  dayOptions,
  onClose,
  onSave,
  onDelete,
  onSaveSlots,
}: {
  /** The meal to add or edit; null keeps the sheet closed. */
  initial: MealDraft | null;
  slots: string[];
  dayOptions: string[];
  onClose: () => void;
  /** Resolves to an error message, or null on success. */
  onSave: (draft: MealDraft) => Promise<string | null>;
  onDelete: (entry: { id: string; title: string }) => Promise<void>;
  onSaveSlots: (slots: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MealDraft | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    setError(null);
    setSaving(false);
  }, [initial]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const problem = await onSave(draft);
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  async function remove() {
    if (!draft?.id) return;
    setSaving(true);
    await onDelete({ id: draft.id, title: draft.title });
    setSaving(false);
    onClose();
  }

  return (
    <BottomSheet visible={draft !== null} onClose={onClose} maxHeight={620}>
      {draft && (
        <MealForm
          draft={draft}
          slots={slots}
          dayOptions={dayOptions}
          saving={saving}
          error={error}
          onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          onSave={save}
          onCancel={onClose}
          onDelete={draft.id ? remove : undefined}
          onSaveSlots={onSaveSlots}
        />
      )}
    </BottomSheet>
  );
}
