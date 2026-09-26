import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useShopping } from "@/lib/shopping";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useToast } from "@/lib/toast";
import { SheetHeader } from "@/components/sheet";
import { hasMissingDetails } from "@/lib/itemDetails";
import { useTheme } from "@/lib/theme";
import {
  AddCustomFieldRow,
  AutofillCard,
  BestBeforeRow,
  CaloriesRow,
  CustomFieldRows,
  DetailSection,
  HeroRow,
  NoteRow,
  OpenedRow,
  QuantityRow,
  ShopLinkRow,
  StatusCard,
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

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader title="Item" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <HeroRow item={item} />

        <StatusCard item={item} />

        {hasMissingDetails(item) && <AutofillCard item={item} />}

        <DetailSection title="Storage & freshness">
          <StorageRow item={item} open={openRow === "storage"} onToggle={() => toggleRow("storage")} />
          <BestBeforeRow item={item} open={openRow === "best-before"} onToggle={() => toggleRow("best-before")} isLast={item.openable === false} />
          {item.openable !== false && <OpenedRow item={item} open={openRow === "opened"} onToggle={() => toggleRow("opened")} isLast />}
        </DetailSection>

        <DetailSection title="Amount">
          <QuantityRow item={item} />
          <WeightRow item={item} open={openRow === "weight"} onToggle={() => toggleRow("weight")} />
          <CaloriesRow item={item} open={openRow === "calories"} onToggle={() => toggleRow("calories")} isLast />
        </DetailSection>

        <DetailSection title="Details">
          <NoteRow item={item} open={openRow === "note"} onToggle={() => toggleRow("note")} />
          <ShopLinkRow item={item} open={openRow === "shop-link"} onToggle={() => toggleRow("shop-link")} />
          <CustomFieldRows item={item} openId={openRow} onToggle={toggleRow} />
          <AddCustomFieldRow item={item} open={openRow === "add-custom"} onToggle={() => toggleRow("add-custom")} />
        </DetailSection>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Pressable
            onPress={() => !onShoppingList && addToShopping(item.name, item.shopUrl)}
            accessibilityRole="button"
            accessibilityLabel={onShoppingList ? "On your shopping list" : "Add to shopping list"}
            style={{
              flex: 1,
              height: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 12,
              backgroundColor: SURFACE2,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <MaterialCommunityIcons name={onShoppingList ? "check" : "cart-outline"} size={16} color={onShoppingList ? GOOD : BLUE} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: onShoppingList ? GOOD : BLUE }}>
              {onShoppingList ? "On your list" : "Add to list"}
            </Text>
          </Pressable>
          <Pressable
            onPress={remove}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Remove item"
            style={{ flex: 1, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: AMBER, opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, color: CANVAS }}>Remove</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
