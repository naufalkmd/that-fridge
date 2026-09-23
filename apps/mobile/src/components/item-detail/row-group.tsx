import type { ReactNode } from "react";
import { View } from "react-native";

import { useTheme } from "@/lib/theme";

/** Bordered container for a set of ExpandableRows - the "grouped list" look, one row each. */
export function RowGroup({ children }: { children: ReactNode }) {
  const { surface: SURFACE, hairline: HAIRLINE } = useTheme().colors;
  return (
    <View
      style={{
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}
