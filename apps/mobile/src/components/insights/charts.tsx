import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { PixelText } from "@/components/brand";
import { useTheme } from "@/lib/theme";

/**
 * A big score inside a ring that fills to the score. One number, one shape. The ring is drawn in short segments for the
 * pixel look; a mask-free second circle fills exactly `score`% of the way round, so the segments never round the value.
 */
export function ScoreRing({ score, color, size = 92 }: { score: number | null; color: string; size?: number }) {
  const { colors } = useTheme();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  // 36 segments round the ring: a dash and a small gap, in the circle's own length units.
  const seg = c / 36;
  const dash = `${seg * 0.72} ${seg * 0.28}`;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityLabel={score === null ? "Score is still building" : `Score ${score} out of 100`}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairline} strokeWidth={stroke} fill="none" strokeDasharray={dash} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
        {score !== null && filled > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * filled} ${c}`}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
        {/* Cut the filled arc into the same segments by drawing the gaps over it in the card colour. */}
        {score !== null && filled > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.surface}
            strokeWidth={stroke + 1}
            fill="none"
            strokeDasharray={`0 ${seg * 0.72} ${seg * 0.28} 0`}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <PixelText style={{ fontSize: size * 0.28, color: colors.ink }}>{score ?? "–"}</PixelText>
      <Text style={{ fontSize: 9, letterSpacing: 1.5, color: colors.muted, marginTop: 2 }}>SCORE</Text>
    </View>
  );
}

const SEGMENTS = 10;

/**
 * A label, a bar filled to `value` (0-100), and an optional short value on the right. The fill is exact; thin gaps
 * drawn over it in the card colour split it into blocks for the pixel look without rounding the value to a block.
 */
export function MeterRow({
  label,
  value,
  color,
  right,
  muted,
  dot,
}: {
  label: string;
  value: number;
  color: string;
  right?: string;
  /** Draw the bar faint (a group that has not come up yet). */
  muted?: boolean;
  /** A small square in this colour before the label (a crew member's colour). */
  dot?: string;
}) {
  const { colors } = useTheme();
  const pct = Math.max(value > 0 ? 3 : 0, Math.min(100, value));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 88, flexDirection: "row", alignItems: "center", gap: 7 }}>
        {dot && <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: dot }} />}
        <Text style={{ flexShrink: 1, fontSize: 12.5, color: muted ? colors.faint : colors.ink }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={{ flex: 1, height: 7, borderRadius: 1.5, backgroundColor: colors.surface2, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color, opacity: muted ? 0.35 : 1 }} />
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row" }} pointerEvents="none">
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <View key={i} style={{ flex: 1, borderRightWidth: i === SEGMENTS - 1 ? 0 : 2, borderRightColor: colors.surface }} />
          ))}
        </View>
      </View>
      {right !== undefined && <Text style={{ width: 40, fontSize: 12, fontWeight: "600", color: colors.muted, textAlign: "right" }}>{right}</Text>}
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

/** Vertical stacked columns with a label under each. No numbers: the shape is the message. Heights are exact shares of the tallest column. */
export function ColumnChart({ columns, height = 84 }: { columns: Column[]; height?: number }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...columns.map((c) => c.parts.reduce((n, p) => n + p.value, 0)));

  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {columns.map((col) => {
        const total = col.parts.reduce((n, p) => n + p.value, 0);
        return (
          <View key={col.key} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            <View style={{ height, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
              {total === 0 ? (
                <View style={{ width: 18, height: 2, borderRadius: 1, backgroundColor: colors.hairline }} />
              ) : (
                <View style={{ width: 18, height: `${(total / max) * 100}%`, borderRadius: 2, overflow: "hidden", flexDirection: "column-reverse" }}>
                  {col.parts.map((p, i) => (p.value > 0 ? <View key={i} style={{ flex: p.value, backgroundColor: p.color }} /> : null))}
                </View>
              )}
            </View>
            <Text style={{ fontSize: 10.5, fontWeight: col.highlight ? "700" : "400", color: col.highlight ? colors.ink : colors.faint }}>{col.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 14, marginTop: 10 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: i.color }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
