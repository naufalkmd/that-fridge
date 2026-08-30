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
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { SheetHeader } from "@/components/sheet";

const ACCENT = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";

export default function Fridges() {
  const router = useRouter();
  const { fridges, refresh } = useInventory();
  const { scope, setScope } = useScope();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    const n = name.trim();
    if (!n || adding) return;
    setAdding(true);
    try {
      const fridge = await api.createFridge(n);
      setName("");
      await refresh();
      setScope(fridge.id);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't add that fridge."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <SheetHeader title="Your fridges" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: 40,
          gap: 22,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE,
            overflow: "hidden",
          }}
        >
          {fridges.map((f, i) => {
            const count = f.sections.reduce(
              (s, sec) => s + sec.items.length,
              0,
            );
            const active = scope === f.id;
            return (
              <View
                key={f.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderBottomWidth: i === fridges.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <Pressable
                  onPress={() => {
                    setScope(f.id);
                    router.navigate("/inventory");
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: active ? BLUE : INK,
                    }}
                  >
                    {f.name}
                  </Text>
                  <Text
                    style={{ marginRight: 12, fontSize: 11.5, color: FAINT }}
                  >
                    {count} items
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/fridge/${f.id}`)}
                  hitSlop={10}
                >
                  <Ionicons name="settings-outline" size={16} color={FAINT} />
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 0.3,
              color: FAINT,
            }}
          >
            ADD A FRIDGE
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={add}
              placeholder="e.g. Garage, Office…"
              placeholderTextColor={FAINT}
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
              disabled={!name.trim() || adding}
              style={{
                justifyContent: "center",
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: ACCENT,
                opacity: !name.trim() || adding ? 0.5 : 1,
              }}
            >
              {adding ? (
                <ActivityIndicator color="#0a0a0c" />
              ) : (
                <Ionicons name="add" size={20} color="#0a0a0c" />
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
