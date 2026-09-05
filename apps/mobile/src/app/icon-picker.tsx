import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { FOOD_ICON_KEYS, ICON_LABELS, describeError, type GeneratedIcon } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { FoodIcon } from "@/components/food-icon";
import { SheetHeader } from "@/components/sheet";

const ACCENT = "#26c6da";
const PURPLE = "#7a5cc9";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";
const MUTED = "rgba(234,234,236,0.58)";

const CURATED = FOOD_ICON_KEYS;

/**
 * Icon picker for an inventory item — curated pixel grid + AI generation + the user's saved
 * library. Ports apps/web's icon-picker dropdown (GenerateIconRow + GeneratedIconLibrary +
 * curated set). Applies the choice straight to the item and pops back.
 */
export default function IconPicker() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const { itemById, patchItem } = useInventory();
  const item = itemById(itemId);

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [library, setLibrary] = useState<GeneratedIcon[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.listGeneratedIcons().then(setLibrary).catch(() => {});
  }, []);

  async function apply(icon: string, iconUrl: string | null) {
    if (applying) return;
    setApplying(true);
    try {
      await patchItem(itemId, { icon, icon_url: iconUrl });
      router.back();
    } catch (e) {
      setApplying(false);
      Alert.alert("Error", describeError(e, "Couldn't set that icon."));
    }
  }

  async function generate() {
    if (generating || !prompt.trim()) return;
    setGenerating(true);
    try {
      const res = await api.generateIcon(prompt.trim());
      setPrompt("");
      api.listGeneratedIcons().then(setLibrary).catch(() => {});
      await apply("generic", res.icon_url);
    } catch (e) {
      setGenerating(false);
      Alert.alert("Error", describeError(e, "Couldn't generate that icon."));
    }
  }

  async function removeFromLibrary(id: string) {
    setLibrary((l) => l.filter((g) => g.id !== id));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    api.deleteGeneratedIcon(id).catch(() => {});
  }

  if (!item) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-muted">That item is gone.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <SheetHeader title="Choose an icon" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40, gap: 18 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe an icon…"
            placeholderTextColor={FAINT}
            editable={!generating}
            onSubmitEditing={generate}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: HAIRLINE,
              backgroundColor: SURFACE2,
              borderRadius: 6,
              paddingHorizontal: 10,
              paddingVertical: 9,
              fontSize: 13,
              color: INK,
            }}
          />
          <Pressable
            onPress={generate}
            disabled={generating || !prompt.trim()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: `${PURPLE}26`,
              opacity: generating || !prompt.trim() ? 0.5 : 1,
            }}
          >
            {generating ? (
              <ActivityIndicator color={PURPLE} size="small" />
            ) : (
              <MaterialCommunityIcons name="auto-fix" size={14} color={PURPLE} />
            )}
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: PURPLE }}>
              {generating ? "…" : "Generate"}
            </Text>
          </Pressable>
        </View>

        {library.length > 0 && (
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
              YOUR GENERATED ICONS
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {library.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => apply("generic", g.image_url)}
                  onLongPress={() => removeFromLibrary(g.id)}
                  style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: SURFACE2, alignItems: "center", justifyContent: "center" }}
                >
                  <FoodIcon iconUrl={g.image_url} name={item.name} size={44} />
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>Long-press to remove.</Text>
          </View>
        )}

        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
            ICON PACK
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CURATED.map((key) => {
              const selected = !item.iconUrl && item.icon === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => apply(key, null)}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 8,
                    backgroundColor: SURFACE2,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: selected ? 1.5 : 0,
                    borderColor: ACCENT,
                  }}
                >
                  <FoodIcon icon={key} name={ICON_LABELS[key] ?? key} size={44} />
                </Pressable>
              );
            })}
          </View>
        </View>

        {applying && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center" }}>
            <ActivityIndicator color={MUTED} size="small" />
            <Text style={{ fontSize: 12, color: MUTED }}>Applying…</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
