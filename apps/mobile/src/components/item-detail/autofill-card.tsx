import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ApiError,
  daysLabel,
  describeError,
  NUTRITION_CATEGORIES,
  type FlatItem,
  type UpdateItemInput,
} from "@thatfridge/core";

import { api } from "@/lib/api";
import { customFieldProposals, sourceLabel, type CustomFieldSource } from "@/lib/autofillPreview";
import { useInventory } from "@/lib/inventory";
import { useTheme } from "@/lib/theme";

// Same AI identity color used everywhere else in the app (icon generation, calorie estimate).
const AUTOFILL = "#7a5cc9";

// weight_unit/expiry_date ride along with weight/shelf_life_days but don't get their own line.
const DISPLAY_KEYS = ["weight", "calories", "shelf_life_days", "nutrition_category"] as const;

function fieldLabel(key: string, fields: Partial<UpdateItemInput>): string {
  switch (key) {
    case "weight":
      return `Weight: ${fields.weight} ${fields.weight_unit}`;
    case "calories":
      return `Calories: ${fields.calories} kcal`;
    case "shelf_life_days":
      return `Best before: ${daysLabel(fields.shelf_life_days ?? 0)}`;
    case "nutrition_category": {
      const label = NUTRITION_CATEGORIES.find((c) => c.key === fields.nutrition_category)?.label;
      return `Food group: ${label ?? fields.nutrition_category}`;
    }
    default:
      return key;
  }
}

/**
 * The item detail page's "Autofill" button - one credit-metered call that estimates
 * whichever of weight/calories/best-before/food group this item is still missing - plus any
 * custom field left empty (like "Protein"), settled from the user's own other items, the
 * built-in nutrient table or the AI, in that order (CustomFieldAutofill on the server) - then
 * requires an explicit "Use these" before writing anything. Never proposes a field the item
 * already has a value for (enforced server-side, not just here) - autofill fills blanks, it
 * doesn't overwrite what's already there.
 */
export function AutofillCard({ item }: { item: FlatItem }) {
  const router = useRouter();
  const { patchItem } = useInventory();
  const { ink: INK, faint: FAINT } = useTheme().colors;
  const [step, setStep] = useState<"idle" | "loading" | "result">("idle");
  const [fields, setFields] = useState<Partial<UpdateItemInput> | null>(null);
  const [sources, setSources] = useState<Record<string, CustomFieldSource> | undefined>(undefined);
  const [applying, setApplying] = useState(false);

  function notifyOutOfCredits() {
    Alert.alert(
      "Out of AI credits",
      "Autofill needs an AI credit. Top up to keep using it.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Get credits", onPress: () => router.push("/credits") },
      ],
    );
  }

  async function run() {
    setStep("loading");
    try {
      const result = await api.autofillItem(item.id);
      if (Object.keys(result.fields).length === 0) {
        setStep("idle");
        Alert.alert(
          "Nothing to fill in",
          result.message ?? "Every field on this item already has a value.",
        );
        return;
      }
      setFields(result.fields);
      setSources(result.custom_sources);
      setStep("result");
    } catch (e) {
      setStep("idle");
      if (e instanceof ApiError && e.status === 402) {
        notifyOutOfCredits();
        return;
      }
      Alert.alert("Error", describeError(e, "Couldn't estimate those details."));
    }
  }

  async function apply() {
    if (!fields) return;
    setApplying(true);
    try {
      await patchItem(item.id, fields);
      setStep("idle");
      setFields(null);
      setSources(undefined);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't save those details."));
    } finally {
      setApplying(false);
    }
  }

  function dismiss() {
    setStep("idle");
    setFields(null);
    setSources(undefined);
  }

  if (step === "idle") {
    return (
      <Pressable
        onPress={run}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 12,
          borderRadius: 8,
          marginBottom: 14,
          backgroundColor: `${AUTOFILL}1f`,
          borderWidth: 1,
          borderColor: `${AUTOFILL}4d`,
        }}
      >
        <MaterialCommunityIcons name="auto-fix" size={15} color={AUTOFILL} />
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: AUTOFILL }}>
          Autofill missing details
        </Text>
      </Pressable>
    );
  }

  if (step === "loading") {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingVertical: 14,
          borderRadius: 8,
          marginBottom: 14,
          backgroundColor: `${AUTOFILL}14`,
        }}
      >
        <ActivityIndicator size="small" color={AUTOFILL} />
        <Text style={{ fontSize: 12.5, fontWeight: "600", color: AUTOFILL }}>
          Estimating…
        </Text>
      </View>
    );
  }

  const visibleKeys = DISPLAY_KEYS.filter((k) => fields && k in fields);
  const customRows = customFieldProposals(item.customFields, fields?.custom_fields, sources);

  return (
    <View
      style={{
        padding: 14,
        borderRadius: 8,
        marginBottom: 14,
        backgroundColor: `${AUTOFILL}1a`,
        borderWidth: 1,
        borderColor: `${AUTOFILL}4d`,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <MaterialCommunityIcons name="auto-fix" size={12} color={AUTOFILL} />
        <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: AUTOFILL }}>
          SUGGESTED DETAILS
        </Text>
      </View>
      {visibleKeys.map((k) => (
        <Text key={k} style={{ fontSize: 13, color: INK, marginBottom: 4 }}>
          {fieldLabel(k, fields ?? {})}
        </Text>
      ))}
      {customRows.map((c) => (
        <View key={c.label} style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 13, color: INK }}>
            {c.label}: {c.value}
          </Text>
          {sourceLabel(c.source) && <Text style={{ fontSize: 11, color: FAINT }}>{sourceLabel(c.source)}</Text>}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Pressable
          onPress={apply}
          disabled={applying}
          style={{
            flex: 1,
            alignItems: "center",
            paddingVertical: 9,
            borderRadius: 6,
            backgroundColor: AUTOFILL,
          }}
        >
          {applying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: "#fff" }}>Use these</Text>
          )}
        </Pressable>
        <Pressable
          onPress={dismiss}
          disabled={applying}
          style={{
            flex: 1,
            alignItems: "center",
            paddingVertical: 9,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: `${AUTOFILL}66`,
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: AUTOFILL }}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}
