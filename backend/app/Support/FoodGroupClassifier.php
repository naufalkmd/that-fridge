<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Deterministic food-group ("nutrition_category") classification, checked before ever
 * spending an AI call on it. Four layers, most trustworthy first:
 *
 *  1. SPECIFIC_TERMS - multi-word (or otherwise ambiguous) terms that a shorter keyword
 *     elsewhere would misclassify on its own - e.g. "peanut butter" contains "butter", which
 *     alone means dairy, but the item itself is far more protein than dairy. Checked whole,
 *     word-boundary matched, before anything else.
 *  2. A direct lookup of the item's own already-assigned pixel-icon key (when given) via
 *     FoodIconMatcher::nutritionCategoryFor() - a known key, not a fuzzy re-guess, so this is
 *     as reliable as (2) below without any matching risk of its own.
 *  3. KEYWORDS - a small, word-boundary-safe, single-word supplementary list.
 *  4. FoodIconMatcher's own icon *guess* (re-derived from the name), mapped to a category -
 *     reuses the icon picker's much larger corpus for broad coverage, but deliberately last:
 *     FoodIconMatcher::guess() matches plain substrings with no word boundary and was tuned
 *     for picking a plausible-looking icon, not for nutrition accuracy, so a handful of its
 *     keywords are too generic to trust first (e.g. "whole" or "raw" alone, meant to
 *     distinguish two chicken icons, would otherwise claim "Whole milk" or "Raw honey" for
 *     protein before layer 3's own precise "milk" ever gets a turn).
 *
 * classify() returns null - never a forced default like "other_extras" - when nothing
 * matches confidently. A wrong bucket is worse than an admittedly-unclassified item: it feeds
 * the Food Balance score and a user has to notice and fix it by hand either way, but a wrong
 * bucket looks confident while being silently misleading.
 *
 * resolve() adds a second null-avoiding layer on top: a global (cross-user) cache of names an
 * AI call has already classified, so the same item name never has to pay for another AI call
 * just because no keyword happened to cover it. remember() writes to that cache; call it only
 * after a real AI-derived answer, never with a locally-guessed one (classify() is already free
 * and instant, caching it would just waste cache space).
 */
class FoodGroupClassifier
{
    private const CACHE_TTL_DAYS = 90;

    /** Multi-word or otherwise ambiguous terms - checked whole, before any single-word
     *  keyword (here or in the icon corpus) gets a chance to misfire on part of the phrase.
     *  Longest match wins among these if more than one applies. */
    private const SPECIFIC_TERMS = [
        'peanut butter' => 'protein',
        'almond butter' => 'protein',
        'cashew butter' => 'protein',
        'nut butter' => 'protein',
        'butter chicken' => 'protein',
        'green bean' => 'vegetables',
        'green beans' => 'vegetables',
        'ice cream' => 'other_extras',
        'coconut milk' => 'other_extras',
        'oat milk' => 'other_extras',
        'almond milk' => 'other_extras',
        'soy milk' => 'other_extras',
    ];

    /** Supplementary single-word terms for common groceries the icon corpus (FoodIconMatcher/
     *  FoodIconKeywords) doesn't cover - kept small and food-group-specific, not a
     *  reimplementation of the icon picker's own much larger keyword list. */
    private const KEYWORDS = [
        'protein' => [
            'egg', 'meat', 'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'tofu',
            'tempeh', 'seitan', 'bean', 'chickpea', 'lentil', 'turkey', 'shrimp', 'prawn',
            'bacon', 'sausage', 'ham', 'nut', 'peanut', 'almond',
        ],
        'vegetables' => [
            'spinach', 'carrot', 'broccoli', 'lettuce', 'tomato', 'pepper', 'onion', 'potato',
            'cucumber', 'celery', 'kale', 'cabbage', 'mushroom', 'zucchini', 'courgette',
            'pea', 'corn', 'garlic',
        ],
        'fruit' => [
            'apple', 'banana', 'orange', 'berry', 'berries', 'grape', 'melon', 'mango',
            'peach', 'pear', 'lemon', 'lime', 'strawberry', 'strawberries', 'blueberry',
            'blueberries', 'pineapple', 'kiwi', 'cherry', 'cherries', 'plum',
        ],
        'grains' => [
            'bread', 'rice', 'pasta', 'noodle', 'cereal', 'oat', 'flour', 'tortilla',
            'cracker', 'bagel', 'quinoa', 'granola', 'couscous', 'bun',
        ],
        'dairy' => [
            'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'kefir',
        ],
        'other_extras' => [
            'sauce', 'oil', 'juice', 'soda', 'chips', 'candy', 'chocolate', 'cookie', 'jam',
            'jelly', 'dressing', 'snack', 'cake', 'vinegar', 'syrup', 'condiment', 'leftover',
        ],
    ];

    /**
     * Pure keyword classification - no cache, no I/O. Null means genuinely unclassifiable by
     * rule, not "try harder" - callers decide whether that's worth an AI call.
     *
     * $icon, when given, is the item's own already-assigned pixel-icon key (not re-derived
     * from $name) - a direct lookup against it is more reliable than re-guessing an icon from
     * the name, so it's tried right after the name's own specific-term match and before
     * falling back to re-deriving an icon guess from the name text.
     */
    public static function classify(string $name, ?string $icon = null): ?string
    {
        $q = trim(Str::lower($name));

        return self::matchSpecificTerm($q)
            ?? FoodIconMatcher::nutritionCategoryFor($icon)
            ?? self::matchKeyword($q)
            ?? FoodIconMatcher::nutritionCategoryFor(FoodIconMatcher::guess($q));
    }

    /** classify() first, then the cross-user AI-result cache - the two "don't spend an AI
     *  call" layers combined. Still null means the caller should actually ask the AI. */
    public static function resolve(string $name, ?string $icon = null): ?string
    {
        return self::classify($name, $icon) ?? Cache::get(self::cacheKey($name));
    }

    /** Remembers an AI-derived category for this (normalized) name so a future item with the
     *  same name - any user, any fridge - skips the AI call entirely. Only call this with a
     *  real AI answer; classify() already covers the free/instant case. */
    public static function remember(string $name, string $category): void
    {
        $key = self::cacheKey($name);
        if ($key === null) {
            return;
        }

        Cache::put($key, $category, now()->addDays(self::CACHE_TTL_DAYS));
    }

    private static function cacheKey(string $name): ?string
    {
        $q = trim(Str::lower($name));

        return $q === '' ? null : 'food_group:'.Str::slug($q);
    }

    private static function matchSpecificTerm(string $q): ?string
    {
        $best = null;
        $bestLen = 0;
        foreach (self::SPECIFIC_TERMS as $term => $category) {
            if (strlen($term) > $bestLen && self::containsWord($q, $term)) {
                $best = $category;
                $bestLen = strlen($term);
            }
        }

        return $best;
    }

    private static function matchKeyword(string $q): ?string
    {
        $best = null;
        $bestLen = 0;
        foreach (self::KEYWORDS as $category => $keywords) {
            foreach ($keywords as $kw) {
                if (strlen($kw) > $bestLen && self::containsWord($q, $kw)) {
                    $best = $category;
                    $bestLen = strlen($kw);
                }
            }
        }

        return $best;
    }

    /**
     * Word-boundary match with a regular-plural allowance - "pea" won't match inside
     * "peanut" (no boundary between the 'a' and the 'n'), but "onion"/"tomato" still match
     * "onions"/"tomatoes" via the optional (e?s) suffix. Irregular y-ending plurals
     * (berry/berries, cherry/cherries, ...) are listed as their own separate keywords above
     * rather than handled here, since English pluralization isn't regular enough for one
     * suffix rule to cover both cases.
     */
    private static function containsWord(string $haystack, string $term): bool
    {
        return (bool) preg_match('/\b'.preg_quote($term, '/').'(e?s)?\b/', $haystack);
    }
}
