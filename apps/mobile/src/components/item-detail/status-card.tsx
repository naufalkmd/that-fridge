import { Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { daysLabel, freshColor, type FlatItem } from "@thatfridge/core";

import { freshnessTip } from "@/lib/itemDetails";
import { useTheme } from "@/lib/theme";

/**
 * How this item is doing, in one card: the days left as the headline, the freshness bar, and one line of advice.
 * (Was two separate cards - a bar and a tip - that read as two unrelated things.)
 */
export function StatusCard({ item }: { item: FlatItem }) {
  const { surface2: SURFACE2, hairline: HAIRLINE, ink: INK, muted: MUTED, faint: FAINT } = useTheme().colors;
  const tone = freshColor(item.freshness);
  const tip = freshnessTip(item.name, item.freshness);

  return (
    <View
      accessible
      accessibilityLabel={`${daysLabel(item.days)}. ${item.freshness} percent fresh. ${tip.text}`}
      style={{ backgroundColor: SURFACE2, borderRadius: 12, padding: 16, marginBottom: 16, gap: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 17, fontWeight: "800", color: tone }}>{daysLabel(item.days)}</Text>
        <Text style={{ fontSize: 12.5, color: MUTED }}>{item.freshness}% fresh</Text>
      </View>

      <View style={{ height: 6, borderRadius: 3, backgroundColor: HAIRLINE, overflow: "hidden" }}>
        <View style={{ height: "100%", borderRadius: 3, width: `${Math.max(3, item.freshness)}%`, backgroundColor: tone }} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        <MaterialCommunityIcons
          name={tip.tone === "fine" ? "check-circle-outline" : "clock-alert-outline"}
          size={15}
          color={tip.tone === "fine" ? FAINT : tone}
          style={{ marginTop: 1 }}
        />
        <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: INK }}>{tip.text}</Text>
      </View>
    </View>
  );
}
