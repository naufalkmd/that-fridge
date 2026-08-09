import type { Agent, FoodSubtab, FridgeStyleDef, IconData, RecipeCategory, Section, StorageLocation } from "./types";
import foodIconManifest from "@/public/images/thatfridge/food-icons/manifest.json";

export const FOOD_TAB_ORDER: FoodSubtab[] = ["recipes", "shopping", "guardian", "organizer"];

// Pixel icon patterns + sample fridge inventory data for ThatFridge.
// Each icon is drawn as rows of a legend string; '.' = transparent.
function makeIcon(rows: string[], legend: Record<string, string>): IconData {
  const cells: (string | null)[] = [];
  for (const row of rows) {
    for (const ch of row) cells.push(ch === "." ? null : legend[ch]);
  }
  return { cells, cols: rows[0].length, rows: rows.length };
}

export const ICONS: Record<string, IconData> = {
  milk: makeIcon(
    ["..aaaa..", ".abbbba.", ".accccc.", ".ccccccc", ".ccdcccc", ".ccccccc", ".ccccccc", "..ccccc."],
    { a: "#8fa8c9", b: "#3f5c85", c: "#f6f3ec", d: "#3f5c85" }
  ),
  eggs: makeIcon(
    ["........", ".ee..ee.", "eff.eff.", "efffefff", "efffefff", ".efff.e.", "..ee....", "........"],
    { e: "#c9a769", f: "#faf3e2" }
  ),
  spinach: makeIcon(
    ["..g..g..", ".ghg.ghg", "ghhgghhg", "ghhhhhhg", ".ghhhhg.", "..gigi..", "...ii...", "........"],
    { g: "#3f7d4a", h: "#5fa668", i: "#7a8f52" }
  ),
  cheese: makeIcon(
    ["........", "jjjjjjj.", "jkjkjkj.", "jjkjkjj.", "jkjkjkj.", "jjjjjjj.", "........", "........"],
    { j: "#f0b93d", k: "#e2a422" }
  ),
  apple: makeIcon(
    ["...l....", "..mmm...", ".nnnnn..", "nnnnnnn.", "nnnnnnn.", ".nnnnn..", "..nnn...", "........"],
    { l: "#5fa668", m: "#8a5a34", n: "#c94f3c" }
  ),
  leftovers: makeIcon(
    ["........", "oooooooo", "opppppo.", "opppppo.", "opppppo.", "oooooooo", "........", "........"],
    { o: "#b9c2c9", p: "#dfe6ea" }
  ),
  yogurt: makeIcon(
    [".qqqqqq.", ".rrrrrr.", ".rssssr.", ".rssssr.", ".rssssr.", "..rrrr..", "........", "........"],
    { q: "#3f5c85", r: "#e8ecef", s: "#f6f3ec" }
  ),
  meat: makeIcon(
    ["........", "..ttt...", ".ttuuutt", "ttuuuutt", ".ttuuutt", "..ttt...", "........", "........"],
    { t: "#b5502f", u: "#dd8a63" }
  ),
  berries: makeIcon(
    ["........", ".v.v.v..", "vwwvwwv.", "wwwwwww.", ".wwwww..", "..www...", "........", "........"],
    { v: "#4c6b3a", w: "#5a3a6b" }
  ),
  carrot: makeIcon(
    ["..x.x...", "..xxx...", "..yyy...", ".yyyy...", "yyyyy...", ".yyy....", "..y.....", "........"],
    { x: "#5fa668", y: "#dd7a2f" }
  ),
};

export const SECTIONS: Section[] = [
  {
    id: "dairy",
    name: "Dairy shelf",
    items: [
      { id: "d1", name: "Whole milk", icon: "milk", freshness: 78, days: 6, note: "Best before Tue", qty: 1 },
      { id: "d2", name: "Greek yogurt", icon: "yogurt", freshness: 54, days: 3, note: "2 tubs left", qty: 2 },
      { id: "d3", name: "Cheddar block", icon: "cheese", freshness: 88, days: 12, note: "Just opened", qty: 1 },
      { id: "d4", name: "Salted butter", icon: "cheese", freshness: 95, days: 20, note: "Barely touched", qty: 1 },
    ],
  },
  {
    id: "produce",
    name: "Produce drawer",
    items: [
      { id: "p1", name: "Spinach", icon: "spinach", freshness: 22, days: 1, note: "Wilting fast", qty: 1 },
      { id: "p2", name: "Apples", icon: "apple", freshness: 71, days: 9, note: "4 left", qty: 4 },
      { id: "p3", name: "Carrots", icon: "carrot", freshness: 65, days: 8, note: "Half bag", qty: 1 },
      { id: "p4", name: "Blueberries", icon: "berries", freshness: 34, days: 2, note: "Small punnet", qty: 1 },
      { id: "p5", name: "Eggs", icon: "eggs", freshness: 60, days: 10, note: "7 remaining", qty: 7 },
    ],
  },
  {
    id: "protein",
    name: "Protein bin",
    items: [
      { id: "r1", name: "Chicken thighs", icon: "meat", freshness: 41, days: 2, note: "Use or freeze", qty: 1 },
      { id: "r2", name: "Ground beef", icon: "meat", freshness: 18, days: 1, note: "Cook tonight", qty: 1 },
      { id: "r3", name: "Eggs (spare)", icon: "eggs", freshness: 82, days: 14, note: "Backup carton", qty: 1 },
    ],
  },
  {
    id: "leftovers",
    name: "Leftovers row",
    items: [
      { id: "l1", name: "Roast veggies", icon: "leftovers", freshness: 30, days: 2, note: "From Sunday", qty: 1 },
      { id: "l2", name: "Pasta bake", icon: "leftovers", freshness: 12, days: 1, note: "Last portion", qty: 1 },
      { id: "l3", name: "Soup", icon: "leftovers", freshness: 66, days: 4, note: "Quart jar", qty: 1 },
    ],
  },
];

const CURATED_ICON_KEYS = ["milk", "yogurt", "cheese", "eggs", "spinach", "carrot", "apple", "berries", "meat", "leftovers"] as const;

// The 10 curated keys above are used throughout seed data, recipes, and the icon-guessing
// heuristics, so they keep their existing names. Every other numbered icon in the food-icons
// asset pack gets a generated key/label straight from its manifest entry.
const CURATED_ICON_FILES: Record<string, string> = {
  milk: "icon-163.png",
  yogurt: "icon-164.png",
  cheese: "icon-017.png",
  eggs: "icon-026.png",
  spinach: "icon-139.png",
  carrot: "icon-066.png",
  apple: "icon-110.png",
  berries: "icon-132.png",
  meat: "icon-015.png",
  leftovers: "icon-007.png",
};
const CURATED_MANIFEST_IDS = new Set([163, 164, 17, 26, 139, 66, 110, 132, 15, 7]);

interface FoodIconManifestEntry {
  id: number;
  file: string;
  label: string;
  w: number;
  h: number;
}

// Descriptive words in the manifest labels that describe form/color rather than the food
// itself (e.g. "bacon strip" -> the food is "bacon", "strip" just describes its shape).
const ICON_LABEL_STOPWORDS = new Set([
  "strip", "slice", "slices", "bowl", "jar", "cup", "piece", "pieces", "cluster", "plate", "roll",
  "loaf", "chunk", "pile", "wedge", "dish", "drink", "mug", "glass", "can", "bar", "square", "twist",
  "twisted", "swirl", "sprig", "bunch", "pair", "half", "small", "large", "tall", "dark", "light",
  "white", "red", "brown", "pink", "green", "yellow", "tan", "purple", "dried", "fried", "roasted",
  "folded", "spotted", "curled", "soft", "hot", "iced", "with", "and", "of", "the", "cap", "capped",
]);

function deriveKeywordsFromLabel(label: string): string[] {
  const words = label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[/\s]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !ICON_LABEL_STOPWORDS.has(w));
  return Array.from(new Set(words));
}

const DAIRY_GROUP_KEYWORDS = ["cheese", "cream", "milk", "yogurt", "butter", "egg"];
const PROTEIN_GROUP_KEYWORDS = ["bacon", "ham", "beef", "chicken", "drumstick", "sausage", "steak", "shrimp", "meat", "mussel", "oyster", "dumpling", "pork"];
const PRODUCE_GROUP_KEYWORDS = [
  "onion", "mushroom", "tomato", "carrot", "corn", "potato", "pea", "pumpkin", "bean", "parsnip", "chili",
  "cauliflower", "cucumber", "cabbage", "broccoli", "parsley", "beet", "grape", "garlic", "lime", "eggplant",
  "apple", "cherry", "pear", "peach", "pineapple", "dragonfruit", "pomegranate", "berry", "berries",
  "watermelon", "asparagus", "herb", "lavender", "clover", "truffle", "flower",
];

function guessGroupForLabel(label: string): string {
  const q = label.toLowerCase();
  if (DAIRY_GROUP_KEYWORDS.some((k) => q.includes(k))) return "dairy";
  if (PROTEIN_GROUP_KEYWORDS.some((k) => q.includes(k))) return "protein";
  if (PRODUCE_GROUP_KEYWORDS.some((k) => q.includes(k))) return "produce";
  return "leftovers";
}

// The asset pack's manifest.json labels were visually spot-checked against their actual
// pixel art (see contact-sheet review of all 164 icons) and turned out to be scrambled
// across a big chunk of the set. Corrections have since been folded directly into
// manifest.json for every id that got a hand-verified re-label there; this map only
// covers the remaining confirmed mismatches that manifest.json doesn't fix yet, so it
// never overrides a label someone has deliberately edited at the source.
const LABEL_OVERRIDES: Record<number, string> = {
  52: "rolled wrap",
  62: "cream soup bowl",
  63: "cream dip bowl",
  65: "herb sprig",
  72: "mixed salad plate",
  79: "cabbage",
  84: "sliced deli meat",
  90: "cucumber slice",
  92: "lettuce",
  93: "broccoli",
  94: "radish",
  95: "grapes",
  97: "lime",
  98: "eggplant",
};

const extraIconEntries = (foodIconManifest as FoodIconManifestEntry[])
  .filter((m) => !CURATED_MANIFEST_IDS.has(m.id))
  .map((m) => {
    const label = LABEL_OVERRIDES[m.id] ?? m.label;
    return {
      key: `icon${m.id}`,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      file: m.file,
      keywords: deriveKeywordsFromLabel(label),
      group: guessGroupForLabel(label),
    };
  });

export const FOOD_ICON_KEYS: string[] = [...CURATED_ICON_KEYS, ...extraIconEntries.map((e) => e.key)];

export const ICON_LABELS: Record<string, string> = {
  milk: "Milk",
  yogurt: "Yogurt",
  cheese: "Cheese",
  eggs: "Eggs",
  spinach: "Spinach",
  carrot: "Carrots",
  apple: "Apples",
  berries: "Berries",
  meat: "Meat",
  leftovers: "Leftovers",
  ...Object.fromEntries(extraIconEntries.map((e) => [e.key, e.label])),
};

export const FOOD_ICON_IMAGES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CURATED_ICON_FILES).map(([key, file]) => [key, `/images/thatfridge/food-icons/${file}`])),
  ...Object.fromEntries(extraIconEntries.map((e) => [e.key, `/images/thatfridge/food-icons/${e.file}`])),
};

export const FOOD_GROUP_LABELS: Record<string, string> = {
  dairy: "dairy",
  produce: "produce",
  protein: "protein",
  leftovers: "meal-prep",
};

export const ICON_SECTION: Record<string, string> = {
  milk: "dairy",
  yogurt: "dairy",
  cheese: "dairy",
  eggs: "dairy",
  spinach: "produce",
  carrot: "produce",
  apple: "produce",
  berries: "produce",
  meat: "protein",
  leftovers: "leftovers",
  ...Object.fromEntries(extraIconEntries.map((e) => [e.key, e.group])),
};

const ICON_KEYWORDS: Record<string, string[]> = {
  milk: ["milk"],
  yogurt: ["yogurt", "yoghurt"],
  cheese: ["cheese", "cheddar", "mozzarella", "parmesan", "brie", "feta"],
  eggs: ["egg"],
  spinach: ["spinach", "kale", "lettuce", "greens", "salad"],
  carrot: ["carrot"],
  apple: ["apple"],
  berries: ["berry", "berries", "strawberr", "blueberr", "raspberr"],
  // Specific proteins (bacon, chicken, steak, etc.) are deliberately left out here — they now
  // resolve to their own specific icon via the food-icons manifest below, instead of this
  // generic fallback. "meat"/"pork" stay since there's no more specific icon for either.
  meat: ["meat", "pork"],
  leftovers: ["leftover", "soup", "stew", "casserole", "takeout", "take-out"],
};

export function guessIcon(name: string): string | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  // Match against every keyword across curated + extra icons, and prefer the longest/most
  // specific keyword match (e.g. "eggplant" should resolve to the eggplant icon, not "eggs",
  // even though "egg" is technically a substring of "eggplant").
  let best: { key: string; len: number } | null = null;
  for (const icon of CURATED_ICON_KEYS) {
    const kw = ICON_KEYWORDS[icon]?.find((k) => q.includes(k));
    if (kw && (!best || kw.length > best.len)) best = { key: icon, len: kw.length };
  }
  for (const entry of extraIconEntries) {
    const kw = entry.keywords.find((k) => q.includes(k));
    if (kw && (!best || kw.length > best.len)) best = { key: entry.key, len: kw.length };
  }
  return best?.key ?? null;
}

// Mirrors AgentService::fallbackItemSuggestion's table in the backend (backend/app/Services/AgentService.php) -
// keep both in sync if you change one. This client-side copy exists only for paths that need an instant,
// offline default (as-you-type icon preview, and the first pass on receipt/photo-scanned items before the
// user reviews them) where a network round-trip per item isn't appropriate. The barcode-scan path and the
// explicit "Auto-fill" button both call the real AgentService::suggestItemDetails endpoint instead and only
// reach this table if that call fails.
const DEFAULT_SHELF_LIFE_DAYS: Record<string, number> = {
  milk: 7,
  yogurt: 14,
  cheese: 21,
  eggs: 21,
  spinach: 5,
  carrot: 14,
  apple: 14,
  berries: 5,
  meat: 3,
  leftovers: 4,
};

export function suggestShelfLifeDays(icon: string): number {
  return DEFAULT_SHELF_LIFE_DAYS[icon] ?? 7;
}

export const STORAGE_LOCATIONS: { key: StorageLocation; label: string; short: string; blurb: string; color: string }[] = [
  { key: "fridge", label: "Fridge", short: "Fr", blurb: "Everyday chilled items", color: "#2f6fb0" },
  { key: "freezer", label: "Freezer", short: "Fz", blurb: "Long-term frozen items", color: "#3f5c85" },
  { key: "pantry", label: "Pantry", short: "Pa", blurb: "Shelf-stable, room temp", color: "#b5702f" },
];

export const RECIPE_CATEGORIES: { key: RecipeCategory; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "dessert", label: "Dessert" },
  { key: "snack", label: "Snack" },
  { key: "quick", label: "Quick meal" },
];

const FREEZER_KEYWORDS = ["frozen", "ice cream", "popsicle", "gelato", "freezer"];
const PANTRY_KEYWORDS = ["can of", "canned", "pasta", "rice", "cereal", "cracker", "chips", "flour", "sugar", "bread", "jar", "sauce", "oil", "vinegar", "beans", "noodle", "granola", "nuts"];

export function guessLocation(name: string): StorageLocation {
  const q = name.trim().toLowerCase();
  if (FREEZER_KEYWORDS.some((k) => q.includes(k))) return "freezer";
  if (PANTRY_KEYWORDS.some((k) => q.includes(k))) return "pantry";
  return "fridge";
}

// Alternate fridge look photos (the hero photo remains the default "Original photo" option).
export const FRIDGE_STYLES: FridgeStyleDef[] = [
  { key: "classic", label: "Classic Blue", photo: "/images/thatfridge/fridge-classic.png", bg: "#4a89c9" },
  { key: "french", label: "French Door", photo: "/images/thatfridge/fridge-french.png", bg: "#dbe6f2" },
  { key: "retro", label: "Retro Mint", photo: "/images/thatfridge/fridge-retro.png", bg: "#8fcda6" },
  { key: "mini", label: "Mini Bar", photo: "/images/thatfridge/fridge-mini.png", bg: "#eaf3fb" },
];

// Pixel-agent crew — chibi character with thick black outline, hat, apron and a held prop, recolored per role.
const AGENT_BODY = [
  "..kkkkkkkk..",
  ".kwwwwwwwwk.",
  ".kwwwwwwwwk.",
  ".kwwwwwwwwk.",
  "..kkkkkkkk..",
  "...kssssk...",
  "..ksseessk..",
  "..kssssssk..",
  "...kbbbbk...",
  ".kbaaaaabk..",
  "wpkaaaaaak..",
  ".wkaaaaaak..",
  "..kaaaaaak..",
  "...kddddk...",
  "...kd..dk...",
  "..kkk..kkk..",
];
ICONS.agentChef = makeIcon(AGENT_BODY, {
  k: "#1a1a1a", w: "#f7f5ef", s: "#e8b98a", e: "#1a1a1a", b: "#4a6fa5", a: "#e0c39a", p: "#9db3c9", d: "#2b3542",
});
ICONS.agentGuardian = makeIcon(AGENT_BODY, {
  k: "#1a1a1a", w: "#8fa8c9", s: "#e8b98a", e: "#1a1a1a", b: "#3f5c85", a: "#5f7c9e", p: "#f0b93d", d: "#2b3542",
});
ICONS.agentOrganizer = makeIcon(AGENT_BODY, {
  k: "#1a1a1a", w: "#f0b93d", s: "#e8b98a", e: "#1a1a1a", b: "#2f6f47", a: "#3f8f5c", p: "#eef2f6", d: "#2b3542",
});
ICONS.agentShopkeeper = makeIcon(AGENT_BODY, {
  k: "#1a1a1a", w: "#c9a769", s: "#e8b98a", e: "#1a1a1a", b: "#8a3320", a: "#c1452e", p: "#f6f3ec", d: "#2b3542",
});

export const AGENTS: Agent[] = [
  { id: "chef", name: "Chef", icon: "agentChef", summary: "Suggests meals from what you already have, prioritizing items closest to expiry." },
  { id: "guardian", name: "Guardian", icon: "agentGuardian", summary: "Watches food safety and flags risky or uncertain items before they go bad." },
  { id: "organizer", name: "Organizer", icon: "agentOrganizer", summary: "Tells you where to store each item and keeps fridge, freezer and pantry tidy." },
  { id: "shopkeeper", name: "Shopkeeper", icon: "agentShopkeeper", summary: "Builds your next grocery list and tells you what not to rebuy." },
];

export const EMPTY_ICON: IconData = { cells: [], cols: 1, rows: 1 };
