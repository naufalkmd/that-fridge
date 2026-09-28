<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * The single icon-guessing algorithm every backend path shares - AgentToolbox (chat add_item/
 * bulk_add_items/save_recipe), BarcodeService, ReceiptService, and PhotoService all used to
 * carry their own independent, drifted logic (three of the four producing keys that don't
 * even exist in the icon pack, guaranteeing a fallback render every time). This mirrors
 * packages/core/src/food-icons.ts's guessFoodIcon() exactly: curated keywords first (hand-
 * tuned, richer than a label could auto-derive), then the generated pack
 * (FoodIconKeywords::EXTRA, kept in sync with the frontend by scripts/gen-food-icons.mjs),
 * longest keyword match wins.
 */
class FoodIconMatcher
{
    private const CURATED = [
        'milk' => ['milk'],
        'yogurt' => ['yogurt', 'yoghurt'],
        'cheese' => ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'feta'],
        'eggs' => ['egg'],
        'spinach' => ['spinach', 'kale', 'lettuce', 'greens', 'salad'],
        'carrot' => ['carrot'],
        'apple' => ['apple'],
        'berries' => ['berry', 'berries', 'strawberr', 'blueberr', 'raspberr'],
        'meat' => ['meat', 'pork', 'beef', 'steak', 'mince', 'chicken', 'sausage', 'bacon', 'ham'],
        'leftovers' => ['leftover', 'soup', 'stew', 'casserole'],
    ];

    /** The curated keys' images, as in packages/core/src/food-icons.ts (CURATED_ICON_FILES). */
    private const CURATED_FILES = [
        'milk' => 'icon-163.png', 'yogurt' => 'icon-164.png', 'cheese' => 'icon-017.png', 'eggs' => 'icon-026.png',
        'spinach' => 'icon-139.png', 'carrot' => 'icon-066.png', 'apple' => 'icon-110.png', 'berries' => 'icon-132.png',
        'meat' => 'icon-015.png', 'leftovers' => 'icon-007.png',
    ];

    /** The pack image for an icon key (served from public/food-icons, a copy of the app's pack), or null. */
    public static function fileFor(?string $key): ?string
    {
        if ($key === null) {
            return null;
        }
        if (isset(self::CURATED_FILES[$key])) {
            return self::CURATED_FILES[$key];
        }
        if (preg_match('/^icon(\d+)$/', $key, $m) && isset(FoodIconKeywords::EXTRA[$key])) {
            return sprintf('icon-%03d.png', (int) $m[1]);
        }

        return null;
    }

    public static function imageUrl(?string $key): ?string
    {
        $file = self::fileFor($key);

        return $file ? asset('food-icons/'.$file) : null;
    }

    /**
     * Every pack icon for a picker: key => a short label (its keywords).
     *
     * @return array<string, string>
     */
    public static function packOptions(): array
    {
        $out = [];
        foreach (self::CURATED as $key => $keywords) {
            $out[$key] = implode(', ', array_slice($keywords, 0, 3));
        }
        foreach (FoodIconKeywords::EXTRA as $key => $entry) {
            $out[$key] = implode(', ', $entry['keywords']) ?: $key;
        }

        return $out;
    }

    private const CURATED_NUTRITION = [
        'eggs' => 'protein', 'meat' => 'protein',
        'milk' => 'dairy', 'yogurt' => 'dairy', 'cheese' => 'dairy',
        'spinach' => 'vegetables', 'carrot' => 'vegetables',
        'apple' => 'fruit', 'berries' => 'fruit',
        'leftovers' => 'other_extras',
    ];

    /** Best icon key for a name across the whole pack, or null if nothing matches - callers
     *  decide the no-match fallback (never a real-but-generic key like 'leftovers', which
     *  would block the frontend's own name-based re-guess - see FoodIcon's fallback chain). */
    public static function guess(string $name): ?string
    {
        $q = Str::lower(trim($name));
        if ($q === '') {
            return null;
        }

        $best = null;
        $bestLen = 0;

        foreach (self::CURATED as $key => $keywords) {
            foreach ($keywords as $kw) {
                if (strlen($kw) > $bestLen && str_contains($q, $kw)) {
                    $best = $key;
                    $bestLen = strlen($kw);
                }
            }
        }

        foreach (FoodIconKeywords::EXTRA as $key => $entry) {
            foreach ($entry['keywords'] as $kw) {
                if (strlen($kw) > $bestLen && str_contains($q, $kw)) {
                    $best = $key;
                    $bestLen = strlen($kw);
                }
            }
        }

        return $best;
    }

    public static function nutritionCategoryFor(?string $iconKey): ?string
    {
        if ($iconKey === null) {
            return null;
        }

        return self::CURATED_NUTRITION[$iconKey] ?? FoodIconKeywords::EXTRA[$iconKey]['nutrition_category'] ?? null;
    }
}
