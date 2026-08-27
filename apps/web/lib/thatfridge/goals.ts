import { getOverdueItemStats } from "./scoring";
import { getScopedItems } from "./selectors";
import type { GoalMetricType } from "./types";
import type { ThatFridgeState } from "./useThatFridge";

// Turns the user's chosen goal (metric + target) into a concrete "here's where you are"
// reading, computed from data the app already has - no new state, just a derived view over
// state.userGoal/state.usageHistory/getScopedItems, same pattern as scoring.ts. Isolated in its
// own file specifically so the per-metric formulas can be tuned later without touching the
// Settings screen that renders them.

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
  /** Shown for metrics that can't honor the goal's `period` (see backend/API.md). */
  limitationNote: string | null;
}

export const GOAL_METRIC_META: Record<GoalMetricType, { label: string; unit: string; description: string; lowerIsBetter: boolean }> = {
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

const ALL_TIME_NOTE =
  "This is measured all-time since you started tracking, not strictly this week/month — usage history doesn't keep a per-event log yet, just a running total per item.";

export function computeGoalProgress(state: ThatFridgeState): GoalProgress | null {
  const goal = state.userGoal;
  if (!goal || !goal.isActive) return null;

  const meta = GOAL_METRIC_META[goal.metricType];

  switch (goal.metricType) {
    case "waste_rate": {
      const items = getScopedItems(state);
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
            : `${overdueCount} of ${items.length} item${items.length === 1 ? "" : "s"} you own ${overdueCount === 1 ? "is" : "are"} currently past its date.`,
        limitationNote: null,
      };
    }

    case "items_rescued": {
      const totalRescued = state.usageHistory.reduce((sum, h) => sum + h.freshUseCount, 0);
      const hasAnyUsage = state.usageHistory.length > 0;
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

    case "freshness_at_use": {
      const sampleCount = state.usageHistory.reduce((sum, h) => sum + h.freshnessSampleCount, 0);
      const freshnessSum = state.usageHistory.reduce((sum, h) => sum + h.freshnessSum, 0);
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
  }
}
