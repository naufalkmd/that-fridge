<?php

namespace App\Console\Commands;

use App\Services\RecipeImport\RecipeImportRunner;
use App\Services\RecipeImport\RecipeImportSettings;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Fills Explore with recipes from TheMealDB, picked at random and never twice, as drafts for an
 * admin to publish (see RecipeImportRunner). The schedule and batch size are set in Admin → Recipe import; --limit
 * overrides the batch size for a run from the command line.
 */
#[Signature('app:import-recipes {--limit= : New recipes to add this run (default: the admin setting)} {--scheduled : Called by the daily schedule}')]
#[Description('Import recipes from TheMealDB into Explore as drafts')]
class ImportRecipes extends Command
{
    public function handle(RecipeImportRunner $runner): int
    {
        $limit = $this->option('limit') !== null ? (int) $this->option('limit') : RecipeImportSettings::limit();
        $tally = $runner->run($limit, $this->option('scheduled') ? 'scheduled' : 'manual');

        $this->info("Imported {$tally['imported']} at random (already imported {$tally['exists']}, duplicates {$tally['duplicate']}, too thin {$tally['low_quality']}). New recipes wait in Explore as drafts.");

        return self::SUCCESS;
    }
}
