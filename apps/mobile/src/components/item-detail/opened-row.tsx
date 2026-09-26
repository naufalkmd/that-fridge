import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { describeError, type FlatItem } from "@thatfridge/core";

import { useInventory } from "@/lib/inventory";
import { useKitchenScore } from "@/lib/kitchenScore";
import { openedSummary } from "@/lib/itemDetails";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { ExpandableRow } from "./expandable-row";

/**
 * Sealed or opened, in the same list as the other storage details (it used to be a loose box near the bottom of the
 * page). Opening an item starts its shorter opened shelf life; the days can be adjusted, and it can be marked sealed again.
 */
export function OpenedRow({ item, open, onToggle, isLast }: { item: FlatItem; open: boolean; onToggle: () => void; isLast?: boolean }) {
  const { patchItem } = useInventory();
  const { refresh: refreshScore } = useKitchenScore();
  const toast = useToast();
  const { accent: AMBER, onAccent: CANVAS, hairline: HAIRLINE, surface2: SURFACE2, ink: INK, muted: MUTED, faint: FAINT } = useTheme().colors;
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(String(item.openedShelfLifeDays ?? 3));

  async function change(patch: { opened?: boolean; opened_shelf_life_days?: number }, message: string, failure: string) {
    setBusy(true);
    try {
      await patchItem(item.id, patch);
      refreshScore();
      toast.show(message);
    } catch (e) {
      Alert.alert(failure, describeError(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function saveDays() {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      Alert.alert("Choose a number of days", "Enter a whole number from 1 to 365.");
      return;
    }
    void change({ opened_shelf_life_days: n }, `Opening duration set to ${n} days`, "Couldn't save opening duration");
  }

  return (
    <ExpandableRow label="Opened" value={openedSummary(item)} open={open} onToggle={onToggle} isLast={isLast}>
      {!item.opened ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, lineHeight: 17, color: MUTED }}>
            Once it&apos;s opened it keeps for a shorter time. Mark it so the reminders stay accurate.
          </Text>
          <Pressable
            onPress={() => void change({ opened: true }, `${item.name} marked opened`, "Couldn't update that")}
            disabled={busy}
            accessibilityRole="button"
            style={{ height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: AMBER, opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "800", color: CANVAS }}>Mark as opened</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 12, color: MUTED }}>
            Keeps for about {item.openedShelfLifeDays ?? 3} days after opening {item.openedShelfLifeSource === "user" ? "(set by you)" : "(estimated)"}.
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TextInput
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              accessibilityLabel="Days after opening"
              style={{ width: 72, height: 42, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE2, borderRadius: 8, paddingHorizontal: 12, color: INK, fontSize: 14 }}
            />
            <Text style={{ flex: 1, fontSize: 13, color: INK }}>days</Text>
            <Pressable
              onPress={saveDays}
              disabled={busy}
              accessibilityRole="button"
              style={{ height: 42, paddingHorizontal: 18, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: AMBER, opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: "800", color: CANVAS }}>Save</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => void change({ opened: false }, `${item.name} marked sealed again`, "Couldn't mark sealed")}
            disabled={busy}
            accessibilityRole="button"
            hitSlop={8}
            style={{ alignSelf: "flex-start", paddingVertical: 4 }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: FAINT }}>Mark as sealed again</Text>
          </Pressable>
        </View>
      )}
    </ExpandableRow>
  );
}
