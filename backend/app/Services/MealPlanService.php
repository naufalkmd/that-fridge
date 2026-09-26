<?php

namespace App\Services;

use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\User;
use App\Support\AlgoFeedback;
use App\Support\RecipeCalories;

/**
 * The rules for a meal-plan entry, shared by the REST controller and Quick Chat's tools so the app
 * and the chat can never disagree: the recipe's name is copied into `title`, cooked stamps
 * `cooked_at`, and calories are worked out (a typed number always wins, then the recipe's per-serving
 * estimate, then the nutrition table on the meal's name). Callers validate input and check fridge
 * membership; this only turns validated data into attributes and writes.
 */
class MealPlanService
{
    public const MAX_KCAL = 5000;

    /** Create an entry for `$user` from already-validated data. */
    public function create(User $user, array $data): MealEntry
    {
        $entry = MealEntry::create($this->attributes($data) + ['user_id' => $user->id]);
        $this->feedback($user, $entry, 'planned');

        return $entry;
    }

    /**
     * @param  array<string, mixed>  $data  validated request data (any subset when updating)
     * @return array<string, mixed>
     */
    public function attributes(array $data, ?MealEntry $existing = null): array
    {
        $attrs = array_filter($data, fn ($v, $k) => $k !== 'title' || $v !== null, ARRAY_FILTER_USE_BOTH);
        $attrs['slot'] = isset($attrs['slot']) ? trim($attrs['slot']) : null;
        if ($attrs['slot'] === null) {
            unset($attrs['slot']);
        }

        if (array_key_exists('recipe_id', $data) && $data['recipe_id'] !== null && empty($data['title'])) {
            $attrs['title'] = Recipe::find($data['recipe_id'])?->name ?? 'Meal';
        }
        $attrs = $this->withCalories($attrs, $data, $existing);
        if ($existing === null) {
            $attrs['status'] ??= 'planned';
        }
        if (($attrs['status'] ?? null) === 'cooked' && ($existing?->status !== 'cooked')) {
            $attrs['cooked_at'] = now();
        }
        if (isset($attrs['status']) && $attrs['status'] !== 'cooked') {
            $attrs['cooked_at'] = null;
        }

        return $attrs;
    }

    /** The table-only estimate for a meal name, clamped; null when nothing is recognised. */
    public function estimate(string $title): ?int
    {
        $kcal = RecipeCalories::mealKcal($title);

        return $kcal === null ? null : $this->clamp($kcal);
    }

    /** Structured only: never the title, note or slot label (all user-typed). */
    public function feedback(User $user, MealEntry $entry, string $kind): void
    {
        AlgoFeedback::record($user, 'meal_plan', [
            'kind' => $kind,
            'source' => $entry->recipe_id !== null ? 'recipe' : 'free_text',
            'guess_number' => (int) now()->startOfDay()->diffInDays($entry->date->copy()->startOfDay(), false),
            'outcome' => $entry->status,
        ]);
    }

    /**
     * Where a meal's calories come from: a number the user typed always wins (`manual`); otherwise
     * the recipe's per-serving estimate, otherwise the nutrition table on the meal's name. Worked out
     * on create and whenever the name or recipe changes - and left alone by any other edit.
     *
     * @param  array<string, mixed>  $attrs
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withCalories(array $attrs, array $data, ?MealEntry $existing): array
    {
        if (array_key_exists('calories', $data) && $data['calories'] !== null) {
            $attrs['calories'] = (int) $data['calories'];
            $attrs['calories_source'] = 'manual';

            return $attrs;
        }

        $clearedManual = array_key_exists('calories', $data) && $data['calories'] === null;
        $renamed = array_key_exists('title', $attrs) || array_key_exists('recipe_id', $attrs);
        if ($existing !== null && ! $clearedManual && ! ($renamed && $existing->calories_source !== 'manual')) {
            return $attrs;
        }

        $recipeId = array_key_exists('recipe_id', $attrs) ? $attrs['recipe_id'] : $existing?->recipe_id;
        $title = $attrs['title'] ?? $existing?->title ?? '';
        $recipeKcal = $recipeId !== null ? Recipe::find($recipeId)?->calories : null;
        if ($recipeKcal !== null) {
            $attrs['calories'] = (int) $recipeKcal;
            $attrs['calories_source'] = 'recipe';
        } else {
            $kcal = $title !== '' ? $this->estimate($title) : null;
            $attrs['calories'] = $kcal;
            $attrs['calories_source'] = $kcal === null ? null : 'estimate';
        }

        return $attrs;
    }

    private function clamp(float $kcal): int
    {
        return (int) max(0, min(self::MAX_KCAL, round($kcal)));
    }
}
