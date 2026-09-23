import { View } from "react-native";
import { daysLabel, type FlatItem } from "@thatfridge/core";

import { DateField, daysUntil, isoInDays } from "@/components/draft-item";
import { ChipGroup } from "./chip-group";
import { ExpandableRow } from "./expandable-row";
import { useFieldSave } from "./use-field-save";

const BEST_BEFORE_PRESETS = [
  { label: "2 days", days: 2 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

export function BestBeforeRow({
  item,
  open,
  onToggle,
  isLast,
}: {
  item: FlatItem;
  open: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  const { status, error, save, retry } = useFieldSave(item.id);

  function setBestBefore(iso: string) {
    void save(
      { expiry_date: iso, shelf_life_days: Math.max(1, daysUntil(iso)) },
      { then: onToggle },
    );
  }

  return (
    <ExpandableRow
      label="Best before"
      value={daysLabel(item.days)}
      open={open}
      onToggle={onToggle}
      status={status}
      errorText={error}
      onRetry={retry}
      isLast={isLast}
    >
      <View style={{ marginBottom: 10 }}>
        <ChipGroup
          options={BEST_BEFORE_PRESETS.map((p) => ({ key: String(p.days), label: p.label }))}
          value={null}
          onChange={(key) => setBestBefore(isoInDays(Number(key)))}
        />
      </View>
      <DateField value={isoInDays(item.days)} onChange={setBestBefore} />
    </ExpandableRow>
  );
}
