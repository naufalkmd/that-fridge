import fs from "fs";
const manifest = JSON.parse(fs.readFileSync("packages/core/src/food-icon-manifest.json", "utf8"));
const CURATED_MANIFEST_IDS = new Set([163, 164, 17, 26, 139, 66, 110, 132, 15, 7]);
const STOP = new Set(["strip","slice","slices","bowl","jar","cup","piece","pieces","cluster","plate","roll","loaf","chunk","pile","wedge","dish","drink","mug","glass","can","bar","square","twist","twisted","swirl","sprig","bunch","pair","half","small","large","tall","dark","light","white","red","brown","pink","green","yellow","tan","purple","dried","fried","roasted","folded","spotted","curled","soft","hot","iced","with","and","of","the","cap","capped"]);
const deriveKeywords = (label) => Array.from(new Set(label.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[/\s]+/).map((w) => w.trim()).filter((w) => w.length > 2 && !STOP.has(w))));
const N_DAIRY = ["cheese","cream","milk","yogurt","yoghurt","butter"];
const N_PROTEIN = ["bacon","ham","beef","chicken","drumstick","sausage","steak","shrimp","meat","mussel","oyster","dumpling","pork","egg","tofu","bean","legume","lentil","chickpea","fish","salmon","tuna"];
const N_VEG = ["onion","mushroom","tomato","carrot","corn","pea","pumpkin","parsnip","chili","cauliflower","cucumber","cabbage","broccoli","parsley","beet","garlic","eggplant","asparagus","herb","lettuce","kale","spinach","radish","artichoke","zucchini","squash","celery","leek"];
const N_FRUIT = ["apple","cherry","pear","peach","pineapple","dragonfruit","pomegranate","berry","berries","watermelon","grape","lime","lemon","orange","mango","banana","melon","kiwi","plum","fig"];
const N_GRAIN = ["rice","bread","pasta","potato","cereal","oat","noodle","wheat","tortilla","bagel","waffle","pancake","quinoa","grain","dough","toast","bun","roll","wrap"];
const nutritionFor = (label) => { const q = label.toLowerCase(); if (N_DAIRY.some((k) => q.includes(k))) return "dairy"; if (N_PROTEIN.some((k) => q.includes(k))) return "protein"; if (N_VEG.some((k) => q.includes(k))) return "vegetables"; if (N_FRUIT.some((k) => q.includes(k))) return "fruit"; if (N_GRAIN.some((k) => q.includes(k))) return "grains"; return "other_extras"; };
const LABEL_OVERRIDES = {52:"rolled wrap",62:"cream soup bowl",63:"cream dip bowl",65:"herb sprig",72:"mixed salad plate",79:"cabbage",84:"sliced deli meat",90:"cucumber slice",92:"lettuce",93:"broccoli",94:"radish",95:"grapes",97:"lime",98:"eggplant"};
const entries = manifest.filter((m) => !CURATED_MANIFEST_IDS.has(m.id)).map((m) => { const label = LABEL_OVERRIDES[m.id] ?? m.label; return { key: `icon${m.id}`, label: label.charAt(0).toUpperCase() + label.slice(1), file: m.file, keywords: deriveKeywords(label), nutritionCategory: nutritionFor(label) }; });
fs.writeFileSync("packages/core/src/food-icons.generated.ts", `// GENERATED from food-icon-manifest.json by scripts/gen-food-icons.mjs — do not edit by hand.\n// The ~154 non-curated icons from the food-icons asset pack, with keywords + nutrition\n// category derived from each manifest label (mirrors apps/web/lib/thatfridge/data.ts).\nimport type { NutritionCategory } from "./types";\n\nexport interface ExtraIconEntry {\n  key: string;\n  label: string;\n  file: string;\n  keywords: string[];\n  nutritionCategory: NutritionCategory;\n}\n\nexport const EXTRA_ICON_ENTRIES: ExtraIconEntry[] = ${JSON.stringify(entries, null, 2)};\n`);

// Same entries, serialized as a PHP array literal - keeps AgentToolbox/BarcodeService/
// ReceiptService/PhotoService (App\Support\FoodIconMatcher) matching against the exact same
// keyword pack as the frontend's guessFoodIcon(), instead of a hand-copied, permanently-
// drifting subset.
const phpStr = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const phpArr = (items) => `[${items.join(", ")}]`;
const phpEntries = entries.map((e) => `    ${phpStr(e.key)} => ['keywords' => ${phpArr(e.keywords.map(phpStr))}, 'nutrition_category' => ${phpStr(e.nutritionCategory)}],`).join("\n");
// Named FoodIconKeywords.php, NOT ...generated.php - PSR-4 autoloading requires the filename
// to exactly match the class name, unlike the TS side's import-by-path. The header comment is
// the "don't hand-edit" signal here instead (standard for generated PHP classes).
fs.writeFileSync("backend/app/Support/FoodIconKeywords.php", `<?php\n\n// GENERATED from food-icon-manifest.json by scripts/gen-food-icons.mjs - do not edit by hand.\n// PHP mirror of packages/core/src/food-icons.generated.ts's EXTRA_ICON_ENTRIES - see\n// App\\Support\\FoodIconMatcher for the curated (hand-tuned, non-generated) 10 entries.\n\nnamespace App\\Support;\n\nclass FoodIconKeywords\n{\n    public const EXTRA = [\n${phpEntries}\n    ];\n}\n`);

console.log(`wrote ${entries.length} entries (TS + PHP)`);
