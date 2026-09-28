<?php

namespace App\Services\RecipeImport;

use Illuminate\Support\Facades\Cache;

/**
 * One import run, shared by the daily schedule, the artisan command and Admin → "Run now": goes
 * through TheMealDB letter by letter from where the last run stopped and imports up to $limit new
 * recipes as Explore drafts, then records the summary.
 */
class RecipeImportRunner
{
    public const CURSOR_KEY = 'recipe-import:themealdb:letter';

    public function __construct(private TheMealDbSource $source, private RecipeImporter $importer) {}

    /** @return array{imported: int, exists: int, duplicate: int, low_quality: int} */
    public function run(int $limit, string $trigger): array
    {
        $limit = max(1, $limit);
        $letters = TheMealDbSource::LETTERS;
        $start = max(0, (int) Cache::get(self::CURSOR_KEY, 0)) % strlen($letters);
        $tally = ['imported' => 0, 'exists' => 0, 'duplicate' => 0, 'low_quality' => 0];

        // At most one pass over the alphabet per run.
        for ($n = 0; $n < strlen($letters) && $tally['imported'] < $limit; $n++) {
            $i = ($start + $n) % strlen($letters);
            $finishedLetter = true;
            foreach ($this->source->byLetter($letters[$i]) as $recipe) {
                if ($tally['imported'] >= $limit) {
                    $finishedLetter = false; // come back to this letter next run
                    break;
                }
                $tally[$this->importer->import($recipe)]++;
            }
            Cache::forever(self::CURSOR_KEY, $finishedLetter ? $i + 1 : $i);
        }

        RecipeImportSettings::recordRun($tally, $trigger);

        return $tally;
    }

    /** The letter the next run starts from, for the admin page. */
    public static function nextLetter(): string
    {
        $letters = TheMealDbSource::LETTERS;

        return strtoupper($letters[max(0, (int) Cache::get(self::CURSOR_KEY, 0)) % strlen($letters)]);
    }
}
