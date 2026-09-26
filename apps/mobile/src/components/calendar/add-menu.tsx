import { Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useTheme } from "@/lib/theme";

export type AddAction = "meal" | "shopping" | "note" | "item" | "automation" | "chat";

const ACTIONS: { key: AddAction; title: string; hint: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: "meal", title: "Plan a meal", hint: "Put a meal on this day", icon: "silverware-fork-knife" },
  { key: "shopping", title: "Add to shopping list", hint: "Something you need to buy", icon: "cart-outline" },
  { key: "note", title: "Leave a note", hint: "A sticky note on the fridge", icon: "note-text-outline" },
  { key: "item", title: "Add an item", hint: "Put something in the fridge", icon: "plus-box-outline" },
  { key: "automation", title: "New automation", hint: "Something that runs on its own", icon: "flask-outline" },
  { key: "chat", title: "Ask Quick Chat", hint: "Describe it and the crew adds it", icon: "chat-processing-outline" },
];

/** The general "+" menu: everything you can add from the calendar, one tap each. */
export function AddMenu({ onPick, onBack }: { onPick: (action: AddAction) => void; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.ink }}>Add</Text>
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back to the day">
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.accent }}>Back</Text>
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        {ACTIONS.map((a) => (
          <Pressable
            key={a.key}
            onPress={() => onPick(a.key)}
            accessibilityRole="button"
            accessibilityLabel={a.title}
            style={{
              flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 8,
              borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}1a` }}>
              <MaterialCommunityIcons name={a.icon} size={19} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }}>{a.title}</Text>
              <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 1 }}>{a.hint}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.faint} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
