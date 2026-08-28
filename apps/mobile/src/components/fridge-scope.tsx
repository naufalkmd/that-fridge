import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { ScopePill } from "@/components/tags";

const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const BLUE = "#5b8dee";
const INK = "#eaeaec";

/** Pill + dropdown for choosing "All Fridges" or a single fridge. Reads/writes the shared scope. */
export function FridgeScopePicker({ small }: { small?: boolean }) {
  const { fridges } = useInventory();
  const { scope, setScope } = useScope();
  const [open, setOpen] = useState(false);

  const label =
    scope === "all" ? "All Fridges" : fridges.find((f) => f.id === scope)?.name ?? "This Fridge";

  return (
    <View style={{ zIndex: 10 }}>
      <ScopePill label={label} small={small} onPress={() => setOpen((v) => !v)} />
      {open && (
        <View
          style={{
            position: "absolute",
            top: small ? 32 : 42,
            left: 0,
            minWidth: 170,
            backgroundColor: SURFACE,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: HAIRLINE,
            padding: 6,
          }}
        >
          {[{ id: "all", name: "All Fridges" }, ...fridges].map((opt) => {
            const active = opt.id === scope;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  setScope(opt.id);
                  setOpen(false);
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  backgroundColor: active ? SURFACE2 : "transparent",
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: active ? BLUE : INK }}>
                  {opt.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
