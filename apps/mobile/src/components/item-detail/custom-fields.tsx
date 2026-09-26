import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CustomField, FlatItem } from "@thatfridge/core";

import { useTheme } from "@/lib/theme";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

// custom_fields is a whole-array-replace field on the backend (see ItemController) - every
// commit here sends the item's full customFields array, recomputed from current props at
// commit time, never from a snapshot captured when the row opened.
function toPayload(fields: CustomField[]) {
  return fields.map(({ id, label, value }) => ({ id, label, value }));
}

function CustomFieldRow({
  item,
  field,
  open,
  onToggle,
  isLast,
}: {
  item: FlatItem;
  field: CustomField;
  open: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const { hairline: HAIRLINE, surface2: SURFACE2, ink: INK, faint: FAINT, bad: BAD, accent: AMBER, onAccent: CANVAS } =
    useTheme().colors;
  const { status, error, save, retry } = useFieldSave(item.id);
  const [labelDraft, setLabelDraft] = useState(field.label);
  const [valueDraft, setValueDraft] = useState(field.value);

  useEffect(() => {
    if (open) {
      setLabelDraft(field.label);
      setValueDraft(field.value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function done() {
    const label = labelDraft.trim() || field.label;
    const next = item.customFields.map((f) => (f.id === field.id ? { ...f, label, value: valueDraft.trim() } : f));
    void save({ custom_fields: toPayload(next) }, { then: onToggle });
  }

  function remove() {
    Alert.alert("Remove this field?", `"${field.label}" will be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          void save({ custom_fields: toPayload(item.customFields.filter((f) => f.id !== field.id)) }),
      },
    ]);
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: INK,
  } as const;

  return (
    <ExpandableRow
      label={field.label}
      value={field.value || undefined}
      placeholder="Empty"
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
    >
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 5 }}>LABEL</Text>
      <TextInput value={labelDraft} onChangeText={setLabelDraft} style={[inputStyle, { marginBottom: 10 }]} />
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 5 }}>VALUE</Text>
      <TextInput value={valueDraft} onChangeText={setValueDraft} style={[inputStyle, { marginBottom: 12 }]} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={done}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 6, backgroundColor: AMBER }}
        >
          <MaterialCommunityIcons name="check" size={13} color={CANVAS} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: CANVAS }}>Done</Text>
        </Pressable>
        <Pressable
          onPress={remove}
          style={{ width: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1, borderColor: `${BAD}66` }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={15} color={BAD} />
        </Pressable>
      </View>
    </ExpandableRow>
  );
}

/**
 * One ExpandableRow per existing custom field. `openId` is the parent's single-open-row id.
 * Never passes `isLast` - AddCustomFieldRow always follows these in the group, so these
 * always keep their own bottom border.
 */
export function CustomFieldRows({
  item,
  openId,
  onToggle,
}: {
  item: FlatItem;
  openId: string | null;
  onToggle: (rowId: string) => void;
}) {
  return (
    <>
      {item.customFields.map((field) => (
        <CustomFieldRow
          key={field.id}
          item={item}
          field={field}
          open={openId === `custom:${field.id}`}
          onToggle={() => onToggle(`custom:${field.id}`)}
        />
      ))}
    </>
  );
}

/** The "+ Add custom field" trigger row - always the last row in the group. Never autosaves:
 *  creating a brand-new row is a bigger commitment than editing one, so it needs an explicit
 *  confirm rather than saving on blur. */
export function AddCustomFieldRow({
  item,
  open,
  onToggle,
}: {
  item: FlatItem;
  open: boolean;
  onToggle: () => void;
}) {
  const { hairline: HAIRLINE, surface2: SURFACE2, ink: INK, faint: FAINT, blue: BLUE, bad: BAD } = useTheme().colors;
  const { status, error, save } = useFieldSave(item.id);
  const [labelDraft, setLabelDraft] = useState("");
  const [valueDraft, setValueDraft] = useState("");

  useEffect(() => {
    if (open) {
      setLabelDraft("");
      setValueDraft("");
    }
  }, [open]);

  function cancel() {
    setLabelDraft("");
    setValueDraft("");
    onToggle();
  }

  function confirm() {
    if (!labelDraft.trim() && !valueDraft.trim()) return;
    const next = [...item.customFields, { label: labelDraft.trim() || "Custom field", value: valueDraft.trim() }];
    void save({ custom_fields: toPayload(next as CustomField[]) }, { then: onToggle });
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: INK,
  } as const;

  if (!open) {
    return (
      <Pressable
        onPress={onToggle}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 14 }}
      >
        <MaterialCommunityIcons name="plus" size={14} color={BLUE} />
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: BLUE }}>Add custom field</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 5 }}>LABEL</Text>
      <TextInput
        value={labelDraft}
        onChangeText={setLabelDraft}
        placeholder="e.g. Batch code"
        placeholderTextColor={FAINT}
        autoFocus
        style={[inputStyle, { marginBottom: 10 }]}
      />
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 5 }}>VALUE (OPTIONAL)</Text>
      <TextInput
        value={valueDraft}
        onChangeText={setValueDraft}
        placeholder="e.g. Lot #4471"
        placeholderTextColor={FAINT}
        style={[inputStyle, { marginBottom: 12 }]}
      />
      {status === "error" && (
        <Text style={{ fontSize: 11, color: BAD, marginBottom: 8 }}>{error}</Text>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={cancel}
          style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 6, borderWidth: 1, borderColor: HAIRLINE }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: INK }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={confirm}
          disabled={status === "saving"}
          style={{ flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 6, backgroundColor: BLUE, opacity: status === "saving" ? 0.6 : 1 }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{status === "saving" ? "Adding…" : "Add field"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
