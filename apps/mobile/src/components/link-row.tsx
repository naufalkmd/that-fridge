import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useTheme } from "@/lib/theme";

/** One row of a settings-style list (icon, label, optional subtitle / value / badge / right control). */
export function LinkRow({
  icon,
  label,
  subtitle,
  value,
  badge,
  right,
  destructive,
  hideChevron,
  disabled,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** A muted explanation line under the label. */
  subtitle?: string;
  value?: string;
  /** A short uppercase tag next to the label, e.g. "BETA" - for a feature that's live but
   *  still being finished. */
  badge?: string;
  /** A control on the right (e.g. a Switch) instead of a chevron. */
  right?: React.ReactNode;
  destructive?: boolean;
  hideChevron?: boolean;
  disabled?: boolean;
  /** Omit for a row that isn't tappable itself (its `right` control is). */
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const tint = destructive ? colors.bad : colors.muted;
  const rowClass = `flex-row items-center gap-3 px-4 py-3.5 ${last ? "" : "border-b border-hairline"}`;
  const content = (
    <>
      <Ionicons name={icon} size={18} color={tint} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className={`text-[14px] ${destructive ? "text-bad" : "text-ink"}`}>{label}</Text>
          {badge && (
            <View
              className="rounded-full px-1.5 py-0.5"
              style={{ backgroundColor: `${colors.accent}26` }}
            >
              <Text
                className="text-[9.5px] font-extrabold tracking-wide"
                style={{ color: colors.accent }}
              >
                {badge}
              </Text>
            </View>
          )}
        </View>
        {subtitle && <Text className="mt-0.5 text-[12px] leading-[17px] text-muted">{subtitle}</Text>}
      </View>
      {value && <Text className="text-[13px] text-faint">{value}</Text>}
      {right ?? (!hideChevron && onPress && <Ionicons name="chevron-forward" size={16} color={colors.faint} />)}
    </>
  );

  if (!onPress) return <View className={rowClass}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`${rowClass} active:bg-canvas ${disabled ? "opacity-50" : ""}`}
    >
      {content}
    </Pressable>
  );
}
