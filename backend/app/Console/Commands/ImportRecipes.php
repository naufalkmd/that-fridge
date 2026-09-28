<?php

namespace App\Console\Commands;

use App\Services\RecipeImport\RecipeImporter;
use App\Services\RecipeImport\TheMealDbSource;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Fills Explore with recipes from TheMealDB without anyone typing them in: each run carries on
 * through the catalogue letter by letter from where the last one stopped, imports up to --limit
 * new recipes (skipping ones already here, near-duplicates and thin ones), and leaves them as
 * drafts for an admin to publish. Scheduled daily when RECIPE_IMPORT_ENABLED is on.
 */
#[Signature('app:import-recipes {--limit=20 : New recipes to add this run}')]
#[Description('Import recipes from TheMealDB into Explore as drafts')]
class ImportRecipes extends Command
{
    public const CURSOR_KEY = 'recipe-import:themealdb:letter';

    public function handle(TheMealDbSource $source, RecipeImporter $importer): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $letters = TheMealDbSource::LETTERS;
        $start = max(0, (int) Cache::get(self::CURSOR_KEY, 0)) % strlen($letters);
        $tally = ['imported' => 0, 'exists' => 0, 'duplicate' => 0, 'low_quality' => 0];

        // At most one pass over the alphabet per run.
        for ($n = 0; $n < strlen($letters) && $tally['imported'] < $limit; $n++) {
            $i = ($start + $n) % strlen($letters);
            $finishedLetter = true;
            foreach ($source->byLetter($letters[$i]) as $recipe) {
                if ($tally['imported'] >= $limit) {
                    $finishedLetter = false; // come back to this letter next run
                    break;
                }
                $tally[$importer->import($recipe)]++;
            }
            Cache::forever(self::CURSOR_KEY, $finishedLetter ? $i + 1 : $i);
        }

        $this->info("Imported {$tally['imported']} (already here {$tally['exists']}, duplicates {$tally['duplicate']}, too thin {$tally['low_quality']}). New recipes wait in Explore as drafts.");

        return self::SUCCESS;
    }
}
