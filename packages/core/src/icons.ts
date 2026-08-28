// Hand-drawn pixel food icons — ported from apps/web/lib/thatfridge/data.ts `ICONS`.
// Each is a small colour grid; renderers draw it blocky. The web also has a 165-PNG
// asset pack + AI-generated icons; mobile ships just these core grids for now and falls
// back to name initials for everything else.

import type { IconData } from "./types";

function makeIcon(rows: string[], legend: Record<string, string>): IconData {
  const cells: (string | null)[] = [];
  for (const row of rows) for (const ch of row) cells.push(ch === "." ? null : legend[ch]);
  return { cells, cols: rows[0].length, rows: rows.length };
}

export const FOOD_ICONS: Record<string, IconData> = {
  milk: makeIcon(
    ["..aaaa..", ".abbbba.", ".accccc.", ".ccccccc", ".ccdcccc", ".ccccccc", ".ccccccc", "..ccccc."],
    { a: "#8fa8c9", b: "#3f5c85", c: "#f6f3ec", d: "#3f5c85" },
  ),
  eggs: makeIcon(
    ["........", ".ee..ee.", "eff.eff.", "efffefff", "efffefff", ".efff.e.", "..ee....", "........"],
    { e: "#c9a769", f: "#faf3e2" },
  ),
  spinach: makeIcon(
    ["..g..g..", ".ghg.ghg", "ghhgghhg", "ghhhhhhg", ".ghhhhg.", "..gigi..", "...ii...", "........"],
    { g: "#3f7d4a", h: "#5fa668", i: "#7a8f52" },
  ),
  cheese: makeIcon(
    ["........", "jjjjjjj.", "jkjkjkj.", "jjkjkjj.", "jkjkjkj.", "jjjjjjj.", "........", "........"],
    { j: "#f0b93d", k: "#e2a422" },
  ),
  apple: makeIcon(
    ["...l....", "..mmm...", ".nnnnn..", "nnnnnnn.", "nnnnnnn.", ".nnnnn..", "..nnn...", "........"],
    { l: "#5fa668", m: "#8a5a34", n: "#c94f3c" },
  ),
  leftovers: makeIcon(
    ["........", "oooooooo", "opppppo.", "opppppo.", "opppppo.", "oooooooo", "........", "........"],
    { o: "#b9c2c9", p: "#dfe6ea" },
  ),
  yogurt: makeIcon(
    [".qqqqqq.", ".rrrrrr.", ".rssssr.", ".rssssr.", ".rssssr.", "..rrrr..", "........", "........"],
    { q: "#3f5c85", r: "#e8ecef", s: "#f6f3ec" },
  ),
  meat: makeIcon(
    ["........", "..ttt...", ".ttuuutt", "ttuuuutt", ".ttuuutt", "..ttt...", "........", "........"],
    { t: "#b5502f", u: "#dd8a63" },
  ),
  berries: makeIcon(
    ["........", ".v.v.v..", "vwwvwwv.", "wwwwwww.", ".wwwww..", "..www...", "........", "........"],
    { v: "#4c6b3a", w: "#5a3a6b" },
  ),
  carrot: makeIcon(
    ["..x.x...", "..xxx...", "..yyy...", ".yyyy...", "yyyyy...", ".yyy....", "..y.....", "........"],
    { x: "#5fa668", y: "#dd7a2f" },
  ),
};

const KEYWORDS: Record<string, string[]> = {
  milk: ["milk"],
  yogurt: ["yogurt", "yoghurt"],
  cheese: ["cheese", "cheddar", "mozzarella", "parmesan", "brie", "feta", "butter"],
  eggs: ["egg"],
  spinach: ["spinach", "kale", "lettuce", "greens", "salad", "broccoli"],
  carrot: ["carrot"],
  apple: ["apple", "pear"],
  berries: ["berry", "berries", "strawberr", "blueberr", "raspberr", "grape"],
  meat: ["meat", "pork", "chicken", "beef", "steak", "bacon", "sausage", "turkey", "fish", "salmon"],
  leftovers: ["leftover", "soup", "stew", "casserole", "takeout", "take-out", "pasta", "rice", "bread"],
};

/** Resolve an item's stored icon key (or its name) to one of the core pixel grids. */
export function resolveFoodIcon(iconKey: string | null | undefined, name: string): IconData | null {
  if (iconKey && FOOD_ICONS[iconKey]) return FOOD_ICONS[iconKey];
  const q = `${iconKey ?? ""} ${name}`.toLowerCase();
  for (const [key, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => q.includes(w))) return FOOD_ICONS[key];
  }
  return null;
}
