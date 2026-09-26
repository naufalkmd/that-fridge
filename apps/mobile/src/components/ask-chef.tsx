import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useTheme } from "@/lib/theme";

/**
 * "Ask Chef": a writable request box with a few tap-to-fill examples, an optional switch, and a button that
 * says what it costs. Used on the recipe form (writes a recipe) and the meal plan (plans the week), so both
 * behave and read the same. The parent does the work in `onSubmit`.
 */
export function AskChef({
  placeholder,
  examples,
  cost,
  busy,
  allowEmpty = false,
  maxLength = 300,
  toggle,
  collapsible,
  open: openProp,
  onOpenChange,
  summary,
  onSubmit,
}: {
  placeholder: string;
  examples: string[];
  /** Credits one ask costs, shown on the button. */
  cost: number;
  busy: boolean;
  /** Blank is a valid ask (the meal plan lets Chef choose). */
  allowEmpty?: boolean;
  maxLength?: number;
  /** An optional yes/no under the box, e.g. "Use what's in my fridge". */
  toggle?: { label: string; value: boolean; onChange: (v: boolean) => void };
  /** Show only a header row that opens like a dropdown (the recipe form keeps it tucked away until wanted). */
  collapsible?: boolean;
  /** Controlled open state for a collapsible box; uncontrolled (starts closed) when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The line under the title while it is collapsed. */
  summary?: string;
  onSubmit: (prompt: string) => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState("");
  const [openState, setOpenState] = useState(false);
  const open = !collapsible || (openProp ?? openState);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const ready = allowEmpty || text.trim().length >= 3;

  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}>
      <Pressable
        onPress={collapsible ? () => setOpen(!open) : undefined}
        disabled={!collapsible}
        accessibilityRole={collapsible ? "button" : undefined}
        accessibilityLabel={collapsible ? (open ? "Close Ask Chef" : "Open Ask Chef") : undefined}
        accessibilityState={collapsible ? { expanded: open } : undefined}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <MaterialCommunityIcons name="chef-hat" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.ink }}>Ask Chef</Text>
          {collapsible && !open && summary ? <Text style={{ fontSize: 12, color: colors.faint, marginTop: 1 }}>{summary}</Text> : null}
        </View>
        {collapsible && <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.faint} />}
      </Pressable>

      {open && (
        <>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        accessibilityLabel="Ask Chef"
        multiline
        maxLength={maxLength}
        editable={!busy}
        textAlignVertical="top"
        style={{
          minHeight: 64, padding: 12, borderRadius: 8, fontSize: 14, lineHeight: 20, color: colors.ink,
          backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.hairline,
        }}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {examples.map((example) => (
          <Pressable
            key={example}
            onPress={() => setText(example)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Use example: ${example}`}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.hairline }}
          >
            <Text style={{ fontSize: 11.5, color: colors.muted }}>{example}</Text>
          </Pressable>
        ))}
      </View>

      {toggle && (
        <Pressable
          onPress={() => toggle.onChange(!toggle.value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: toggle.value }}
          accessibilityLabel={toggle.label}
          style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <MaterialCommunityIcons name={toggle.value ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color={toggle.value ? colors.accent : colors.faint} />
          <Text style={{ fontSize: 13, color: colors.ink }}>{toggle.label}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => ready && !busy && onSubmit(text.trim())}
        disabled={!ready || busy}
        accessibilityRole="button"
        accessibilityLabel="Send to Chef"
        style={{ height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, opacity: !ready || busy ? 0.5 : 1 }}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.onAccent }}>
            Ask Chef · {cost} credits
          </Text>
        )}
      </Pressable>
        </>
      )}
    </View>
  );
}
