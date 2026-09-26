<?php

namespace App\Http\Controllers;

use App\Http\Resources\MealEntryResource;
use App\Models\MealEntry;
use App\Services\MealPlanService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MealEntryController extends Controller
{
    public function __construct(private MealPlanService $meals) {}

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->assertFridgeMember($request, $data['fridge_id'] ?? null);

        $entry = $this->meals->create($request->user(), $data);

        return (new MealEntryResource($entry->load('user:id,username')))->response()->setStatusCode(201);
    }

    public function update(Request $request, MealEntry $mealEntry)
    {
        $this->authorize('update', $mealEntry);
        $data = $this->validated($request, sometimes: true);
        $this->assertFridgeMember($request, $data['fridge_id'] ?? null);

        $was = $mealEntry->status;
        $mealEntry->update($this->meals->attributes($data, $mealEntry));
        if ($mealEntry->status !== $was) {
            $this->meals->feedback($request->user(), $mealEntry, $mealEntry->status);
        }

        return new MealEntryResource($mealEntry->load('user:id,username'));
    }

    /**
     * The estimate the form shows while the user types a name: the built-in nutrition table only (no
     * model, no credits), so it is instant and free. `calories` is null when nothing is recognised.
     */
    public function estimate(Request $request)
    {
        $data = $request->validate(['title' => ['required', 'string', 'max:120']]);

        return response()->json(['calories' => $this->meals->estimate($data['title'])]);
    }

    public function destroy(Request $request, MealEntry $mealEntry)
    {
        $this->authorize('delete', $mealEntry);
        $this->meals->feedback($request->user(), $mealEntry, 'deleted');
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
            // Typed by the user: kept as-is. Omitted or null = we work it out (recipe, then the name).
            'calories' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:5000'],
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
}
