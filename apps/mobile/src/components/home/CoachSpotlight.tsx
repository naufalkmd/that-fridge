import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useInventory } from "@/lib/inventory";
import { useOnboarding } from "@/lib/onboarding";

const CANVAS = "#0a0a0c";
const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const ACCENT = "#26c6da";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";

const FAB_SIZE = 58;
const RING = 96;

/**
 * One-time spotlight shown right after the intro carousel, for a user with an empty
 * fridge: dims the whole screen and highlights the "+" button so the very first
 * action is unmissable. Dismisses on any tap and never returns once an item exists.
 * Rendered from `(tabs)/_layout` as a sibling of <Tabs> so it covers the tab bar.
 */
export function CoachSpotlight() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { items, loading } = useInventory();
  const { seen, coachDismissed, dismissCoach, addButtonRect } = useOnboarding();

  const visible = seen && !coachDismissed && !loading && items.length === 0;
  if (!visible) return null;

  // Prefer the tab bar's measured "+" rect; fall back to where the floating bar
  // sits (centered, just above the home-indicator inset).
  const cx = addButtonRect ? addButtonRect.x + addButtonRect.width / 2 : width / 2;
  const cy = addButtonRect
    ? addButtonRect.y + addButtonRect.height / 2 - 22
    : height - (insets.bottom || 10) - 34;

  const goAdd = () => {
    void dismissCoach();
    router.push("/add");
  };

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* full-screen dim; tap anywhere to dismiss */}
      <Pressable
        onPress={() => dismissCoach()}
        style={{ flex: 1, backgroundColor: "rgba(6,6,9,0.88)" }}
      >
        {/* tooltip, anchored above the button */}
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: cy - RING / 2 - 116,
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
              maxWidth: 300,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: INK,
                textAlign: "center",
              }}
            >
              Add your first item
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
              Tap the + button — scan a barcode or just type it in. Your fridge fills
              in from there.
            </Text>
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

        {/* pulsing-style halo + ring around the "+" */}
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

        {/* bright copy of the FAB, tappable → opens Add */}
        <Pressable
          onPress={goAdd}
          style={{
            position: "absolute",
            left: cx - FAB_SIZE / 2,
            top: cy - FAB_SIZE / 2,
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: FAB_SIZE / 2,
            backgroundColor: ACCENT,
            borderWidth: 4,
            borderColor: SURFACE,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={26} color={CANVAS} />
        </Pressable>

        {/* skip */}
        <Pressable
          onPress={() => dismissCoach()}
          hitSlop={12}
          style={{ position: "absolute", top: (insets.top || 20) + 8, right: 24 }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: MUTED }}>Skip</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}
