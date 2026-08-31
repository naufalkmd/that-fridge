import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";

import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { ScopePill } from "@/components/tags";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const BLUE = "#5b8dee";
const INK = "#eaeaec";

const MENU_WIDTH = 200;

/**
 * Pill + dropdown for choosing "All Fridges" or a single fridge. The menu renders in a
 * Modal anchored under the pill — an inline absolute menu was being painted over by later
 * siblings that set their own zIndex (the Inventory / Crew headers), which read as the menu
 * being see-through.
 */
export function FridgeScopePicker({ small }: { small?: boolean }) {
  const { fridges } = useInventory();
  const { scope, setScope } = useScope();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    h: number;
  } | null>(null);
  const pillRef = useRef<View>(null);

  const label =
    scope === "all"
      ? "All Fridges"
      : (fridges.find((f) => f.id === scope)?.name ?? "This Fridge");

  const options = [{ id: "all", name: "All Fridges" }, ...fridges];

  const openMenu = () => {
    pillRef.current?.measureInWindow((x, y, _w, h) => {
      setAnchor({ x, y, h });
      setOpen(true);
    });
  };

  const screenW = Dimensions.get("window").width;
  const left = anchor
    ? Math.max(8, Math.min(anchor.x, screenW - MENU_WIDTH - 8))
    : 0;

  return (
    <View ref={pillRef} collapsable={false} style={{ alignSelf: "flex-start" }}>
      <ScopePill label={label} small={small} onPress={openMenu} />

      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          {anchor && (
            <View
              style={{
                position: "absolute",
                top: anchor.y + anchor.h + 4,
                left,
                width: MENU_WIDTH,
                backgroundColor: SURFACE,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: HAIRLINE,
                padding: 6,
                shadowColor: "#000",
                shadowOpacity: 0.45,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 10,
              }}
            >
              {options.map((opt) => {
                const active = opt.id === scope;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      setScope(opt.id);
                      setOpen(false);
                    }}
                    style={{
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      borderRadius: 6,
                      backgroundColor: active ? SURFACE2 : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: active ? BLUE : INK,
                      }}
                    >
                      {opt.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
