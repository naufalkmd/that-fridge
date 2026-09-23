import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { FlatItem } from "@thatfridge/core";

import { useInventory } from "@/lib/inventory";
import { useTheme } from "@/lib/theme";

function Step({ icon, onPress }: { icon: "minus" | "plus"; onPress: () => void }) {
  const { surface2: SURFACE2, ink: INK } = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ height: 26, width: 26, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: SURFACE2 }}
    >
      <MaterialCommunityIcons name={icon} size={13} color={INK} />
    </Pressable>
  );
}

/**
 * Doesn't expand like the other rows - already low-friction (tap the number to type an
 * exact value) and stays on setItemQty (optimistic), not patchItem, unlike everything else
 * on this screen.
 */
export function QuantityRow({ item, isLast }: { item: FlatItem; isLast?: boolean }) {
  const { setItemQty } = useInventory();
  const { hairline: HAIRLINE, ink: INK, muted: MUTED } = useTheme().colors;
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState("");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: HAIRLINE,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: "600", color: MUTED }}>Quantity</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Step icon="minus" onPress={() => setItemQty(item.id, item.qty - 1)} />
        {editingQty ? (
          <TextInput
            value={qtyDraft}
            onChangeText={setQtyDraft}
            onBlur={() => {
              setEditingQty(false);
              const n = parseInt(qtyDraft, 10);
              if (Number.isFinite(n) && n >= 1 && n !== item.qty) setItemQty(item.id, n);
            }}
            keyboardType="number-pad"
            selectTextOnFocus
            autoFocus
            returnKeyType="done"
            style={{ width: 30, textAlign: "center", fontSize: 14, fontWeight: "700", color: INK, padding: 0 }}
          />
        ) : (
          <Pressable
            onPress={() => {
              setQtyDraft(String(item.qty));
              setEditingQty(true);
            }}
            hitSlop={6}
          >
            <Text style={{ minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: "700", color: INK }}>{item.qty}</Text>
          </Pressable>
        )}
        <Step icon="plus" onPress={() => setItemQty(item.id, item.qty + 1)} />
      </View>
    </View>
  );
}
