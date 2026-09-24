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
