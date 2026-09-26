<?php

namespace App\Console\Commands;

use App\Models\Recipe;
use App\Services\RecipeCalorieService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('app:fill-recipe-calories {--no-ai : Algorithm only, never call the model} {--limit=100 : Most recipes to handle in one run} {--recompute : Recompute every recipe from its ingredients}')]
#[Description('Give every recipe calories per serving: the nutrition table first, the model for what it cannot cover')]
class FillRecipeCalories extends Command
{
    public function handle(RecipeCalorieService $calories): int
    {
        $ai = ! $this->option('no-ai') && $calories->aiAvailable();
        $limit = max(1, (int) $this->option('limit'));

        $query = Recipe::query()->orderBy('id');
        if (! $this->option('recompute')) {
            // Missing numbers, plus stop-gap ones the model may now be able to replace.
            $query->where(fn ($q) => $q->whereNull('calories')->orWhere(fn ($r) => $ai ? $r->where('calories_source', 'rough') : $r->whereRaw('1 = 0')));
        }

        $done = ['algorithm' => 0, 'ai' => 0, 'rough' => 0];
        foreach ($query->limit($limit)->get() as $recipe) {
            $needsAi = ($this->option('recompute') || $recipe->calories === null || $recipe->calories_source !== 'rough')
                ? $calories->applyAlgorithm($recipe)
                : true;
            $recipe->saveQuietly();

            if ($needsAi && $ai && $calories->refineWithAi($recipe)) {
                $done['ai']++;
            } else {
                $done[$recipe->calories_source ?? 'rough']++;
            }
        }

        $this->info("Calories filled: {$done['algorithm']} by table, {$done['ai']} by model, {$done['rough']} rough.");

        return self::SUCCESS;
    }
}
