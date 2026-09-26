<?php

namespace App\Http\Controllers;

use App\Http\Resources\MealEntryResource;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Support\AlgoFeedback;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MealEntryController extends Controller
{
    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->assertFridgeMember($request, $data['fridge_id'] ?? null);

        $entry = MealEntry::create($this->attributes($data) + ['user_id' => $request->user()->id]);
        $this->feedback($request, $entry, 'planned');

        return (new MealEntryResource($entry->load('user:id,username')))->response()->setStatusCode(201);
    }

    public function update(Request $request, MealEntry $mealEntry)
    {
        $this->authorize('update', $mealEntry);
        $data = $this->validated($request, sometimes: true);
        $this->assertFridgeMember($request, $data['fridge_id'] ?? null);

        $was = $mealEntry->status;
        $mealEntry->update($this->attributes($data, $mealEntry));
        if ($mealEntry->status !== $was) {
            $this->feedback($request, $mealEntry, $mealEntry->status);
        }

        return new MealEntryResource($mealEntry->load('user:id,username'));
    }

    public function destroy(Request $request, MealEntry $mealEntry)
    {
        $this->authorize('delete', $mealEntry);
        $this->feedback($request, $mealEntry, 'deleted');
        $mealEntry->delete();

        return response()->noContent();
    }

    private function validated(Request $request, bool $sometimes = false): array
    {
        $wrap = fn (array $rules) => $sometimes ? ['sometimes', ...$rules] : $rules;

        return $request->validate([
            'date' => $wrap(['required', 'date_format:Y-m-d']),
            'slot' => $wrap(['required', 'string', 'max:40']),
            'time' => ['sometimes', 'nullable', 'date_format:H:i'],
            'recipe_id' => ['sometimes', 'nullable', Rule::exists('recipes', 'id')],
            // Free text when there is no recipe; a recipe's name is copied in when it is omitted.
            'title' => $sometimes
                ? ['sometimes', 'nullable', 'string', 'max:120']
                : ['nullable', 'string', 'max:120', 'required_without:recipe_id'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(MealEntry::STATUSES)],
            'fridge_id' => ['sometimes', 'nullable', 'integer'],
        ]);
    }

    /** Planning on a fridge needs membership; whether others then see it depends on the owner's Pro. */
    private function assertFridgeMember(Request $request, mixed $fridgeId): void
    {
        if ($fridgeId === null) {
            return;
        }
        abort_unless($request->user()->memberFridges()->where('fridges.id', $fridgeId)->exists(), 404);
    }

    /** @return array<string, mixed> */
    private function attributes(array $data, ?MealEntry $existing = null): array
    {
        $attrs = array_filter($data, fn ($v, $k) => $k !== 'title' || $v !== null, ARRAY_FILTER_USE_BOTH);
        $attrs['slot'] = isset($attrs['slot']) ? trim($attrs['slot']) : null;
        if ($attrs['slot'] === null) {
            unset($attrs['slot']);
        }

        if (array_key_exists('recipe_id', $data) && $data['recipe_id'] !== null && empty($data['title'])) {
            $attrs['title'] = Recipe::find($data['recipe_id'])?->name ?? 'Meal';
        }
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

    /** Structured only: never the title, note or slot label (all user-typed). */
    private function feedback(Request $request, MealEntry $entry, string $kind): void
    {
        AlgoFeedback::record($request->user(), 'meal_plan', [
            'kind' => $kind,
            'source' => $entry->recipe_id !== null ? 'recipe' : 'free_text',
            'guess_number' => (int) now()->startOfDay()->diffInDays($entry->date->copy()->startOfDay(), false),
            'outcome' => $entry->status,
        ]);
    }
}
