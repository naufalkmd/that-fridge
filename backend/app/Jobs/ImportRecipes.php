<?php

namespace App\Jobs;

use App\Services\RecipeImport\RecipeImportRunner;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Admin → Recipe import → "Run now", off the web request (it's up to 26 downloads). */
class ImportRecipes implements ShouldQueue
{
    use Queueable;

    public int $timeout = 300;

    public int $tries = 1;

    public function __construct(public int $limit) {}

    public function handle(RecipeImportRunner $runner): void
    {
        $runner->run($this->limit, 'manual');
    }
}
