import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/lib/theme";

/**
 * Generic chip picker - promoted from the ChipRow that used to live inline in the item-detail
 * edit form (one per screen that needed one). `group` lets callers (e.g. Weight's unit chips)
 * insert a visual break between clusters without the caller hand-rolling separator logic.
 */
export function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; group?: string }[];
  value: string | null;
  onChange: (key: string) => void;
}) {
  const { accent: AMBER, surface2: SURFACE2, ink: INK, onAccent: CANVAS } = useTheme().colors;

  let lastGroup: string | undefined;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const active = value === o.key;
        const startsNewGroup = o.group !== undefined && o.group !== lastGroup && lastGroup !== undefined;
        lastGroup = o.group;
        return (
          <View
            key={o.key}
            style={startsNewGroup ? { marginLeft: 6, paddingLeft: 6, borderLeftWidth: 1, borderLeftColor: SURFACE2 } : undefined}
          >
            <Pressable
              onPress={() => onChange(o.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 6,
                backgroundColor: active ? AMBER : SURFACE2,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: active ? CANVAS : INK }}>{o.label}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
