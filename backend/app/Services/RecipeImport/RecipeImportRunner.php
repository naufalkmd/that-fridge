<?php

namespace App\Services\RecipeImport;

use App\Models\Recipe;

/**
 * One import run, shared by the daily schedule, the artisan command and Admin → "Run now": takes
 * the TheMealDB catalogue, leaves out every recipe already imported, shuffles the rest and imports
 * up to $limit of them as Explore drafts (RecipeImporter still skips near-duplicates of existing
 * recipes and thin ones), then records the summary. Random, so Explore fills with a mix of cuisines
 * and letters instead of every "A" dish first; never the same recipe twice.
 */
class RecipeImportRunner
{
    public function __construct(private TheMealDbSource $source, private RecipeImporter $importer) {}

    /** @return array{imported: int, exists: int, duplicate: int, low_quality: int} */
    public function run(int $limit, string $trigger): array
    {
        $limit = max(1, $limit);
        $pool = $this->source->all();

        $known = Recipe::query()->whereIn('external_id', array_column($pool, 'external_id'))->pluck('external_id')->flip();
        $fresh = array_values(array_filter($pool, fn ($r) => ! isset($known[$r['external_id']])));
        shuffle($fresh);

        $tally = ['imported' => 0, 'exists' => count($pool) - count($fresh), 'duplicate' => 0, 'low_quality' => 0];
        foreach ($fresh as $recipe) {
            if ($tally['imported'] >= $limit) {
                break;
            }
            $tally[$this->importer->import($recipe)]++;
        }

        RecipeImportSettings::recordRun([...$tally, 'left' => max(0, count($fresh) - $tally['imported'] - $tally['duplicate'] - $tally['low_quality'])], $trigger);

        return $tally;
    }
}
