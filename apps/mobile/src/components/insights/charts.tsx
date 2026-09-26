import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useTheme } from "@/lib/theme";

/** A big score inside a ring that fills to the score. One number, one shape. */
export function ScoreRing({ score, color, size = 112 }: { score: number | null; color: string; size?: number }) {
  const { colors } = useTheme();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={score === null ? "Score is still building" : `Score ${score} out of 100`}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairline} strokeWidth={stroke} fill="none" />
        {score !== null && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * filled} ${c}`}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <Text style={{ fontSize: size * 0.34, fontWeight: "800", color: colors.ink }}>{score ?? "–"}</Text>
    </View>
  );
}

/** A label, a single bar filled to `value` (0-100), and an optional short value on the right. */
export function MeterRow({
  label,
  value,
  color,
  right,
  muted,
}: {
  label: string;
  value: number;
  color: string;
  right?: string;
  /** Draw the bar faint (a group that has not come up yet). */
  muted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ width: 84, fontSize: 13, color: muted ? colors.faint : colors.ink }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: "hidden" }}>
        <View style={{ width: `${Math.max(value > 0 ? 4 : 0, Math.min(100, value))}%`, height: "100%", borderRadius: 5, backgroundColor: color, opacity: muted ? 0.35 : 1 }} />
      </View>
      {right !== undefined && <Text style={{ width: 44, fontSize: 12.5, fontWeight: "700", color: colors.muted, textAlign: "right" }}>{right}</Text>}
    </View>
  );
}

export interface Column {
  key: string;
  label: string;
  /** Stacked from the bottom. */
  parts: { value: number; color: string }[];
  /** Draw the label bold (today / this week). */
  highlight?: boolean;
}

/** Vertical stacked columns with a label under each. No numbers: the shape is the message. */
export function ColumnChart({ columns, height = 96 }: { columns: Column[]; height?: number }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...columns.map((c) => c.parts.reduce((n, p) => n + p.value, 0)));

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {columns.map((col) => {
        const total = col.parts.reduce((n, p) => n + p.value, 0);
        return (
          <View key={col.key} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <View style={{ height, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
              {total === 0 ? (
                <View style={{ width: "62%", height: 3, borderRadius: 2, backgroundColor: colors.hairline }} />
              ) : (
                <View style={{ width: "62%", height: `${(total / max) * 100}%`, borderRadius: 6, overflow: "hidden", flexDirection: "column-reverse" }}>
                  {col.parts.map((p, i) => (p.value > 0 ? <View key={i} style={{ flex: p.value, backgroundColor: p.color }} /> : null))}
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: col.highlight ? "800" : "500", color: col.highlight ? colors.ink : colors.faint }}>{col.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i.color }} />
          <Text style={{ fontSize: 11.5, color: colors.faint }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
