import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, { FadeIn } from "react-native-reanimated";

import { CrewScene } from "@/components/home/CrewScene";

// Shared onboarding UI for `/welcome` (pre-sign-in): the dark palette, the primary button, the
// glow and the walking-crew scene. Purely presentational.

export const CANVAS = "#0a0a0c";
export const SURFACE = "#131316";
export const SURFACE2 = "#1a1a1f";
export const HAIRLINE = "rgba(255,255,255,0.09)";
export const ACCENT = "#26c6da";
export const INK = "#eaeaec";
export const MUTED = "rgba(234,234,236,0.58)";
export const FAINT = "rgba(234,234,236,0.34)";
export const GOOD = "#39e07f";
export const WARN = "#f5a623";
export const BAD = "#ff5567";

export function PrimaryButton({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: ACCENT,
        borderCurve: "continuous", borderRadius: 12,
        minHeight: 54,
        paddingHorizontal: 20,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={CANVAS} />
      ) : (
        <>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: CANVAS,
            }}
          >
            {label}
          </Text>
          <Ionicons name="arrow-forward" size={17} color={CANVAS} />
        </>
      )}
    </Pressable>
  );
}

/** Soft turquoise radial glow behind the art. */
export function Glow() {
  return (
    <View style={{ position: "absolute", width: 300, height: 300 }} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="obGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={ACCENT} stopOpacity={0.16} />
            <Stop offset="55%" stopColor={ACCENT} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#obGlow)" />
      </Svg>
    </View>
  );
}

export function CrewArt() {
  // The live "walking crew" scene from Home, in a non-interactive preview mode.
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={{ width: "92%", alignSelf: "center" }}
    >
      <CrewScene showcase />
    </Animated.View>
  );
}
