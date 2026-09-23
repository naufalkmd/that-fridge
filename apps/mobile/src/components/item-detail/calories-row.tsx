import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { ApiError, describeError, type FlatItem } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

// Same AI identity color used everywhere else in the app (icon generation, add-item
// auto-fill) - reused rather than inventing a second "this is AI" visual language.
const AUTOFILL = "#7a5cc9";

type AiStep = "choose" | "estimating" | "photo-pick" | "photo-loading" | "result";

function notifyOutOfCredits(router: ReturnType<typeof useRouter>, action: string): void {
  Alert.alert("Out of AI credits", `${action} needs an AI credit. Top up to keep using it.`, [
    { text: "Not now", style: "cancel" },
    { text: "Get credits", onPress: () => router.push("/credits") },
  ]);
}

export function CaloriesRow({
  item,
  open,
  onToggle,
  isLast,
}: {
  item: FlatItem;
  open: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const router = useRouter();
  const { hairline: HAIRLINE, surface2: SURFACE2, ink: INK, faint: FAINT, muted: MUTED } = useTheme().colors;
  const { status, error, save, retry } = useFieldSave(item.id);
  const [draft, setDraft] = useState(item.calories != null ? String(item.calories) : "");

  const [aiStep, setAiStep] = useState<AiStep>("choose");
  const [resultValue, setResultValue] = useState<number | null>(null);
  const [resultLabel, setResultLabel] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(item.calories != null ? String(item.calories) : "");
      setAiStep("choose");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commitManual() {
    const trimmed = draft.trim();
    const n = trimmed ? parseInt(trimmed, 10) : null;
    if (n === (item.calories ?? null)) return;
    void save({ calories: Number.isFinite(n as number) ? n : null });
  }

  async function runEstimate() {
    setAiStep("estimating");
    try {
      const result = await api.estimateCalories(item.id);
      setResultValue(result.calories);
      setResultLabel(result.mocked ? "Rough estimate" : result.basis || "AI estimate");
      setAiStep("result");
    } catch (e) {
      setAiStep("choose");
      if (e instanceof ApiError && e.status === 402) {
        notifyOutOfCredits(router, "Estimating calories");
        return;
      }
      Alert.alert("Error", describeError(e, "Couldn't estimate calories."));
    }
  }

  async function capturePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Allow camera access to photograph the label, or type the calories in instead.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;

    setAiStep("photo-loading");
    try {
      // Expo's fetch/FormData implementation needs a real Blob, not the classic
      // { uri, name, type } object - same conversion add.tsx's photo scan uses.
      const blob = await (await fetch(res.assets[0].uri)).blob();
      const result = await api.scanNutritionLabel(item.id, blob);
      if (!result.found || result.calories == null) {
        setAiStep("choose");
        Alert.alert("Couldn't read that label", result.message ?? "Try a closer, well-lit shot, or type the calories in.");
        return;
      }
      setResultValue(result.calories);
      setResultLabel(result.serving_size ? `From your photo · ${result.serving_size}` : "From your photo");
      setAiStep("result");
    } catch (e) {
      setAiStep("choose");
      if (e instanceof ApiError && e.status === 402) {
        notifyOutOfCredits(router, "Scanning a label");
        return;
      }
      Alert.alert("Error", describeError(e, "Couldn't read that photo."));
    }
  }

  function useResult() {
    if (resultValue == null) return;
    void save({ calories: resultValue }, { then: onToggle });
  }

  const aiButtonStyle = {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 9,
    borderRadius: 7,
    backgroundColor: `${AUTOFILL}1f`,
  };

  return (
    <ExpandableRow
      label="Calories"
      value={item.calories != null ? `${item.calories} kcal` : undefined}
      placeholder="Add calories"
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
      headerAction={
        <Pressable
          onPress={() => {
            if (!open) onToggle();
            void runEstimate();
          }}
          hitSlop={8}
          style={{ width: 40, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: HAIRLINE }}
        >
          <MaterialCommunityIcons name="auto-fix" size={16} color={AUTOFILL} />
        </Pressable>
      }
    >
      {aiStep === "choose" && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Pressable onPress={runEstimate} style={aiButtonStyle}>
            <MaterialCommunityIcons name="auto-fix" size={13} color={AUTOFILL} />
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: AUTOFILL }}>Estimate with AI</Text>
          </Pressable>
          <Pressable onPress={() => setAiStep("photo-pick")} style={aiButtonStyle}>
            <MaterialCommunityIcons name="camera-outline" size={14} color={AUTOFILL} />
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: AUTOFILL }}>Scan label</Text>
          </Pressable>
        </View>
      )}

      {(aiStep === "estimating" || aiStep === "photo-loading") && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 14,
            marginBottom: 12,
            borderRadius: 7,
            backgroundColor: `${AUTOFILL}14`,
          }}
        >
          <ActivityIndicator size="small" color={AUTOFILL} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: AUTOFILL }}>
            {aiStep === "estimating" ? "Estimating…" : "Reading label…"}
          </Text>
        </View>
      )}

      {aiStep === "photo-pick" && (
        <Pressable
          onPress={capturePhoto}
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 16,
            marginBottom: 12,
            borderRadius: 7,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: `${AUTOFILL}66`,
            backgroundColor: `${AUTOFILL}0d`,
          }}
        >
          <MaterialCommunityIcons name="camera-outline" size={20} color={AUTOFILL} />
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: AUTOFILL }}>Take a photo of the nutrition label</Text>
          <Text style={{ fontSize: 10, color: FAINT }}>Tap to open camera</Text>
        </Pressable>
      )}

      {aiStep === "result" && resultValue != null && (
        <View
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 7,
            backgroundColor: `${AUTOFILL}1a`,
            borderWidth: 1,
            borderColor: `${AUTOFILL}4d`,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <MaterialCommunityIcons name="auto-fix" size={11} color={AUTOFILL} />
            <Text style={{ fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: AUTOFILL }}>
              {resultLabel.toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: INK, marginBottom: 10 }}>{resultValue} kcal</Text>
          <View style={{ flexDirection: "row", gap: 7 }}>
            <Pressable
              onPress={useResult}
              style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 6, backgroundColor: AUTOFILL }}
            >
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#fff" }}>Use this</Text>
            </Pressable>
            <Pressable
              onPress={() => setAiStep("choose")}
              style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 6, borderWidth: 1, borderColor: `${AUTOFILL}66` }}
            >
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: AUTOFILL }}>Try again</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: HAIRLINE }} />
        <Text style={{ fontSize: 9.5, fontWeight: "700", letterSpacing: 0.3, color: MUTED }}>OR ENTER MANUALLY</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: HAIRLINE }} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={commitManual}
          onSubmitEditing={commitManual}
          returnKeyType="done"
          placeholder="0"
          placeholderTextColor={FAINT}
          keyboardType="number-pad"
          style={{
            width: 72,
            borderWidth: 1,
            borderColor: HAIRLINE,
            backgroundColor: SURFACE2,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            fontSize: 13,
            fontWeight: "600",
            color: INK,
          }}
        />
        <Text style={{ fontSize: 11.5, color: MUTED }}>kcal</Text>
      </View>
    </ExpandableRow>
  );
}
