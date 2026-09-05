import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { describeError } from "@thatfridge/core";
import { useCategories } from "@/lib/categories";
import { SheetHeader } from "@/components/sheet";

const ACCENT = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BAD = "#ff5567";

export default function Categories() {
  const { categories, loading, create, rename, remove } = useCategories();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );

  async function add() {
    const n = newName.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await create(n);
      setNewName("");
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't add that category."));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const n = editing.name.trim();
    if (!n) return setEditing(null);
    try {
      await rename(editing.id, n);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't rename that category."));
    } finally {
      setEditing(null);
    }
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(
      "Delete category",
      `"${name}" — items in it become Uncategorized. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            remove(id);
          },
        },
      ],
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <SheetHeader title="Categories" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 40,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 12.5, color: MUTED, lineHeight: 18 }}>
          Your own labels for the Inventory filter bar. Assign items to them by
          long-pressing rows in Inventory. Separate from the food-group tag on
          each item.
        </Text>

        {loading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 20 }} />
        ) : categories.length === 0 ? (
          <Text
            style={{
              fontSize: 13,
              color: FAINT,
              textAlign: "center",
              marginVertical: 12,
            }}
          >
            No categories yet — add one below.
          </Text>
        ) : (
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: HAIRLINE,
              backgroundColor: SURFACE,
              overflow: "hidden",
            }}
          >
            {categories.map((c, i) => (
              <View
                key={c.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderBottomWidth: i === categories.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                {editing?.id === c.id ? (
                  <TextInput
                    value={editing.name}
                    onChangeText={(t) => setEditing({ id: c.id, name: t })}
                    onSubmitEditing={saveEdit}
                    onBlur={saveEdit}
                    autoFocus
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: "600",
                      color: INK,
                      paddingVertical: 2,
                    }}
                  />
                ) : (
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => setEditing({ id: c.id, name: c.name })}
                  >
                    <Text
                      style={{ fontSize: 14, fontWeight: "600", color: INK }}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                )}
                {editing?.id === c.id ? (
                  <Pressable onPress={saveEdit} hitSlop={8}>
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color={ACCENT}
                    />
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      onPress={() => setEditing({ id: c.id, name: c.name })}
                      hitSlop={8}
                    >
                      <MaterialCommunityIcons
                        name="pencil-outline"
                        size={16}
                        color={FAINT}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(c.id, c.name)}
                      hitSlop={8}
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={16}
                        color={BAD}
                      />
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={add}
            placeholder="New category…"
            placeholderTextColor={FAINT}
            maxLength={40}
            style={{
              flex: 1,
              backgroundColor: SURFACE2,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: HAIRLINE,
              paddingVertical: 12,
              paddingHorizontal: 14,
              fontSize: 14,
              color: INK,
            }}
          />
          <Pressable
            onPress={add}
            disabled={!newName.trim() || busy}
            style={{
              justifyContent: "center",
              paddingHorizontal: 16,
              borderRadius: 8,
              backgroundColor: ACCENT,
              opacity: !newName.trim() || busy ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#0a0a0c" />
            ) : (
              <Ionicons name="add" size={20} color="#0a0a0c" />
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
