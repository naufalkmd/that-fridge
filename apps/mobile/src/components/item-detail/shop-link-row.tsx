import { useEffect, useState } from "react";
import { Linking, Pressable, TextInput } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { normalizeShopUrl, type FlatItem } from "@thatfridge/core";

import { useTheme } from "@/lib/theme";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

export function ShopLinkRow({
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
  const { hairline: HAIRLINE, surface2: SURFACE2, ink: INK, faint: FAINT, blue: BLUE } = useTheme().colors;
  const { status, error, save, retry } = useFieldSave(item.id);
  const [draft, setDraft] = useState(item.shopUrl ?? "");

  useEffect(() => {
    if (open) setDraft(item.shopUrl ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit() {
    const next = normalizeShopUrl(draft);
    if (next === item.shopUrl) return;
    void save({ shop_url: next });
  }

  return (
    <ExpandableRow
      label="Shop link"
      value={item.shopUrl ?? undefined}
      placeholder="Add a link"
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
      headerAction={
        item.shopUrl ? (
          <Pressable
            onPress={() => Linking.openURL(item.shopUrl!)}
            hitSlop={8}
            style={{ width: 40, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: HAIRLINE }}
          >
            <Ionicons name="open-outline" size={15} color={BLUE} />
          </Pressable>
        ) : undefined
      }
    >
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        placeholder="https://…"
        placeholderTextColor={FAINT}
        autoCapitalize="none"
        keyboardType="url"
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
