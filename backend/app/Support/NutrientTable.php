<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Protein, carbs, fat, fibre and sugar per 100 g for common plain foods, so an item's custom "Protein" field can be
 * worked out from its name and weight without asking a model. Rounded USDA-style figures (cooked weight for rice,
 * pasta, noodles and legumes), the same spirit as NutritionTable and deliberately short: only foods whose name is
 * unambiguous. A hit is accepted only when the WHOLE item name is that food plus harmless words ("fresh chicken
 * breast"), so "chicken rice" or a branded product falls through to the model instead of being guessed.
 * Each entry: [keywords separated by '|', protein, carbs, fat, fibre, sugar] in grams per 100 g.
 */
final class NutrientTable
{
    /** @var list<array{0: string, 1: float, 2: float, 3: float, 4: float, 5: float}> */
    private const ENTRIES = [
        // Meat, fish, eggs
        ['chicken breast|chicken fillet', 31, 0, 3.6, 0, 0], ['chicken thigh|chicken drumstick|chicken wing', 24, 0, 10, 0, 0],
        ['chicken', 27, 0, 8, 0, 0], ['beef mince|minced beef|ground beef|mince', 26, 0, 17, 0, 0],
        ['beef|steak|sirloin|ribeye', 26, 0, 15, 0, 0], ['lamb|mutton', 25, 0, 21, 0, 0], ['pork belly', 9, 0, 53, 0, 0],
        ['pork', 27, 0, 14, 0, 0], ['bacon', 37, 1.4, 42, 0, 0], ['ham', 21, 1.5, 5.5, 0, 0], ['sausage', 12, 2, 26, 0, 0],
        ['salmon', 20, 0, 13, 0, 0], ['tuna', 29, 0, 1, 0, 0], ['cod|snapper|tilapia|barramundi', 23, 0, 1, 0, 0],
        ['mackerel|kembung', 19, 0, 14, 0, 0], ['sardine', 25, 0, 11, 0, 0], ['prawn|shrimp', 24, 0.2, 0.3, 0, 0],
        ['squid|calamari|sotong', 16, 3, 1.4, 0, 0], ['egg|eggs', 12.6, 0.7, 9.5, 0, 0.4],
        // Soy, legumes, nuts
        ['tofu|beancurd', 8, 1.9, 4.8, 0.3, 0.6], ['tempeh|tempe', 20, 7.6, 11, 0, 0], ['lentil|lentils|dhal|dal', 9, 20, 0.4, 7.9, 1.8],
        ['chickpea|chickpeas', 8.9, 27, 2.6, 7.6, 4.8], ['peanut butter', 25, 20, 50, 6, 9], ['peanut|peanuts', 26, 16, 49, 8.5, 4.7],
        ['almond|almonds', 21, 22, 50, 12, 4.4], ['cashew|cashews', 18, 30, 44, 3.3, 5.9], ['walnut|walnuts', 15, 14, 65, 6.7, 2.6],
        // Dairy
        ['milk', 3.4, 4.8, 3.3, 0, 5], ['yogurt|yoghurt', 3.5, 4.7, 3.3, 0, 4.7], ['cheddar', 25, 1.3, 33, 0, 0.5],
        ['mozzarella', 22, 2.2, 22, 0, 1], ['parmesan', 38, 4.1, 29, 0, 0.9], ['cream cheese', 6, 4, 34, 0, 3.2],
        ['cheese', 23, 2, 28, 0, 0.5], ['butter', 0.9, 0.1, 81, 0, 0.1], ['ice cream', 3.5, 24, 11, 0.7, 21],
        // Grains and bread (cooked where that is how they are eaten)
        ['white rice|rice', 2.7, 28, 0.3, 0.4, 0], ['brown rice', 2.7, 25, 1, 1.8, 0.4], ['spaghetti|pasta|macaroni|penne', 5.8, 31, 0.9, 1.8, 0.6],
        ['noodle|noodles', 4.5, 25, 2, 1.2, 0.5], ['bread|toast', 9, 49, 3.2, 2.7, 5], ['oat|oats|oatmeal', 13, 68, 6.5, 10, 1],
        ['flour', 10, 76, 1, 2.7, 0.3], ['quinoa', 4.4, 21, 1.9, 2.8, 0.9], ['couscous', 3.8, 23, 0.2, 1.4, 0.1],
        // Vegetables
        ['potato|potatoes', 2, 17, 0.1, 2.2, 0.8], ['sweet potato', 1.6, 20, 0.1, 3, 4.2], ['carrot|carrots', 0.9, 9.6, 0.2, 2.8, 4.7],
        ['spinach', 2.9, 3.6, 0.4, 2.2, 0.4], ['broccoli', 2.8, 6.6, 0.4, 2.6, 1.7], ['cauliflower', 1.9, 5, 0.3, 2, 1.9],
        ['tomato|tomatoes', 0.9, 3.9, 0.2, 1.2, 2.6], ['cucumber', 0.7, 3.6, 0.1, 0.5, 1.7], ['onion|onions', 1.1, 9.3, 0.1, 1.7, 4.2],
        ['cabbage', 1.3, 5.8, 0.1, 2.5, 3.2], ['lettuce', 1.4, 2.9, 0.2, 1.3, 0.8], ['mushroom|mushrooms', 3.1, 3.3, 0.3, 1, 2],
        ['corn|sweetcorn', 3.3, 19, 1.4, 2.7, 3.2], ['pumpkin', 1, 6.5, 0.1, 0.5, 2.8], ['zucchini|courgette', 1.2, 3.1, 0.3, 1, 2.5],
        ['peas|pea', 5.4, 14, 0.4, 5.1, 5.7], ['capsicum|bell pepper', 1, 6, 0.3, 2.1, 4.2], ['garlic', 6.4, 33, 0.5, 2.1, 1],
        // Fruit
        ['banana|bananas', 1.1, 23, 0.3, 2.6, 12], ['apple|apples', 0.3, 14, 0.2, 2.4, 10], ['orange|oranges', 0.9, 12, 0.1, 2.4, 9],
        ['grape|grapes', 0.7, 18, 0.2, 0.9, 16], ['mango', 0.8, 15, 0.4, 1.6, 14], ['strawberry|strawberries', 0.7, 7.7, 0.3, 2, 4.9],
        ['blueberry|blueberries', 0.7, 14, 0.3, 2.4, 10], ['watermelon', 0.6, 7.6, 0.2, 0.4, 6.2], ['pineapple', 0.5, 13, 0.1, 1.4, 10],
        ['avocado', 2, 8.5, 15, 6.7, 0.7], ['pear|pears', 0.4, 15, 0.1, 3.1, 9.8], ['kiwi', 1.1, 15, 0.5, 3, 9], ['lemon|lime', 1.1, 9, 0.3, 2.8, 2.5],
        ['papaya', 0.5, 11, 0.3, 1.7, 7.8],
    ];

    /** Words that describe a food without changing what it is. */
    private const HARMLESS = ['fresh', 'raw', 'cooked', 'organic', 'frozen', 'whole', 'large', 'small', 'medium', 'boneless', 'skinless', 'sliced', 'diced',
        'chopped', 'lean', 'plain', 'natural', 'free', 'range', 'grade', 'a', 'pack', 'packet', 'of', 'the', 'baby', 'red', 'green', 'yellow', 'white',
        'brown', 'sweet', 'full', 'cream', 'skim', 'low', 'fat', 'semi', 'skimmed', 'unsalted', 'salted'];

    /**
     * @return array{protein: float, carbs: float, fat: float, fiber: float, sugar: float}|null grams per 100 g, when the name is exactly one known food
     */
    public static function per100(string $name): ?array
    {
        $words = self::words($name);
        if ($words === []) {
            return null;
        }
        $text = ' '.implode(' ', $words).' ';

        $best = null;
        foreach (self::ENTRIES as $entry) {
            foreach (explode('|', $entry[0]) as $keyword) {
                if (str_contains($text, " {$keyword} ") && ($best === null || mb_strlen($keyword) > mb_strlen($best['keyword']))) {
                    $best = ['keyword' => $keyword, 'entry' => $entry];
                }
            }
        }
        if ($best === null) {
            return null;
        }

        // Everything in the name that the matched food doesn't account for must be a harmless modifier.
        $rest = array_diff($words, explode(' ', $best['keyword']));
        foreach ($rest as $word) {
            if (! in_array($word, self::HARMLESS, true)) {
                return null;
            }
        }
        // "low fat milk" is still milk, but the fat differs: only plain names are trusted for fat and sugar-sensitive foods.
        if (array_intersect($rest, ['low', 'skim', 'skimmed', 'semi']) !== [] || (in_array('fat', $rest, true) && in_array('free', $rest, true))) {
            return null;
        }

        [, $protein, $carbs, $fat, $fiber, $sugar] = $best['entry'];

        return ['protein' => (float) $protein, 'carbs' => (float) $carbs, 'fat' => (float) $fat, 'fiber' => (float) $fiber, 'sugar' => (float) $sugar];
    }

    /** @return list<string> */
    private static function words(string $name): array
    {
        $clean = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', Str::lower($name)) ?? '';

        return array_values(array_filter(preg_split('/\s+/u', trim($clean)) ?: [], fn ($w) => $w !== ''));
    }
}
