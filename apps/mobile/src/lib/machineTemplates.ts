import type MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { MachineDraft } from "@thatfridge/core";

import { getDeviceTimezone } from "@/lib/timezone";
import type { ThemeColors } from "@/lib/theme";

export interface MachineTemplate {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: (colors: ThemeColors) => string;
  /** Builds a fresh MachineDraft, same shape AgentToolbox's MACHINE_TOOLS/MachineDraftValidator
   *  already accept - a function (not a static object) so the schedule timezone reflects the
   *  device's *current* zone every time a template is picked, not whenever this module loaded. */
  build: () => MachineDraft;
}

/** Curated, zero-AI-credit starting points for Kitchen Lab, built from the same tool schemas
 *  the AI drafter uses (see AgentToolbox::MACHINE_TOOLS). Picking one jumps straight to the
 *  review screen - no draftMachine() call, so no credit spent - same as editing/duplicating an
 *  existing Machine. The user can still redraft with AI from review if they want changes. */
export const MACHINE_TEMPLATES: MachineTemplate[] = [
  {
    id: "weekly-expiry-check",
    label: "Weekly expiry check",
    description: "Every Monday at 8am, count what's expiring within a week",
    icon: "timer-sand",
    color: (colors) => colors.agentGuardian,
    build: () => ({
      name: "Weekly expiry check",
      trigger: {
        type: "schedule",
        config: { frequency: "weekly", time: "08:00", weekday: 1, timezone: getDeviceTimezone() },
      },
      steps: [
        { tool: "sum_item_field", args: { field: "quantity", expiring_within_days: 7 } },
        {
          tool: "notify_user",
          args: {
            title: "Weekly expiry check",
            message: "{step1} item(s) are expiring within a week — check what needs using.",
          },
        },
      ],
    }),
  },
  {
    id: "low-stock-reminder",
    label: "Low stock reminder",
    description: "Notify me when total quantity on hand drops to 5 or below",
    icon: "cart-outline",
    color: (colors) => colors.agentShopkeeper,
    build: () => ({
      name: "Low stock reminder",
      trigger: {
        type: "threshold",
        config: { field: "quantity", custom_field_label: null, unit: null, op: "lte", value: 5 },
      },
      steps: [
        {
          tool: "notify_user",
          args: { title: "Low stock", message: "Total stock has dropped low — check what needs restocking." },
        },
      ],
    }),
  },
  {
    id: "fridge-summary",
    label: "Fridge summary",
    description: "Every Sunday at 9am, send your Kitchen Score",
    icon: "chart-box-outline",
    color: (colors) => colors.agentOrganizer,
    build: () => ({
      name: "Fridge summary",
      trigger: {
        type: "schedule",
        config: { frequency: "weekly", time: "09:00", weekday: 0, timezone: getDeviceTimezone() },
      },
      steps: [
        { tool: "get_kitchen_score", args: {} },
        { tool: "notify_user", args: { title: "Fridge summary", message: "Your kitchen score: {step1}" } },
      ],
    }),
  },
];
