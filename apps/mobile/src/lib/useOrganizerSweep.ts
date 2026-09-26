import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import { STORAGE_LOCATIONS, type FlatItem } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useCredits } from "@/lib/credits";
import { useInventory } from "@/lib/inventory";
import { useKitchenScore } from "@/lib/kitchenScore";
import { nextBatch, runSweep, SWEEP_COST_PER_ITEM, type SweepMove } from "@/lib/organizerSweep";
import { useToast } from "@/lib/toast";

export const locationLabel = (key: string) => STORAGE_LOCATIONS.find((l) => l.key === key)?.label ?? key;

/**
 * One Organizer sweep, for whichever screen shows it: ask first (it costs credits), check a bounded batch,
 * report honestly what was and wasn't checked, and only then count the answered items towards the tidiness score.
 */
export function useOrganizerSweep() {
  const router = useRouter();
  const toast = useToast();
  const { patchItem } = useInventory();
  const { refresh: refreshScore } = useKitchenScore();
  const { balance: credits, refresh: refreshCredits } = useCredits();

  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [moves, setMoves] = useState<SweepMove[]>([]);
  const [checked, setChecked] = useState(0);
  const [batchSize, setBatchSize] = useState(0);
  const seen = useRef(new Set<string>());

  const run = useCallback(
    async (batch: FlatItem[]) => {
      setStatus("checking");
      setMoves([]);
      const result = await runSweep(batch, (name, icon) => api.suggestItemDetails(name, icon));
      result.checkedIds.forEach((id) => seen.current.add(id));
      setMoves(result.moves);
      setChecked(result.checked);
      setStatus("done");
      void refreshCredits();

      if (result.checked > 0) {
        api
          .incrementOrganizerTally({ checked: result.checked, correct: result.checked - result.moves.length })
          .then(() => refreshScore())
          .catch(() => {});
      }
      if (result.stopped === "credits") {
        toast.show(`Out of credits after ${result.checked} check${result.checked === 1 ? "" : "s"}`, {
          actionLabel: "Get credits",
          onAction: () => router.push("/credits"),
        });
      } else if (result.stopped === "throttled") {
        toast.show("Too many checks at once. Give it a minute, then check again.");
      } else if (result.unchecked > 0) {
        toast.show(`${result.unchecked} item${result.unchecked === 1 ? "" : "s"} couldn't be checked. Try again in a moment.`);
      }
    },
    [refreshCredits, refreshScore, router, toast],
  );

  /** Confirm the cost, then sweep the next batch of `items`. */
  const start = useCallback(
    (items: FlatItem[]) => {
      if (status === "checking" || items.length === 0) return;
      const batch = nextBatch(items, seen.current);
      setBatchSize(batch.length);
      const cost = batch.length * SWEEP_COST_PER_ITEM;

      if (credits !== null && credits < SWEEP_COST_PER_ITEM) {
        Alert.alert("Not enough credits", `Checking an item costs ${SWEEP_COST_PER_ITEM} credit and you have ${credits}.`, [
          { text: "Not now", style: "cancel" },
          { text: "Get credits", onPress: () => router.push("/credits") },
        ]);
        return;
      }
      const more = items.length > batch.length ? ` Your fridge has ${items.length} items, so check again afterwards to carry on.` : "";
      Alert.alert(
        `Check ${batch.length} item${batch.length === 1 ? "" : "s"}?`,
        `The crew checks each item's storage spot with AI. That uses ${cost} credit${cost === 1 ? "" : "s"}${credits !== null ? ` (you have ${credits})` : ""}.${more}`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Check", onPress: () => void run(batch) },
        ],
      );
    },
    [status, credits, run, router],
  );

  const dismiss = useCallback((id: string) => setMoves((p) => p.filter((m) => m.id !== id)), []);

  const apply = useCallback(
    async (m: SweepMove) => {
      setMoves((p) => p.filter((x) => x.id !== m.id));
      try {
        await patchItem(m.id, { location: m.to });
        toast.show(`Moved ${m.name} to ${locationLabel(m.to)}`, {
          actionLabel: "Undo",
          onAction: () => void patchItem(m.id, { location: m.from }),
        });
      } catch {
        setMoves((p) => [m, ...p]);
        toast.show(`Couldn't move ${m.name}. Try again.`);
      }
    },
    [patchItem, toast],
  );

  return { status, moves, checked, batchSize, start, apply, dismiss };
}
