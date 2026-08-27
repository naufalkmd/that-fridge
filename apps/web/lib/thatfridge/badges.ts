import type { BadgeKey } from "./types";

// Display metadata for the badge shelf. Mirrors the key set + thresholds defined server-side in
// App\Services\BadgeService::BADGES (backend/API.md's "Badges" section) - keep both in sync if a
// badge is added, removed, or its target changes.
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
