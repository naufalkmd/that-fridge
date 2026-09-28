<?php

namespace App\Services\RecipeImport;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * TheMealDB (themealdb.com): an open recipe database built for apps, ~300 dishes from many
 * cuisines. Its search-by-first-letter endpoint returns full recipes, so the whole catalogue is 26
 * calls. Every recipe links back to its original page when TheMealDB has one.
 */
class TheMealDbSource
{
    private const BASE = 'https://www.themealdb.com/api/json/v1/';

    public const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

    /**
     * Every recipe whose name starts with `$letter`, normalised for RecipeImporter. Empty on any
     * failure (logged), so one bad letter never stops an import run.
     *
     * @return list<array{external_id: string, name: string, category: ?string, area: ?string, ingredients: list<array{name: string, measure: string}>, instructions: string, image: ?string, source_url: string, source_name: string, author: ?string, tags: list<string>}>
     */
    public function byLetter(string $letter): array
    {
        try {
            $res = Http::timeout(15)->acceptJson()
                ->get(self::BASE.config('services.themealdb.key', '1').'/search.php', ['f' => $letter]);
            if (! $res->successful()) {
                Log::warning('TheMealDB lookup failed', ['letter' => $letter, 'status' => $res->status()]);

                return [];
            }
            $meals = $res->json('meals');
        } catch (\Throwable $e) {
            Log::warning('TheMealDB lookup failed', ['letter' => $letter, 'error' => $e->getMessage()]);

            return [];
        }

        return array_values(array_filter(array_map(fn ($m) => is_array($m) ? $this->normalise($m) : null, is_array($meals) ? $meals : [])));
    }

    private function normalise(array $m): ?array
    {
        $id = trim((string) ($m['idMeal'] ?? ''));
        $name = trim((string) ($m['strMeal'] ?? ''));
        if ($id === '' || $name === '') {
            return null;
        }

        $ingredients = [];
        for ($i = 1; $i <= 20; $i++) {
            $ing = trim((string) ($m["strIngredient{$i}"] ?? ''));
            if ($ing !== '') {
                $ingredients[] = ['name' => $ing, 'measure' => trim((string) ($m["strMeasure{$i}"] ?? ''))];
            }
        }

        // Credit the original page when TheMealDB has one, else TheMealDB's own page for it.
        $source = trim((string) ($m['strSource'] ?? ''));
        $sourceUrl = filter_var($source, FILTER_VALIDATE_URL) ? $source : "https://www.themealdb.com/meal/{$id}";
        $host = parse_url($sourceUrl, PHP_URL_HOST) ?: 'themealdb.com';

        return [
            'external_id' => "themealdb:{$id}",
            'name' => $name,
            'category' => $m['strCategory'] ?? null,
            'area' => $m['strArea'] ?? null,
            'ingredients' => $ingredients,
            'instructions' => (string) ($m['strInstructions'] ?? ''),
            'image' => filter_var($m['strMealThumb'] ?? '', FILTER_VALIDATE_URL) ? $m['strMealThumb'] : null,
            'source_url' => Str::limit($sourceUrl, 500, ''),
            'source_name' => Str::limit(preg_replace('/^www\./', '', $host), 120, ''),
            'author' => null, // TheMealDB doesn't name the cook
            'tags' => array_values(array_filter(array_map(fn ($t) => Str::lower(trim($t)), explode(',', (string) ($m['strTags'] ?? ''))))),
        ];
    }
}
