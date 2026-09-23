import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { FlatItem } from "@thatfridge/core";

import { FoodIcon } from "@/components/food-icon";
import { CategoryTag } from "@/components/tags";
import { useTheme } from "@/lib/theme";
import { useFieldSave } from "./use-field-save";

/**
 * Icon + name + category tag + fridge name. Name isn't in the accordion row list the redesign
 * was approved against, but it's editable today (via the old edit form) - dropping that would
 * be a silent regression, so it's made tappable-to-rename here instead of getting its own row.
 */
export function HeroRow({ item }: { item: FlatItem }) {
  const router = useRouter();
  const { accent: AMBER, surface2: SURFACE2, hairline: HAIRLINE, ink: INK, faint: FAINT, onAccent: CANVAS } =
    useTheme().colors;
  const { status, save } = useFieldSave(item.id);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);

  useEffect(() => {
    if (editingName) setNameDraft(item.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingName]);

  function commitName() {
    setEditingName(false);
    const next = nameDraft.trim();
    if (next && next !== item.name) void save({ name: next });
  }

  return (
    <View style={{ alignItems: "center", marginBottom: 14 }}>
      <View style={{ width: 88, height: 88, borderRadius: 10, backgroundColor: SURFACE2, alignItems: "center", justifyContent: "center" }}>
        <FoodIcon icon={item.icon} iconUrl={item.iconUrl} name={item.name} size={52} />
      </View>
      <Pressable
        onPress={() => router.push({ pathname: "/icon-picker", params: { itemId: item.id } })}
        style={{
          position: "absolute",
          top: -4,
          right: "50%",
          marginRight: -60,
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: AMBER,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons name="pencil" size={14} color={CANVAS} />
      </Pressable>

      <View style={{ marginTop: 12, alignItems: "center" }}>
        {editingName ? (
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={commitName}
            onSubmitEditing={commitName}
            returnKeyType="done"
            autoFocus
            selectTextOnFocus
            style={{
              minWidth: 160,
              textAlign: "center",
              fontSize: 20,
              fontWeight: "700",
              color: INK,
              borderBottomWidth: 1,
              borderBottomColor: AMBER,
              paddingVertical: 2,
            }}
          />
        ) : (
          <Pressable
            onPress={() => setEditingName(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Text style={{ fontSize: 20, fontWeight: "700", color: INK, textAlign: "center" }}>{item.name}</Text>
            {status !== "saving" && <MaterialCommunityIcons name="pencil-outline" size={13} color={FAINT} />}
            <CategoryTag category={item.nutritionCategory} />
          </Pressable>
        )}
      </View>
      <Text style={{ textAlign: "center", fontSize: 12.5, color: FAINT, marginTop: 2 }}>{item.fridgeName}</Text>
    </View>
  );
}
