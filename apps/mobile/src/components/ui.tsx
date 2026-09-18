import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View, type DimensionValue, type ViewProps } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { PixelText } from "@/components/brand";
import { useTheme } from "@/lib/theme";

/** Pulsing placeholder block for loading states. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: object;
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.surface2, opacity: pulse }, style]}
    />
  );
}

/** A few stacked skeleton rows mimicking a list card. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.hairline,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            borderBottomWidth: i === rows - 1 ? 0 : 1,
            borderBottomColor: colors.hairline,
          }}
        >
          <Skeleton width={38} height={38} radius={6} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="55%" height={12} />
            <Skeleton width="80%" height={8} />
          </View>
          <Skeleton width={30} height={12} />
        </View>
      ))}
    </View>
  );
}

/** Back-chevron + pixel title (+ optional subtitle) — the header on the web's secondary screens. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 10,
      }}
    >
      <Pressable onPress={() => router.back()} hitSlop={8} style={{ paddingTop: 1 }}>
        <Ionicons name="chevron-back" size={20} color={colors.muted} />
      </Pressable>
      <View>
        <PixelText style={{ fontSize: 14, color: colors.ink }}>{title}</PixelText>
        {subtitle && (
          <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 3 }}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Pixel-font section header — mirrors the web's "Overview" / "Your crew" headers. */
export function SectionHeader({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <PixelText style={{ fontSize: 13, color: colors.ink, marginBottom: 11 }}>{children}</PixelText>
  );
}

/** Tiny uppercase label — the web's "EXPIRING SOON" / "LOW STOCK" eyebrows. */
export function Eyebrow({ children, color }: { children: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: color ?? colors.ink }}
      className="uppercase"
    >
      {children}
    </Text>
  );
}

/** Agent identity pill — "GUARDIAN" etc, tinted with the agent colour. */
export function AgentBadge({ name }: { name: string }) {
  const { colors } = useTheme();
  const agentColor: Record<string, string> = {
    Guardian: colors.agentGuardian,
    Shopkeeper: colors.agentShopkeeper,
    Chef: colors.agentChef,
    Organizer: colors.agentOrganizer,
  };
  const color = agentColor[name] ?? colors.ink;
  return (
    <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: `${color}1a` }}>
      <Text
        style={{ fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3, color }}
        className="uppercase"
      >
        {name}
      </Text>
    </View>
  );
}

/** Standard surface card — hairline border, no shadow (per the web migration map). */
export function Card({ className = "", ...props }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-xl border border-hairline bg-surface ${className}`} {...props} />
  );
}
