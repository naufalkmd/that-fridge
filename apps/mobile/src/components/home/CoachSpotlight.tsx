import { useEffect, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useInventory } from "@/lib/inventory";
import { type CoachTarget, useOnboarding } from "@/lib/onboarding";

const CANVAS = "#0a0a0c";
const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const ACCENT = "#26c6da";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";

const FAB_SIZE = 58;
const RING = 96;

// Beyond this many items the fridge is clearly established (a reinstall, or the demo
// account) — the intro can re-run there but the beginner tour shouldn't.
const ESTABLISHED = 6;

type Ion = keyof typeof Ionicons.glyphMap;

const LOOK_AROUND: {
  target: Exclude<CoachTarget, "add" | "home">;
  icon: Ion;
  title: string;
  body: string;
}[] = [
  {
    target: "inventory",
    icon: "file-tray-stacked",
    title: "Your inventory",
    body: "Everything you add lives here with a freshness bar — green fading to red as it ages.",
  },
  {
    target: "eat",
    icon: "people",
    title: "Meet the crew",
    body: "Chef, Guardian, Organizer and Shopkeeper — recipes, expiry warnings, storage tips and your shopping list.",
  },
  {
    target: "chat",
    icon: "chatbubble",
    title: "Ask anything",
    body: "Quick Chat answers questions about your fridge, and turns a recipe link into a card.",
  },
];

/**
 * One-time onboarding spotlight, rendered from `(tabs)/_layout` over the tab bar.
 *
 * Phase A — empty fridge: dims the screen and highlights the "+" so the first action
 * is unmissable. Phase B — once an item exists: a short 3-stop "look around" of the
 * nav (inventory, crew, chat). Both phases draw the same bright icon chip in the ring
 * (the "+" or the tab's icon) so they read as one consistent treatment. Either phase
 * ends permanently on Skip / Got it, and it's suppressed for an established fridge.
 */
export function CoachSpotlight() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { items, loading } = useInventory();
  const {
    ready,
    seen,
    coachDismissed,
    dismissCoach,
    coachRects,
    coachTourSeen,
    markCoachTourSeen,
  } = useOnboarding();
  const [step, setStep] = useState(0);

  // Whether the look-around had already run in a previous session — captured once,
  // so marking it "seen" now doesn't hide it out from under the current session.
  const ranBefore = useRef<boolean | null>(null);
  if (ready && ranBefore.current === null) ranBefore.current = coachTourSeen;

  const inLookAround =
    seen &&
    !coachDismissed &&
    !loading &&
    items.length > 0 &&
    items.length <= ESTABLISHED;

  useEffect(() => {
    if (!inLookAround) return;
    // Shown-and-abandoned in an earlier session → stop nagging. First run → persist
    // the marker so it only ever gets this one session.
    if (ranBefore.current) void dismissCoach();
    else void markCoachTourSeen();
  }, [inLookAround, dismissCoach, markCoachTourSeen]);

  if (!seen || coachDismissed || loading || items.length > ESTABLISHED) {
    return null;
  }
  if (items.length > 0 && ranBefore.current) return null;

  const fallbackY = height - (insets.bottom || 10) - 34;

  // ── Phase A — "add your first item" ──────────────────────────────────────
  if (items.length === 0) {
    const rect = coachRects.add;
    const cx = rect ? rect.x + rect.width / 2 : width / 2;
    const cy = rect ? rect.y + rect.height / 2 - 22 : fallbackY;
    return (
      <Overlay
        insets={insets}
        cx={cx}
        cy={cy}
        icon="add"
        big
        title="Add your first item"
        body="Tap + — scan a barcode or just type it in. Your fridge fills in from there."
        primaryLabel="Next"
        onPrimary={() => router.push("/add")}
        onSkip={dismissCoach}
      />
    );
  }

  // ── Phase B — look around ───────────────────────────────────────────────
  const stop = LOOK_AROUND[Math.min(step, LOOK_AROUND.length - 1)];
  const last = step >= LOOK_AROUND.length - 1;
  const rect = coachRects[stop.target];
  const cx = rect ? rect.x + rect.width / 2 : width / 2;
  const cy = rect ? rect.y + rect.height / 2 : fallbackY;

  return (
    <Overlay
      insets={insets}
      cx={cx}
      cy={cy}
      icon={stop.icon}
      title={stop.title}
      body={stop.body}
      progress={`${step + 1} / ${LOOK_AROUND.length}`}
      primaryLabel={last ? "Got it" : "Next"}
      onPrimary={() => (last ? void dismissCoach() : setStep(step + 1))}
      onSkip={last ? undefined : dismissCoach}
    />
  );
}

function Overlay({
  insets,
  cx,
  cy,
  icon,
  big,
  title,
  body,
  progress,
  primaryLabel,
  onPrimary,
  onSkip,
}: {
  insets: EdgeInsets;
  cx: number;
  cy: number;
  icon: Ion;
  big?: boolean;
  title: string;
  body: string;
  progress?: string;
  primaryLabel: string;
  onPrimary: () => void;
  onSkip?: () => void;
}) {
  const chip = big ? FAB_SIZE : 46;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* opaque dim that blocks the app behind it — tapping it does NOT dismiss;
          only the "Skip" button (or the primary action) closes the coach. */}
      <View style={{ flex: 1, backgroundColor: "rgba(6,6,9,0.88)" }}>
        {/* tooltip, anchored above the highlighted target */}
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: Math.max((insets.top || 20) + 44, cy - RING / 2 - 150),
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
              borderRadius: 14,
              paddingVertical: 14,
              paddingHorizontal: 18,
              maxWidth: 320,
              width: "100%",
            }}
          >
            {progress && (
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "800",
                  letterSpacing: 0.6,
                  color: FAINT,
                  textAlign: "center",
                  marginBottom: 5,
                }}
              >
                {progress}
              </Text>
            )}
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: INK,
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: 12.5,
                lineHeight: 18,
                color: MUTED,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {body}
            </Text>
            <Pressable
              onPress={onPrimary}
              style={{
                marginTop: 12,
                alignSelf: "center",
                backgroundColor: ACCENT,
                borderRadius: 9,
                paddingVertical: 9,
                paddingHorizontal: 22,
              }}
            >
              <Text
                style={{ fontSize: 13, fontWeight: "800", color: CANVAS }}
              >
                {primaryLabel}
              </Text>
            </Pressable>
          </View>
          <View
            style={{
              width: 14,
              height: 14,
              backgroundColor: SURFACE,
              borderRightWidth: 1,
              borderBottomWidth: 1,
              borderColor: HAIRLINE,
              transform: [{ rotate: "45deg" }],
              marginTop: -7,
            }}
          />
        </View>

        {/* halo + ring around the target */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: cx - (RING + 20) / 2,
            top: cy - (RING + 20) / 2,
            width: RING + 20,
            height: RING + 20,
            borderRadius: (RING + 20) / 2,
            backgroundColor: "rgba(38,198,218,0.10)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: cx - RING / 2,
            top: cy - RING / 2,
            width: RING,
            height: RING,
            borderRadius: RING / 2,
            borderWidth: 2,
            borderColor: ACCENT,
            backgroundColor: "rgba(38,198,218,0.16)",
          }}
        />

        {/* bright chip in the ring — the "+" FAB in phase A, the tab icon in the tour */}
        <Pressable
          onPress={onPrimary}
          style={{
            position: "absolute",
            left: cx - chip / 2,
            top: cy - chip / 2,
            width: chip,
            height: chip,
            borderRadius: big ? chip / 2 : 14,
            backgroundColor: ACCENT,
            borderWidth: 4,
            borderColor: SURFACE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={big ? 26 : 20} color={CANVAS} />
        </Pressable>

        {onSkip && (
          <Pressable
            onPress={onSkip}
            hitSlop={12}
            style={{
              position: "absolute",
              top: (insets.top || 20) + 8,
              right: 24,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: MUTED }}>
              Skip
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
