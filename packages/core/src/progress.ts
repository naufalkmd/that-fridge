// Goal-tracking + badge catalog — the mobile port of apps/web's goals.ts + badges.ts,
// adapted to explicit inputs instead of the web's ThatFridgeState.

import { getOverdueItemStats } from "./home";
import type { BadgeKey, GoalMetricType, UsageHistoryEntry, UserGoal } from "./types";

// ---- Badges (static catalog, mirrors App\Services\BadgeService::BADGES) --------------

export const BADGE_CATALOG: { key: BadgeKey; label: string; description: string; target: number }[] = [
  {
    key: "rescued_10",
    label: "Item Rescuer",
    description: "Marked 10 items used via a recipe while they still had 3 days or less left.",
    target: 10,
  },
  {
    key: "first_link_recipe",
    label: "Link Master",
    description: "Imported your first recipe straight from a link.",
    target: 1,
  },
  {
    key: "full_week_variety",
    label: "Balanced Plate",
    description: "Hit all 5 food groups in your Food Balance score.",
    target: 1,
  },
  {
    key: "zero_waste_week",
    label: "Zero Waste Week",
    description: "Had nothing overdue at a weekly check-in.",
    target: 1,
  },
];

// ---- Goals -------------------------------------------------------------------------

export const GOAL_METRIC_META: Record<
  GoalMetricType,
  { label: string; unit: string; description: string; lowerIsBetter: boolean }
> = {
  waste_rate: {
    label: "Waste rate",
    unit: "%",
    description: "Keep the share of your fridge that's sitting past its date below a target.",
    lowerIsBetter: true,
  },
  items_rescued: {
    label: "Items rescued",
    unit: "items",
    description: "Use items up while they're still fresh, instead of letting them go bad.",
    lowerIsBetter: false,
  },
  freshness_at_use: {
    label: "Average freshness at use",
    unit: "score",
    description: "Use items while they still have good freshness left, not right at the wire.",
    lowerIsBetter: false,
  },
};

export interface GoalProgress {
  metricType: GoalMetricType;
  metricLabel: string;
  targetValue: number;
  /** null = not enough data yet to say anything meaningful. */
  currentValue: number | null;
  unit: string;
  /** null = no verdict yet (currentValue is null). */
  onTrack: boolean | null;
  explanation: string;
  limitationNote: string | null;
}

const ALL_TIME_NOTE =
  "Measured all-time since you started tracking, not strictly this week/month — usage history keeps a running total per item, not a per-event log.";

export function computeGoalProgress(input: {
  goal: UserGoal | null;
  items: { days: number }[];
  usageHistory: UsageHistoryEntry[];
}): GoalProgress | null {
  const { goal, items, usageHistory } = input;
  if (!goal || !goal.isActive) return null;
  const meta = GOAL_METRIC_META[goal.metricType];

  if (goal.metricType === "waste_rate") {
    if (items.length === 0) {
      return {
        metricType: goal.metricType,
        metricLabel: meta.label,
        targetValue: goal.targetValue,
        currentValue: null,
        unit: meta.unit,
        onTrack: null,
        explanation: "Add a few items to your fridge and this will start reflecting your waste rate.",
        limitationNote: null,
      };
    }
    const { overdueCount, overdueRatio } = getOverdueItemStats(items);
    const currentValue = Math.round(overdueRatio * 100);
    return {
      metricType: goal.metricType,
      metricLabel: meta.label,
      targetValue: goal.targetValue,
      currentValue,
      unit: meta.unit,
      onTrack: currentValue <= goal.targetValue,
      explanation:
        overdueCount === 0
          ? "Nothing is currently sitting past its date — waste rate is 0% right now."
          : `${overdueCount} of ${items.length} item${items.length === 1 ? "" : "s"} you own ${
              overdueCount === 1 ? "is" : "are"
            } currently past its date.`,
      limitationNote: null,
    };
  }

  if (goal.metricType === "items_rescued") {
    const totalRescued = usageHistory.reduce((sum, h) => sum + h.freshUseCount, 0);
    const hasAnyUsage = usageHistory.length > 0;
    return {
      metricType: goal.metricType,
      metricLabel: meta.label,
      targetValue: goal.targetValue,
      currentValue: hasAnyUsage ? totalRescued : null,
      unit: meta.unit,
      onTrack: hasAnyUsage ? totalRescued >= goal.targetValue : null,
      explanation: hasAnyUsage
        ? `You've used up ${totalRescued} item${totalRescued === 1 ? "" : "s"} while still within their date so far.`
        : "Use up a few items and this will start counting the ones you caught in time.",
      limitationNote: hasAnyUsage ? ALL_TIME_NOTE : null,
    };
  }

  // freshness_at_use
  const sampleCount = usageHistory.reduce((sum, h) => sum + h.freshnessSampleCount, 0);
  const freshnessSum = usageHistory.reduce((sum, h) => sum + h.freshnessSum, 0);
  const currentValue = sampleCount > 0 ? Math.round(freshnessSum / sampleCount) : null;
  return {
    metricType: goal.metricType,
    metricLabel: meta.label,
    targetValue: goal.targetValue,
    currentValue,
    unit: meta.unit,
    onTrack: currentValue === null ? null : currentValue >= goal.targetValue,
    explanation:
      currentValue === null
        ? "Use up a few items with an expiry date set and this will start averaging their freshness at the time you used them."
        : `Items you've used were, on average, at ${currentValue}% freshness when you used them.`,
    limitationNote: currentValue === null ? null : ALL_TIME_NOTE,
  };
}
