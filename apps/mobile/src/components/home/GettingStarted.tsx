import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useInventory } from "@/lib/inventory";
import { useRecipes } from "@/lib/recipes";
import { useShopping } from "@/lib/shopping";
import { useOnboarding } from "@/lib/onboarding";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";

type Route = "/add" | "/chat" | "/recipes" | "/shopping" | "/fridges";

type Step = {
  id: string;
  label: string;
  hint: string;
  /** null = not a task, just a pre-checked affirmation (endowed-progress head start). */
  route: Route | null;
  /** true = completion is read from real data; false = "you visited it" is the best signal. */
  auto: boolean;
  done: boolean;
};

/**
 * Self-paced "get started" card on Home — appears once the intro carousel is done and
 * hides itself when every step is complete or the user taps Hide. Follows the natural
 * hierarchy (account → fridge → items → the rest) and opens with the account row already
 * ticked (endowed progress) so it never reads as a daunting 0/N.
 */
export function GettingStarted() {
  const router = useRouter();
  const { items, fridges } = useInventory();
  const { recipes } = useRecipes();
  const { items: shopping } = useShopping();
  const {
    seen,
    checklistDismissed,
    dismissChecklist,
    checklistVisited,
    markChecklistVisited,
  } = useOnboarding();

  const steps = useMemo<Step[]>(() => {
    const shared = fridges.some((f) => (f.memberCount ?? 1) > 1);
    const visited = (id: string) => checklistVisited.includes(id);
    return [
      {
        id: "welcome",
        label: "Created your account",
        hint: "",
        route: null,
        auto: true,
        done: true,
      },
      {
        id: "fridge",
        label: "Set up your fridge",
        hint: "Name it — or just add an item and we'll make one",
        route: "/fridges",
        auto: true,
        done: fridges.length > 0,
      },
      {
        id: "item",
        label: "Add your first item",
        hint: "Scan a barcode, snap a receipt, or type it in",
        route: "/add",
        auto: true,
        done: items.length > 0,
      },
      {
        id: "crew",
        label: "Ask the crew what to cook",
        hint: "Chef works from what's in your fridge",
        route: "/chat",
        auto: false,
        done: visited("crew"),
      },
      {
        id: "recipe",
        label: "Save a recipe to your book",
        hint: "Keep the ones you'll make again",
        route: "/recipes",
        auto: true,
        // Every book ships with the curated starter set, so "has recipes" is always
        // true — this step only counts a recipe the user added or favorited themselves.
        done: recipes.some((r) => r.isMine || r.isFavorite),
      },
      {
        id: "shopping",
        label: "Start a shopping list",
        hint: "Add what's running low",
        route: "/shopping",
        auto: true,
        done: shopping.length > 0,
      },
      {
        id: "invite",
        label: "Add your household",
        hint: "Share the fridge so everyone sees it",
        route: "/fridges",
        auto: true,
        done: shared || visited("invite"),
      },
    ];
  }, [items, recipes, shopping, fridges, checklistVisited]);

  const doneCount = steps.filter((s) => s.done).length;

  // Not for someone whose fridge is already established (e.g. a reinstall, or the demo
  // account) — the intro carousel can re-show there, but a beginner checklist shouldn't.
  if (
    !seen ||
    checklistDismissed ||
    items.length >= 5 ||
    doneCount === steps.length
  ) {
    return null;
  }

  const go = (step: Step) => {
    if (!step.route) return; // the pre-checked "welcome" row isn't a task
    if (!step.auto) void markChecklistVisited(step.id);
    router.push(step.route);
  };

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: HAIRLINE,
        backgroundColor: SURFACE,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <View>
          <Text style={{ fontSize: 13.5, fontWeight: "800", color: INK }}>
            Getting started
          </Text>
          <Text style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>
            {doneCount} of {steps.length} done
          </Text>
        </View>
        <Pressable onPress={dismissChecklist} hitSlop={8}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: MUTED }}>
            Hide
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          height: 3,
          marginHorizontal: 14,
          borderRadius: 2,
          backgroundColor: SURFACE2,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${(doneCount / steps.length) * 100}%`,
            backgroundColor: GOOD,
          }}
        />
      </View>

      <View style={{ paddingVertical: 4 }}>
        {steps.map((step) => (
          <Pressable
            key={step.id}
            onPress={() => go(step)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: step.done ? 0 : 1.5,
                borderColor: "rgba(255,255,255,0.22)",
                backgroundColor: step.done ? GOOD : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {step.done && (
                <MaterialCommunityIcons name="check" size={12} color="#0a0a0c" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: step.done ? MUTED : INK,
                  textDecorationLine: step.done ? "line-through" : "none",
                }}
              >
                {step.label}
              </Text>
              {!step.done && (
                <Text style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>
                  {step.hint}
                </Text>
              )}
            </View>
            {!step.done && (
              <Ionicons name="chevron-forward" size={15} color={FAINT} />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
