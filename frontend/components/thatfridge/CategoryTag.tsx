import { NUTRITION_CATEGORIES } from "@/lib/thatfridge/data";
import type { NutritionCategory } from "@/lib/thatfridge/types";

const CATEGORY_COLOR: Record<NutritionCategory, string> = {
  protein: "#c1452e",
  vegetables: "#3f8f5c",
  fruit: "#d99a2b",
  grains: "#b5702f",
  dairy: "#2f6fb0",
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
        borderRadius: 6,
        flex: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
