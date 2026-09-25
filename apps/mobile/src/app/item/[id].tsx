import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { daysLabel, describeError, freshColor } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useShopping } from "@/lib/shopping";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useToast } from "@/lib/toast";
import { SheetHeader } from "@/components/sheet";
import { useTheme } from "@/lib/theme";
import {
  AddCustomFieldRow,
  AutofillCard,
  BestBeforeRow,
  CaloriesRow,
  CustomFieldRows,
  HeroRow,
  NoteRow,
  QuantityRow,
  RowGroup,
  ShopLinkRow,
  StorageRow,
  WeightRow,
} from "@/components/item-detail";

export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { itemById, removeItem, undoRemoval, patchItem } = useInventory();
  const { items: shoppingItems, add: addToShopping } = useShopping();
  const { refresh: refreshScore } = useKitchenScore();
  const toast = useToast();
  const item = itemById(id);
  const {
    accent: AMBER,
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    blue: BLUE,
    good: GOOD,
    bad: BAD,
    onAccent: CANVAS,
  } = useTheme().colors;

  const [busy, setBusy] = useState(false);
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState("");
  // One row open at a time across the whole screen - "storage" | "best-before" | "note" |
  // "shop-link" | "weight" | "calories" | `custom:${id}` | "add-custom" | null.
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggleRow = (key: string) => setOpenRow((r) => (r === key ? null : key));

  const onShoppingList = useMemo(
    () =>
      !!item &&
      shoppingItems.some(
        (s) => !s.checked && s.name.toLowerCase() === item.name.toLowerCase(),
      ),
    [shoppingItems, item],
  );

  if (!item) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">
          This item is no longer in your fridge.
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="font-semibold text-accent">Close</Text>
        </Pressable>
      </View>
    );
  }

  const fresh = freshColor(item.freshness);

  const tip =
    item.freshness < 30
      ? `Use ${item.name.toLowerCase()} today for best quality.`
      : item.freshness < 60
        ? `Plan to use ${item.name.toLowerCase()} within the next couple of days.`
        : `${item.name} is holding up well — no action needed.`;

  async function remove() {
    const snap = item!;
    setBusy(true);
    try {
      const result = await removeItem(snap.id);
      refreshScore();
      router.back();
      const label = result.outcome === "entry_mistake" ? "Removed" :
        result.outcome === "used" ? "Counted as used" : "Counted as thrown out";
      const corrected = result.outcome === "used" ? "wasted" : "used";
      toast.show(`${label} · ${snap.name}`, {
        actionLabel: "Undo",
        onAction: () => {
          void undoRemoval(result.id).then(refreshScore).catch((e) =>
            Alert.alert("Couldn't undo", describeError(e, "Please try again.")));
        },
        ...(result.outcome !== "entry_mistake" ? {
          secondaryActionLabel: result.outcome === "used" ? "Thrown out" : "Used it",
          onSecondaryAction: () => {
            void api.correctItemOutcome(result.id, corrected).then(() => {
              refreshScore();
              toast.show(corrected === "used" ? "Counted as used" : "Counted as thrown out", {
                actionLabel: "Undo",
                onAction: () => { void undoRemoval(result.id).then(refreshScore); },
              });
            }).catch((e) => Alert.alert("Couldn't change outcome", describeError(e, "Please try again.")));
          },
        } : {}),
      });
    } catch (e) {
      setBusy(false);
      Alert.alert("Error", describeError(e, "Couldn't update that item."));
    }
  }

  async function markOpened() {
    if (item!.opened) return;
    setBusy(true);
    try {
      await patchItem(item!.id, { opened: true });
      refreshScore();
      toast.show(`${item!.name} marked opened`);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't update that."));
    } finally {
      setBusy(false);
    }
  }

  async function saveOpeningDays() {
    const days = Number(openingInput);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      Alert.alert("Choose a number of days", "Enter a whole number from 1 to 365.");
      return;
    }
    setBusy(true);
    try {
      await patchItem(item!.id, { opened_shelf_life_days: days });
      refreshScore();
      setEditingOpening(false);
      toast.show(`Opening duration set to ${days} days`);
    } catch (e) {
      Alert.alert("Couldn't save opening duration", describeError(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function markSealed() {
    setBusy(true);
    try {
      await patchItem(item!.id, { opened: false });
      refreshScore();
      setEditingOpening(false);
      toast.show(`${item!.name} marked sealed again`);
    } catch (e) {
      Alert.alert("Couldn't mark sealed", describeError(e, "Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader title="Item" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 6,
          paddingBottom: 36,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <HeroRow item={item} />

        <View
          style={{
            backgroundColor: SURFACE2,
            borderRadius: 8,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: INK }}>
              Freshness
            </Text>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: fresh }}>
              {item.freshness}%
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: HAIRLINE,
              overflow: "hidden",
              marginBottom: 10,
            }}
          >
            <View
              style={{
                height: "100%",
                borderRadius: 3,
                width: `${Math.max(3, item.freshness)}%`,
                backgroundColor: fresh,
              }}
            />
          </View>
          <Text style={{ fontSize: 12.5, color: MUTED }}>
            {daysLabel(item.days)}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: SURFACE2,
            borderRadius: 6,
            paddingVertical: 10,
            paddingHorizontal: 14,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: INK }}>
            {tip}
          </Text>
        </View>

        <AutofillCard item={item} />

        <View style={{ marginBottom: 20 }}>
          <RowGroup>
            <StorageRow item={item} open={openRow === "storage"} onToggle={() => toggleRow("storage")} />
            <BestBeforeRow item={item} open={openRow === "best-before"} onToggle={() => toggleRow("best-before")} />
            <NoteRow item={item} open={openRow === "note"} onToggle={() => toggleRow("note")} />
            <ShopLinkRow item={item} open={openRow === "shop-link"} onToggle={() => toggleRow("shop-link")} />
            <WeightRow item={item} open={openRow === "weight"} onToggle={() => toggleRow("weight")} />
            <CaloriesRow item={item} open={openRow === "calories"} onToggle={() => toggleRow("calories")} />
            <QuantityRow item={item} />
            <CustomFieldRows item={item} openId={openRow} onToggle={toggleRow} />
            <AddCustomFieldRow item={item} open={openRow === "add-custom"} onToggle={() => toggleRow("add-custom")} />
          </RowGroup>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          <Pressable
            onPress={() =>
              !onShoppingList && addToShopping(item.name, item.shopUrl)
            }
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 11,
              borderRadius: 6,
              backgroundColor: SURFACE2,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <MaterialCommunityIcons
              name={onShoppingList ? "check" : "cart-outline"}
              size={14}
              color={onShoppingList ? GOOD : BLUE}
            />
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: onShoppingList ? GOOD : BLUE,
              }}
            >
              {onShoppingList
                ? "On your shopping list"
                : "Add to shopping list"}
            </Text>
          </Pressable>
        </View>

        {item.openable !== false && (
          <View style={{ marginBottom: 10, borderRadius: 6, backgroundColor: SURFACE2, borderWidth: 1, borderColor: HAIRLINE }}>
            {!item.opened ? (
              <Pressable onPress={markOpened} disabled={busy} style={{ alignItems: "center", paddingVertical: 11 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: BLUE }}>Opened it</Text>
              </Pressable>
            ) : (
              <View style={{ padding: 11, gap: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: INK }}>
                  Opened · ~{item.openedShelfLifeDays ?? 3} days {item.openedShelfLifeSource === "user" ? "(you set)" : "(estimated)"}
                </Text>
                {editingOpening ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <TextInput
                      value={openingInput}
                      onChangeText={setOpeningInput}
                      keyboardType="number-pad"
                      accessibilityLabel="Days after opening"
                      style={{ flex: 1, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, color: INK }}
                    />
                    <Pressable onPress={saveOpeningDays} disabled={busy}><Text style={{ color: BLUE, fontWeight: "700" }}>Save</Text></Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => { setOpeningInput(String(item.openedShelfLifeDays ?? 3)); setEditingOpening(true); }} disabled={busy}>
                    <Text style={{ color: BLUE, fontSize: 12, fontWeight: "700" }}>Edit days</Text>
                  </Pressable>
                )}
                <Pressable onPress={markSealed} disabled={busy}>
                  <Text style={{ color: FAINT, fontSize: 12, fontWeight: "700" }}>Mark as sealed again</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={remove}
            disabled={busy}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 13,
              borderRadius: 6,
              backgroundColor: AMBER,
            }}
          >
            <Text
              style={{
                fontSize: 13.5,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: CANVAS,
              }}
            >
              Remove
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
