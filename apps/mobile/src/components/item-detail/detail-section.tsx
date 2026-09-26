import type { ReactNode } from "react";
import { View } from "react-native";

import { Eyebrow } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { RowGroup } from "./row-group";

/** A titled group of rows ("STORAGE", "AMOUNT", "DETAILS"): a small heading over one bordered list, so a long item page reads in chunks. */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  const { faint: FAINT } = useTheme().colors;
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
        <Eyebrow color={FAINT}>{title}</Eyebrow>
      </View>
      <RowGroup>{children}</RowGroup>
    </View>
  );
}
