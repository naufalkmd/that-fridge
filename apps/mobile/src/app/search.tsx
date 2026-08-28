import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { daysLabel, freshColor } from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { FoodIcon } from "@/components/food-icon";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";

const SUGGESTIONS = ["Dairy", "Produce", "Leftovers", "Meat"];

export default function Search() {
  const router = useRouter();
  const { items } = useInventory();
  const { scope } = useScope();
  const [query, setQuery] = useState("");

  const showFridge = scope === "all";
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [];
    return scopeItems(items, scope).filter(
      (i) => i.name.toLowerCase().includes(q) || i.sectionName.toLowerCase().includes(q),
    );
  }, [items, scope, q]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={INK} />
        </Pressable>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search your fridge…"
          placeholderTextColor={FAINT}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE,
            borderRadius: 6,
            paddingVertical: 11,
            paddingHorizontal: 16,
            fontSize: 14,
            color: INK,
          }}
        />
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
        <FridgeScopePicker small />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {q.length === 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {SUGGESTIONS.map((label) => (
              <Pressable
                key={label}
                onPress={() => setQuery(label)}
                style={{
                  backgroundColor: SURFACE,
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  borderRadius: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 13,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: INK }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {results.length > 0 && (
          <View
            style={{
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {results.map((item, i) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/item/${item.id}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderBottomWidth: i === results.length - 1 ? 0 : 1,
                  borderBottomColor: HAIRLINE,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 6,
                    backgroundColor: SURFACE2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FoodIcon icon={item.icon} iconUrl={item.iconUrl} name={item.name} size={30} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: INK }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: FAINT }} numberOfLines={1}>
                    {item.sectionName}
                    {showFridge ? ` · ${item.fridgeName}` : ""}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: freshColor(item.freshness) }}>
                  {daysLabel(item.days)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {q.length > 0 && results.length === 0 && (
          <Text style={{ textAlign: "center", color: FAINT, fontSize: 13, marginTop: 30 }}>
            No items match “{query}”
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
