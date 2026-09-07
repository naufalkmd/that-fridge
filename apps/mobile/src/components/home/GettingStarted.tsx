import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useInventory } from "@/lib/inventory";
import { useRecipes } from "@/lib/recipes";
import { useShopping } from "@/lib/shopping";
import { useOnboarding } from "@/lib/onboarding";

const SURFACE = "#131316";
const CANVAS = "#0a0a0c";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const RAIL = "rgba(234,234,236,0.16)";
const GOOD = "#39e07f";
const ACCENT = "#26c6da";

const NODE_COL = 26;
const LINE_X = NODE_COL / 2 - 1;
const NODE_CENTER_Y = 10; // node marginTop (3) + radius (7)

type Route = "/add" | "/chat" | "/recipes" | "/shopping" | "/fridges";
type NodeState = "done" | "current" | "future";

type Step = {
  id: string;
  label: string;
  hint: string;
  /** null = not a task, just the pre-checked head start. */
  route: Route | null;
  done: boolean;
};

/**
 * Self-paced "get started" card on Home — a vertical progress path. Appears once the intro
 * carousel is done, hides itself when every step is complete or the user taps Hide. Follows
 * the natural hierarchy (account → fridge → items → the rest) and opens with the account
 * node already filled (endowed progress) so it never reads as a daunting start-from-zero.
 * The first unfinished step is the lit "you are here" node; the rest fade back.
 */
export function GettingStarted() {
  const router = useRouter();
  const { items, fridges } = useInventory();
  const { recipes } = useRecipes();
  const { items: shopping } = useShopping();
  const { seen, checklistDismissed, dismissChecklist, checklistVisited } =
    useOnboarding();

  const steps = useMemo<Step[]>(() => {
    const shared = fridges.some((f) => (f.memberCount ?? 1) > 1);
    const visited = (id: string) => checklistVisited.includes(id);
    return [
      {
        id: "welcome",
        label: "Created your account",
        hint: "",
        route: null,
        done: true,
      },
      {
        id: "fridge",
        label: "Set up your fridge",
        hint: "Name it — or just add an item and we'll make one",
        route: "/fridges",
        done: fridges.length > 0,
      },
      {
        id: "item",
        label: "Add your first item",
        hint: "Scan a barcode, snap a receipt, or type it in",
        route: "/add",
        done: items.length > 0,
      },
      {
        id: "crew",
        label: "Ask the crew what to cook",
        hint: "Chef works from what's in your fridge",
        route: "/chat",
        done: visited("crew"),
      },
      {
        id: "recipe",
        label: "Save a recipe to your book",
        hint: "Keep the ones you'll make again",
        route: "/recipes",
        // Every book ships with the curated starter set, so "has recipes" is always
        // true — this step only counts a recipe the user added or favorited themselves.
        done: recipes.some((r) => r.isMine || r.isFavorite),
      },
      {
        id: "shopping",
        label: "Start a shopping list",
        hint: "Add what's running low",
        route: "/shopping",
        done: shopping.length > 0,
      },
      {
        id: "invite",
        label: "Add your household",
        hint: "Share the fridge so everyone sees it",
        route: "/fridges",
        done: shared || visited("invite"),
      },
    ];
  }, [items, recipes, shopping, fridges, checklistVisited]);

  const doneCount = steps.filter((s) => s.done).length;
  const currentIndex = steps.findIndex((s) => !s.done);

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

  // Just navigate — a step is only "done" once the real thing happens (data-derived, or a
  // flag the feature itself sets, e.g. chat marks "crew" after a message actually sends).
  const go = (step: Step) => {
    if (step.route) router.push(step.route);
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
          paddingBottom: 12,
        }}
      >
        <View>
          <Text style={{ fontSize: 13.5, fontWeight: "800", color: INK }}>
            Getting started
          </Text>
          <Text style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>
            {doneCount} of {steps.length}
          </Text>
        </View>
        <Pressable onPress={dismissChecklist} hitSlop={8}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: MUTED }}>
            Hide
          </Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
        {steps.map((step, i) => (
          <PathRow
            key={step.id}
            step={step}
            state={
              step.done ? "done" : i === currentIndex ? "current" : "future"
            }
            isFirst={i === 0}
            isLast={i === steps.length - 1}
            onPress={() => go(step)}
          />
        ))}
      </View>
    </View>
  );
}

function PathRow({
  step,
  state,
  isFirst,
  isLast,
  onPress,
}: {
  step: Step;
  state: NodeState;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  // The rail reads as "filled up to where you are": green through every done node and the
  // current one, faint below.
  const lineColor = state === "future" ? RAIL : GOOD;

  return (
    <Pressable
      onPress={onPress}
      disabled={step.route === null}
      style={{ flexDirection: "row" }}
    >
      <View style={{ width: NODE_COL, alignItems: "center" }}>
        <View
          style={{
            position: "absolute",
            left: LINE_X,
            width: 2,
            top: isFirst ? NODE_CENTER_Y : 0,
            bottom: isLast ? undefined : 0,
            height: isLast ? NODE_CENTER_Y : undefined,
            backgroundColor: lineColor,
          }}
        />
        <PathNode state={state} />
      </View>

      <View
        style={{
          flex: 1,
          paddingBottom: isLast ? 6 : 16,
          paddingLeft: 2,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: state === "current" ? "700" : "600",
              color:
                state === "done"
                  ? MUTED
                  : state === "current"
                    ? INK
                    : FAINT,
              textDecorationLine: state === "done" ? "line-through" : "none",
            }}
          >
            {step.label}
          </Text>
          {state === "current" && (
            <Ionicons name="chevron-forward" size={15} color={ACCENT} />
          )}
        </View>
        {state === "current" && !!step.hint && (
          <Text style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>
            {step.hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function PathNode({ state }: { state: NodeState }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== "current") return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [state, pulse]);

  if (state === "future") {
    return (
      <View
        style={{
          marginTop: NODE_CENTER_Y - 4,
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: FAINT,
          backgroundColor: CANVAS,
        }}
      />
    );
  }

  if (state === "done") {
    return (
      <View
        style={{
          marginTop: 3,
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: GOOD,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <MaterialCommunityIcons name="check" size={9} color={CANVAS} />
      </View>
    );
  }

  // current
  return (
    <View
      style={{
        marginTop: 3,
        width: 14,
        height: 14,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: ACCENT,
          opacity: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.45, 0.1],
          }),
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.9],
              }),
            },
          ],
        }}
      />
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: ACCENT,
          backgroundColor: SURFACE,
        }}
      />
    </View>
  );
}
