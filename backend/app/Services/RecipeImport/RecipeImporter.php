<?php

namespace App\Services\RecipeImport;

use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Support\FoodIconMatcher;
use Illuminate\Support\Str;

/**
 * Turns a normalised recipe from an import source into a curated Recipe plus a *draft* Explore
 * entry an admin approves (Explore admin → Publish). Skips what's already here and what isn't good
 * enough to show:
 *   - already imported: same source id;
 *   - duplicate: an existing curated recipe with the same name, or a near-identical name and
 *     mostly the same ingredients (catches "Chicken Curry" vs "Chicken curry (easy)");
 *   - low quality: fewer than 3 or more than 20 ingredients, or fewer than 2 real steps.
 * Every imported recipe keeps its source link, site and (when known) cook for the credit line.
 */
class RecipeImporter
{
    private const MIN_INGREDIENTS = 3;

    private const MAX_INGREDIENTS = 20;

    private const MIN_STEPS = 2;

    private const MAX_STEPS = 12;

    /** Name similarity (percent) and ingredient overlap (0-1) that make two recipes the same dish. */
    private const SIMILAR_NAME = 85.0;

    private const SIMILAR_INGREDIENTS = 0.6;

    /**
     * @param  array{external_id: string, name: string, category: ?string, area: ?string, ingredients: list<array{name: string, measure: string}>, instructions: string, image: ?string, source_url: string, source_name: string, author: ?string, tags: list<string>}  $r
     * @return 'imported'|'exists'|'duplicate'|'low_quality'
     */
    public function import(array $r): string
    {
        if (Recipe::where('external_id', $r['external_id'])->exists()) {
            return 'exists';
        }

        $steps = self::steps($r['instructions']);
        $count = count($r['ingredients']);
        if ($count < self::MIN_INGREDIENTS || $count > self::MAX_INGREDIENTS || count($steps) < self::MIN_STEPS) {
            return 'low_quality';
        }

        $ingredientNames = array_map(fn ($i) => self::ingredientName($i['name']), $r['ingredients']);
        if ($this->isDuplicate($r['name'], $ingredientNames)) {
            return 'duplicate';
        }

        // The amounts go in a first "You'll need" step: our ingredient list is names only (that's
        // what matches against the fridge), but a cook needs the quantities.
        $needs = implode(', ', array_map(
            fn ($i) => trim(($i['measure'] !== '' ? $i['measure'].' ' : '').Str::lower($i['name'])),
            $r['ingredients'],
        ));
        $steps = [Str::limit("You'll need: {$needs}.", 600, '…'), ...array_slice($steps, 0, self::MAX_STEPS)];

        $category = self::category($r['category']);
        $minutes = min(90, 15 + 5 * (count($steps) - 1));
        $minutes = (int) (round($minutes / 5) * 5);

        $recipe = Recipe::create([
            'user_id' => null,
            'external_id' => $r['external_id'],
            'source_url' => $r['source_url'],
            'source_name' => $r['source_name'],
            'author' => $r['author'],
            'name' => Str::limit(trim($r['name']), 120, ''),
            'minutes' => $minutes,
            'category' => $category,
            'icon' => null,
            'ingredients' => array_map(fn ($n) => ['name' => $n, 'icon' => FoodIconMatcher::guess($n) ?? 'leftovers'], $ingredientNames),
            'steps' => $steps,
            'attachments' => $r['image'] ? [['type' => 'image', 'url' => $r['image']]] : [],
        ]);

        ExploreItem::create([
            'type' => 'recipe',
            'ref_id' => $recipe->id,
            'title' => Str::limit($recipe->name, 120, ''),
            'blurb' => collect(["{$minutes} min", $r['area'], $r['category']])->filter()->implode(' · '),
            'tags' => array_values(array_unique(array_filter([
                $category, $r['area'] ? Str::lower($r['area']) : null, $r['category'] ? Str::lower($r['category']) : null, ...$r['tags'],
            ]))),
            // Waits for an admin: Explore admin → filter Draft → Publish.
            'status' => 'draft',
        ]);

        return 'imported';
    }

    /**
     * The method as separate steps: the source's own line breaks when it has them (dropping
     * "STEP 1"-style labels and numbering), else sentences grouped two at a time.
     *
     * @return list<string>
     */
    public static function steps(string $text): array
    {
        $text = str_replace("\r", '', $text);
        $lines = array_values(array_filter(array_map(
            fn ($l) => trim(preg_replace('/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i', '', $l) ?? ''),
            preg_split('/\n+/', $text) ?: [],
        ), fn ($l) => mb_strlen($l) >= 8));

        if (count($lines) < 2) {
            $sentences = preg_split('/(?<=[.!?])\s+(?=[A-Z])/', trim($text)) ?: [];
            $lines = array_map(fn ($pair) => trim(implode(' ', $pair)), array_chunk(array_filter($sentences, fn ($s) => trim($s) !== ''), 2));
        }

        return array_values(array_map(fn ($l) => Str::limit($l, 400, '…'), array_filter($lines, fn ($l) => $l !== '')));
    }

    /** Title-cased, singular-ish, without brand noise: "chicken breasts" -> "Chicken breasts". */
    private static function ingredientName(string $raw): string
    {
        return Str::ucfirst(Str::lower(Str::limit(trim($raw), 60, '')));
    }

    /** TheMealDB-style categories onto ours (breakfast / lunch / dinner / dessert / snack / quick). */
    private static function category(?string $source): string
    {
        return match (Str::lower((string) $source)) {
            'breakfast' => 'breakfast',
            'dessert' => 'dessert',
            'starter', 'side' => 'snack',
            default => 'dinner',
        };
    }

    /** @param  list<string>  $ingredients */
    private function isDuplicate(string $name, array $ingredients): bool
    {
        $key = self::nameKey($name);
        $mine = array_map(fn ($i) => Str::lower($i), $ingredients);

        foreach (Recipe::query()->whereNull('user_id')->get(['name', 'ingredients']) as $existing) {
            $other = self::nameKey($existing->name);
            if ($other === $key) {
                return true;
            }
            similar_text($key, $other, $percent);
            if ($percent < self::SIMILAR_NAME) {
                continue;
            }
            $theirs = array_map(fn ($i) => Str::lower((string) ($i['name'] ?? '')), $existing->ingredients ?? []);
            $union = count(array_unique([...$mine, ...$theirs]));
            if ($union > 0 && count(array_intersect(array_unique($mine), array_unique($theirs))) / $union >= self::SIMILAR_INGREDIENTS) {
                return true;
            }
        }

        return false;
    }

    private static function nameKey(string $name): string
    {
        return trim(preg_replace('/[^a-z0-9 ]+/', '', Str::lower($name)) ?? '');
    }
}
