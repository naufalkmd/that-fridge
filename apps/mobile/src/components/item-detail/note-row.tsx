import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import type { FlatItem } from "@thatfridge/core";

import { useTheme } from "@/lib/theme";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

export function NoteRow({
  item,
  open,
  onToggle,
  isLast,
}: {
  item: FlatItem;
  open: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const { hairline: HAIRLINE, surface2: SURFACE2, ink: INK, faint: FAINT } = useTheme().colors;
  const { status, error, save, retry } = useFieldSave(item.id);
  const [draft, setDraft] = useState(item.note ?? "");

  // Re-seed the draft from server truth each time the row freshly opens, not on every
  // item re-render - a save's own resolved item shouldn't yank the field out from under
  // someone who's mid-edit.
  useEffect(() => {
    if (open) setDraft(item.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit() {
    const next = draft.trim();
    if (next === (item.note ?? "")) return;
    void save({ note: next });
  }

  return (
    <ExpandableRow
      label="Note"
      value={item.note || undefined}
      placeholder="Add a note"
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
    >
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        placeholder="e.g. 2 loaves"
        placeholderTextColor={FAINT}
        style={{
          borderWidth: 1,
          borderColor: HAIRLINE,
          backgroundColor: SURFACE2,
          borderRadius: 6,
          paddingHorizontal: 12,
          paddingVertical: 9,
          fontSize: 13,
          color: INK,
        }}
      />
    </ExpandableRow>
  );
}
