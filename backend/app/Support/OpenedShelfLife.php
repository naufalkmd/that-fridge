<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * A conservative estimate of how long opening affects a food, not a safety guarantee.
 * Refrigerated prepared foods, deli meat, eggs, milk and cheese use USDA/FoodSafety.gov
 * guidance; pantry values are quality estimates and never extend the printed date.
 * https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts
 * https://ask.fsis.usda.gov/article/How-long-can-you-keep-dairy-products-like-yogurt-milk-and-cheese-in-the-refrigerator
 */
final class OpenedShelfLife
{
    public static function canLengthen(string $name, ?string $location): bool
    {
        $q = Str::lower($name);

        return $location === 'freezer' || self::hasAny($q, [
            'jam', 'jelly', 'pickle', 'ketchup', 'mustard', 'soy sauce',
            'honey', 'oil', 'vinegar',
        ]);
    }

    /** @return array{openable: bool, days: ?int, source: string} */
    public static function resolve(
        string $name,
        ?string $icon,
        ?string $location,
        ?string $group,
        ?int $itemShelfLifeDays = null,
        ?int $overrideDays = null,
    ): array {
        if ($overrideDays !== null) {
            return self::yes($overrideDays, 'user');
        }

        $q = trim(Str::lower($name));
        foreach ([
            'eggplant' => [false, null],
            'egg noodles' => [true, $itemShelfLifeDays ?? 180],
            'liquid egg' => [true, 3],
            'cream cheese' => [true, 7],
            'cottage cheese' => [true, 7],
            'peanut butter' => [true, 30],
            'coconut milk' => [true, 7],
            'deli meat' => [true, 3],
            'hard cheese' => [true, 21],
            'soft cheese' => [true, 7],
        ] as $term => [$openable, $days]) {
            if (self::has($q, $term)) {
                return $openable ? self::yes($days, 'rule') : self::no();
            }
        }

        // Shell eggs and whole produce have no meaningful opening event. A name that says
        // "liquid egg" or "egg noodles" was handled above, before this broad rule.
        if (self::hasAny($q, ['egg', 'eggs']) || $icon === 'eggs') {
            return self::no();
        }

        $packaged = self::hasAny($q, [
            'canned', 'can', 'jar', 'bottle', 'carton', 'juice', 'sauce', 'paste',
            'puree', 'dried', 'frozen', 'pack', 'liquid',
        ]);

        if (self::hasAny($q, ['cooked', 'leftover', 'leftovers', 'homemade', 'cut']) && ! $packaged) {
            return self::no();
        }
        if (! $packaged && ($group === 'fruit' || $group === 'vegetables') &&
            ! self::hasAny($q, ['jam', 'pickle', 'hummus'])) {
            return self::no();
        }
        if (! $packaged && self::hasAny($q, ['herb', 'herbs', 'raw meat', 'fresh fish', 'whole fish'])) {
            return self::no();
        }

        if ($location === 'freezer') {
            return self::yes($itemShelfLifeDays ?? 90, 'rule');
        }

        foreach ([
            'milk' => 7, 'yogurt' => 7, 'yoghurt' => 7, 'cream' => 7,
            'hummus' => 5, 'cheese' => 7, 'juice' => 7,
            'butter' => 14, 'salsa' => 14,
            'jam' => 30, 'pickle' => 30, 'ketchup' => 30, 'mustard' => 30,
            'soy sauce' => 30, 'honey' => 180, 'oil' => 30,
        ] as $term => $days) {
            if (self::has($q, $term)) {
                return self::yes($days, 'rule');
            }
        }

        if ($location === 'pantry' && self::hasAny($q, ['dried', 'pasta', 'rice', 'flour', 'cereal', 'cracker'])) {
            return self::yes($itemShelfLifeDays ?? 180, 'rule');
        }

        if ($packaged) {
            return self::yes(self::hasAny($q, ['canned', 'can']) ? 3 : 7, 'rule');
        }

        $defaults = [
            'dairy' => 5, 'vegetables' => 4, 'fruit' => 3,
            'grains' => 5, 'protein' => 3, 'other_extras' => 14,
        ];

        return self::yes($defaults[$group] ?? 3, 'default');
    }

    private static function yes(int $days, string $source): array
    {
        return ['openable' => true, 'days' => max(1, min(365, $days)), 'source' => $source];
    }

    private static function no(): array
    {
        return ['openable' => false, 'days' => null, 'source' => 'rule'];
    }

    private static function hasAny(string $name, array $terms): bool
    {
        foreach ($terms as $term) {
            if (self::has($name, $term)) {
                return true;
            }
        }

        return false;
    }

    private static function has(string $name, string $term): bool
    {
        return preg_match('/(?<!\pL)'.preg_quote($term, '/').'(?!\pL)/u', $name) === 1;
    }
}
