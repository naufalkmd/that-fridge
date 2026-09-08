import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  FOOD_ICON_KEYS,
  ICON_LABELS,
  describeError,
  type GeneratedIcon,
  type SharedIcon,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { stashRecipeIconPick } from "@/lib/recipes";
import { FoodIcon } from "@/components/food-icon";
import { SheetHeader } from "@/components/sheet";

const ACCENT = "#26c6da";
const PURPLE = "#7a5cc9";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const FAINT = "rgba(234,234,236,0.34)";

/**
 * Icon picker for a recipe's own thumbnail — curated pixel grid + AI generation (kind
 * "recipe", shares the weekly generation budget with item icons) + the user's saved
 * library. Doesn't touch the recipe itself: it stashes the choice and pops back to the
 * recipe form, which applies it on Save. Mirrors icon-picker.tsx (items).
 */
export default function RecipeIconPicker() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    name?: string;
    icon?: string;
    iconUrl?: string;
  }>();
  const recipeName = params.name || "Recipe";
  const currentIcon = params.icon || null;
  const currentIconUrl = params.iconUrl || null;

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [library, setLibrary] = useState<GeneratedIcon[]>([]);
  const [shared, setShared] = useState<SharedIcon[]>([]);

  useEffect(() => {
    api.listGeneratedIcons().then(setLibrary).catch(() => {});
    api.listSharedIcons().then(setShared).catch(() => {});
  }, []);

  function pick(icon: string | null, iconUrl: string | null) {
    stashRecipeIconPick({ icon, iconUrl });
    void Haptics.selectionAsync();
    router.back();
  }

  async function generate() {
    if (generating || !prompt.trim()) return;
    setGenerating(true);
    try {
      const res = await api.generateIcon(prompt.trim(), "recipe");
      pick(null, res.icon_url);
    } catch (e) {
      setGenerating(false);
      Alert.alert("Error", describeError(e, "Couldn't generate that image."));
    }
  }

  async function removeFromLibrary(id: string) {
    setLibrary((l) => l.filter((g) => g.id !== id));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    api.deleteGeneratedIcon(id).catch(() => {});
  }

  const usingDefault = !currentIcon && !currentIconUrl;

  return (
    <View className="flex-1 bg-canvas">
      <SheetHeader title="Recipe icon" />
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
        <Text style={{ fontSize: 10.5, color: FAINT, marginTop: -10 }}>
          AI generations share your weekly free image budget with item icons.
        </Text>

        <Pressable
          onPress={() => pick(null, null)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            padding: 10,
            borderRadius: 8,
            backgroundColor: SURFACE2,
            borderWidth: usingDefault ? 1.5 : 0,
            borderColor: ACCENT,
          }}
        >
          <FoodIcon icon={null} name={recipeName} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: INK }}>Auto (from ingredients)</Text>
            <Text style={{ fontSize: 10.5, color: FAINT }}>Guess an icon from the recipe’s first ingredient.</Text>
          </View>
        </Pressable>

        {library.length > 0 && (
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
              YOUR GENERATED IMAGES
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {library.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => pick(null, g.image_url)}
                  onLongPress={() => removeFromLibrary(g.id)}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 8,
                    backgroundColor: SURFACE2,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: currentIconUrl === g.image_url ? 1.5 : 0,
                    borderColor: ACCENT,
                  }}
                >
                  <FoodIcon iconUrl={g.image_url} name={recipeName} size={44} />
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 6 }}>Long-press to remove.</Text>
          </View>
        )}

        {shared.length > 0 && (
          <View>
            <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
              MORE ICONS
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {shared.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => pick(null, s.image_url)}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 8,
                    backgroundColor: SURFACE2,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: currentIconUrl === s.image_url ? 1.5 : 0,
                    borderColor: ACCENT,
                  }}
                >
                  <FoodIcon iconUrl={s.image_url} name={s.label ?? recipeName} size={44} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
            ICON PACK
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {FOOD_ICON_KEYS.map((key) => (
              <Pressable
                key={key}
                onPress={() => pick(key, null)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 8,
                  backgroundColor: SURFACE2,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: !currentIconUrl && currentIcon === key ? 1.5 : 0,
                  borderColor: ACCENT,
                }}
              >
                <FoodIcon icon={key} name={ICON_LABELS[key] ?? key} size={44} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
