import { useMemo } from "react";

import type { KitchenScoreInput } from "@thatfridge/core";

import { useInventory } from "@/lib/inventory";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useNotifications } from "@/lib/notifications";
import { scopeItems, useScope } from "@/lib/scope";
import { useShopping } from "@/lib/shopping";

/** The Kitchen (Crew) score input for the selected fridge scope - same recipe Home uses for its gauge. */
export function useKitchenScoreInput(): KitchenScoreInput {
  const { items } = useInventory();
  const { events } = useNotifications();
  const { items: shoppingItems } = useShopping();
  const { scope } = useScope();
  const { usageHistory, organizerTally } = useKitchenScore();

  return useMemo(() => {
    const scoped = scopeItems(items, scope);
    const scopedEvents = scope === "all" ? events : events.filter((e) => e.fridgeId === scope);
    return {
      items: scoped.map((i) => ({ days: i.days, freshness: i.freshness })),
      notificationEvents: scopedEvents.map((e) => ({ kind: e.kind, done: e.done })),
      shoppingList: shoppingItems.map((s) => ({ checked: s.checked })),
      usageHistory,
      organizerTally,
    };
  }, [items, events, shoppingItems, scope, usageHistory, organizerTally]);
}
