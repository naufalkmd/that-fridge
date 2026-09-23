import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useTheme } from "@/lib/theme";

export type FieldSaveStatus = "idle" | "saving" | "error";

/**
 * The one shared row primitive for the item-detail screen: a label + collapsed-value header
 * that expands in place to `children` when tapped, plus a first-class saving/error state -
 * patchItem awaits the server (it's not optimistic), so a failed save honestly doesn't stick,
 * and every row needs to show that rather than pretend it saved.
 */
export function ExpandableRow({
  label,
  value,
  placeholder = "Not set",
  open,
  onToggle,
  children,
  status = "idle",
  errorText,
  onRetry,
  isLast = false,
  headerAction,
}: {
  label: string;
  value?: string | ReactNode;
  placeholder?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  status?: FieldSaveStatus;
  errorText?: string | null;
  onRetry?: () => void;
  isLast?: boolean;
  /** An extra tappable control (e.g. a shortcut icon) beside the toggle, as a sibling
   *  Pressable rather than nested inside it - a second row action independent of expanding. */
  headerAction?: ReactNode;
}) {
  const { hairline: HAIRLINE, ink: INK, muted: MUTED, faint: FAINT, bad: BAD, blue: BLUE } = useTheme().colors;
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <View style={{ borderBottomWidth: isLast ? 0 : 1, borderBottomColor: HAIRLINE }}>
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        <Pressable
          onPress={onToggle}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 12,
            paddingHorizontal: 14,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: MUTED, flexShrink: 0 }}>{label}</Text>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            {typeof value === "string" || value === undefined ? (
              <Text
                numberOfLines={1}
                style={{ fontSize: 13, fontWeight: "700", color: hasValue ? INK : FAINT, textAlign: "right" }}
              >
                {hasValue ? value : placeholder}
              </Text>
            ) : (
              value
            )}
            <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={16} color={FAINT} />
          </View>
        </Pressable>
        {headerAction}
      </View>

      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {children}

          {status === "saving" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <ActivityIndicator size="small" color={FAINT} />
              <Text style={{ fontSize: 11, color: FAINT }}>Saving…</Text>
            </View>
          )}
          {status === "error" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <Text style={{ flex: 1, fontSize: 11, color: BAD }}>{errorText ?? "Couldn't save that."}</Text>
              {onRetry && (
                <Pressable onPress={onRetry} hitSlop={6}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: BLUE }}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
