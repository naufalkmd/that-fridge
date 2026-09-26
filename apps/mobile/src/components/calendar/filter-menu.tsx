import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { TAGS, type CalendarTag } from "@/lib/calendar";
import { useTheme } from "@/lib/theme";

const MENU_WIDTH = 250;

/**
 * One filter button instead of a row of chips: it opens a dropdown of tags to show or hide (several can
 * be switched off at once), with a count on the button when anything is hidden. Tap outside to close.
 */
export function FilterMenu({
  hidden,
  onToggle,
  onReset,
}: {
  hidden: ReadonlySet<CalendarTag>;
  onToggle: (tag: CalendarTag) => void;
  onReset: () => void;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; h: number }>({ x: 16, y: 150, h: 34 });
  const buttonRef = useRef<View>(null);

  const openMenu = () => {
    setOpen(true);
    // Anchor the menu under the button when the platform can tell us where it is.
    buttonRef.current?.measureInWindow?.((x, y, _w, h) => setAnchor({ x, y, h }));
  };

  const screenW = Dimensions.get("window").width;
  const left = Math.max(8, Math.min(anchor.x, screenW - MENU_WIDTH - 8));
  const active = hidden.size;

  return (
    <View ref={buttonRef} collapsable={false} style={{ alignSelf: "flex-start" }}>
      <Pressable
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={active > 0 ? `Filter, ${active} hidden` : "Filter"}
        style={{
          flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17,
          backgroundColor: active > 0 ? `${colors.accent}26` : colors.surface2,
          borderWidth: 1, borderColor: active > 0 ? colors.accent : colors.hairline,
        }}
      >
        <Ionicons name="funnel-outline" size={15} color={active > 0 ? colors.accent : colors.muted} />
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: active > 0 ? colors.accent : colors.muted }}>
          {active > 0 ? `Filter · ${active} hidden` : "Filter"}
        </Text>
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable testID="filter-backdrop" style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: "absolute", top: anchor.y + anchor.h + 6, left, width: MENU_WIDTH, padding: 6,
              backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline,
              shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: colors.faint }}>SHOW</Text>
              {active > 0 && (
                <Pressable onPress={onReset} hitSlop={8} accessibilityLabel="Show everything">
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent }}>Show all</Text>
                </Pressable>
              )}
            </View>
            {TAGS.map((tag) => {
              const shown = !hidden.has(tag.key);
              return (
                <Pressable
                  key={tag.key}
                  onPress={() => onToggle(tag.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: shown }}
                  accessibilityLabel={tag.label}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 10 }}
                >
                  <View
                    style={{
                      width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center",
                      backgroundColor: shown ? colors.accent : "transparent", borderWidth: shown ? 0 : 1.5, borderColor: colors.hairlineStrong,
                    }}
                  >
                    {shown && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                  </View>
                  <Text style={{ fontSize: 14, color: colors.ink }}>{tag.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
