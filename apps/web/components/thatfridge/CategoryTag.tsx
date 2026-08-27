import { NUTRITION_CATEGORIES } from "@/lib/thatfridge/data";
import { theme } from "@/lib/thatfridge/theme";
import type { NutritionCategory } from "@/lib/thatfridge/types";

// other_extras keeps its own purple accent - the theme has no token for it (it isn't one of
// the four crew-agent colors or a semantic status color), so it's left as a hand-picked hex.
const CATEGORY_COLOR: Record<NutritionCategory, string> = {
  protein: theme.agent.guardian,
  vegetables: theme.agent.shopkeeper,
  fruit: theme.agent.chef,
  grains: "#b5702f",
  dairy: theme.agent.organizer,
  other_extras: "#7a5cb0",
};

export default function CategoryTag({ category }: { category: NutritionCategory | null | undefined }) {
  if (!category) return null;
  const label = NUTRITION_CATEGORIES.find((c) => c.key === category)?.label ?? category;
  const color = CATEGORY_COLOR[category];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.2,
        color,
        background: `${color}1a`,
        padding: "2px 7px",
        borderRadius: theme.radius.sm,
        flex: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
