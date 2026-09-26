<?php

namespace App\Support;

/**
 * Calories per serving from ingredient NAMES alone, via NutritionTable. Deterministic and free:
 * each recognised ingredient contributes kcal/100g x its typical grams in one serving. It reports
 * how many ingredients it recognised so the caller can decide whether to trust the number or ask
 * the model (RecipeCalorieService).
 */
final class RecipeCalories
{
    /** @var list<array{pattern: string, kcal: int, grams: int}>|null keywords, longest first */
    private static ?array $index = null;

    /**
     * @param  list<array{name?: string, icon?: string}>  $ingredients
     * @return array{kcal: float, matched: int, total: int, unmatched: list<string>}
     */
    public static function estimate(array $ingredients): array
    {
        $kcal = 0.0;
        $matched = 0;
        $unmatched = [];
        $total = 0;

        foreach ($ingredients as $ingredient) {
            $name = trim((string) ($ingredient['name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $total++;
            $value = self::ingredientKcal($name, $ingredient['icon'] ?? null);
            if ($value === null) {
                $unmatched[] = $name;

                continue;
            }
            $matched++;
            $kcal += $value;
        }

        return ['kcal' => $kcal, 'matched' => $matched, 'total' => $total, 'unmatched' => $unmatched];
    }

    /** kcal one serving gets from this ingredient, or null when nothing in the table matches. */
    public static function ingredientKcal(string $name, ?string $icon = null): ?float
    {
        $clean = self::normalize($name);

        // "chicken or beef" -> the average of what it could be; "salt and pepper" -> both add up.
        $options = [];
        foreach (preg_split('/\s+or\s+|\s*\/\s*/u', $clean) ?: [] as $alternative) {
            $sum = 0.0;
            $any = false;
            foreach (preg_split('/\s+and\s+|\s*[,&+]\s*/u', $alternative) ?: [] as $part) {
                $hit = self::lookup($part);
                if ($hit !== null) {
                    $sum += $hit['kcal'] / 100 * $hit['grams'];
                    $any = true;
                }
            }
            if ($any) {
                $options[] = $sum;
            }
        }
        if ($options !== []) {
            return array_sum($options) / count($options);
        }

        // The name is unknown but its icon may still say what it is (only the curated icon keys).
        $hint = $icon !== null ? (NutritionTable::ICON_HINTS[$icon] ?? null) : null;
        $hit = $hint !== null ? self::lookup($hint) : null;

        return $hit !== null ? $hit['kcal'] / 100 * $hit['grams'] : null;
    }

    /**
     * kcal for a meal TITLE ("Banana", "Chicken rice", "Egg fried rice"): unlike one ingredient it may
     * name several foods, so every recognised food adds a typical portion - the longest keyword first,
     * removed from the text, then the next. "or" still averages; "and" / "," / "+" separate foods.
     * Null when nothing is recognised (the caller then shows no estimate rather than a guess).
     */
    public static function mealKcal(string $title): ?float
    {
        $options = [];
        foreach (preg_split('/\s+or\s+|\s*\/\s*/u', self::normalize($title)) ?: [] as $alternative) {
            $sum = 0.0;
            $any = false;
            foreach (preg_split('/\s+and\s+|\s*[,&+]\s*/u', $alternative) ?: [] as $part) {
                $remaining = $part;
                for ($i = 0; $i < 6; $i++) {
                    $row = self::lookup($remaining);
                    if ($row === null) {
                        break;
                    }
                    $sum += $row['kcal'] / 100 * $row['grams'];
                    $any = true;
                    $remaining = trim(preg_replace($row['pattern'], ' ', $remaining, 1) ?? '');
                }
            }
            if ($any) {
                $options[] = $sum;
            }
        }

        return $options === [] ? null : array_sum($options) / count($options);
    }

    /** Lowercase, drop "(...)" notes, a leading quantity + unit, and size / prep words that change nothing here. */
    private static function normalize(string $name): string
    {
        $name = mb_strtolower($name);
        $name = preg_replace('/\([^)]*\)/u', ' ', $name) ?? $name;
        $name = preg_replace('/^\s*[\d\x{00BC}-\x{00BE}.\/\-\s]+\s*(?:kg|gm|g|grams?|ml|l|litres?|liters?|cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|lbs?|pcs?|pieces?|slices?|cloves?|cans?|packs?|pkts?|bunch(?:es)?)?\b\s*(?:of\s+)?/u', '', $name) ?? $name;
        $name = preg_replace('/\b(?:fresh|frozen|chopped|diced|sliced|grated|large|small|medium|boneless|skinless|organic|whole)\b/u', ' ', $name) ?? $name;

        return trim(preg_replace('/\s+/u', ' ', $name) ?? $name);
    }

    /** @return array{kcal: int, grams: int, pattern: string}|null the longest matching keyword's entry */
    private static function lookup(string $text): ?array
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        foreach (self::index() as $row) {
            if (preg_match($row['pattern'], $text) === 1) {
                return ['kcal' => $row['kcal'], 'grams' => $row['grams'], 'pattern' => $row['pattern']];
            }
        }

        return null;
    }

    /** @return list<array{pattern: string, kcal: int, grams: int}> */
    private static function index(): array
    {
        if (self::$index !== null) {
            return self::$index;
        }

        $rows = [];
        foreach (NutritionTable::ENTRIES as [$keywords, $kcal, $grams]) {
            foreach (explode('|', $keywords) as $keyword) {
                // Whole words only (the icon matcher's plain-substring matching is exactly what
                // this must avoid), tolerating a plural: "eggs", "tomatoes", "carrots".
                $rows[] = [
                    'length' => strlen($keyword),
                    'pattern' => '/(?<![a-z])'.preg_quote($keyword, '/').'(?:es|s)?(?![a-z])/u',
                    'kcal' => $kcal,
                    'grams' => $grams,
                ];
            }
        }
        usort($rows, fn ($a, $b) => $b['length'] <=> $a['length']);

        return self::$index = array_map(fn ($r) => ['pattern' => $r['pattern'], 'kcal' => $r['kcal'], 'grams' => $r['grams']], $rows);
    }
}
