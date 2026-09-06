import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn } from "react-native-reanimated";

import { useInventory } from "@/lib/inventory";
import { useOnboarding } from "@/lib/onboarding";
import { SectionHeader } from "@/components/ui";

const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const ACCENT = "#26c6da";
const GOOD = "#39e07f";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";

const DEFAULT_FRIDGE_NAMES = new Set(["", "My Fridge"]);

/**
 * A gentle first-run nudge on Home. Purely additive: it derives completion from
 * real inventory state (no analytics, no per-action flags), and hides itself once
 * every actionable step is done or the user dismisses it.
 */
export function FirstRunChecklist() {
  const router = useRouter();
  const { items, fridges } = useInventory();
  const { checklistDismissed, dismissChecklist } = useOnboarding();

  const hasItem = items.length > 0;
  const ownedFridge = fridges.find((f) => f.role === "owner");
  const needsFridgeName =
    !!ownedFridge && DEFAULT_FRIDGE_NAMES.has(ownedFridge.name.trim());

  const tasks = useMemo(
    () => [
      { key: "account", label: "Create your account", done: true, onPress: undefined },
      {
        key: "item",
        label: "Add your first item",
        hint: "scan a barcode or type it in",
        done: hasItem,
        onPress: () => router.push("/add"),
      },
      ...(needsFridgeName
        ? [
            {
              key: "fridge",
              label: "Name your fridge",
              hint: "make it yours",
              done: false,
              onPress: () => router.push("/fridges"),
            },
          ]
        : []),
    ],
    [hasItem, needsFridgeName, router],
  );

  const remaining = tasks.filter((t) => !t.done).length;
  if (checklistDismissed || remaining === 0) return null;

  const doneCount = tasks.length - remaining;

  return (
    <Animated.View entering={FadeIn}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionHeader>Get started</SectionHeader>
        <Pressable onPress={() => dismissChecklist()} hitSlop={10}>
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: FAINT }}>Dismiss</Text>
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: SURFACE,
          borderWidth: 1,
          borderColor: HAIRLINE,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* progress bar */}
        <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.06)" }}>
          <View
            style={{
              height: 3,
              width: `${(doneCount / tasks.length) * 100}%`,
              backgroundColor: ACCENT,
            }}
          />
        </View>

        {tasks.map((t, i) => (
          <Pressable
            key={t.key}
            onPress={t.onPress}
            disabled={!t.onPress || t.done}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingVertical: 13,
              paddingHorizontal: 14,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: HAIRLINE,
              opacity: t.done ? 0.55 : 1,
            }}
          >
            <Ionicons
              name={t.done ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={t.done ? GOOD : FAINT}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13.5,
                  fontWeight: "700",
                  color: INK,
                  textDecorationLine: t.done ? "line-through" : "none",
                }}
              >
                {t.label}
              </Text>
              {!t.done && t.hint && (
                <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }}>{t.hint}</Text>
              )}
            </View>
            {!t.done && t.onPress && (
              <Ionicons name="chevron-forward" size={16} color={FAINT} />
            )}
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}
