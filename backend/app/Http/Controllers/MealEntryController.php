<?php

namespace App\Http\Controllers;

use App\Http\Resources\MealEntryResource;
use App\Models\MealEntry;
use App\Services\CreditService;
use App\Services\MealAutofillService;
use App\Services\MealPlanService;
use App\Support\CreditCost;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MealEntryController extends Controller
{
    public function __construct(
        private MealPlanService $meals,
        private MealAutofillService $autofill,
        private CreditService $credits,
    ) {}

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

    /**
     * "Autofill" the plan: one AI call that proposes meals for the empty slots in a date range (at most
     * two weeks, 21 slots) from what is expiring and the recipe book. Metered in AI credits, charged
     * before the call and refunded when no meal comes back; nothing is charged when every slot is
     * already taken. Not wrapped in `data`: the credit figures sit beside the created entries so the
     * app can tell the user what it cost.
     */
    public function autofill(Request $request)
    {
        $data = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'fridge_id' => ['sometimes', 'nullable', 'integer'],
            // "Ask Chef": what the user wants this plan to be. Optional - blank is a plain autofill.
            'prompt' => ['sometimes', 'nullable', 'string', 'max:300'],
        ]);
        abort_if(Carbon::parse($data['from'])->diffInDays(Carbon::parse($data['to'])) > 13, 422, 'Pick a range of at most two weeks.');

        $user = $request->user();
        $this->assertFridgeMember($request, $data['fridge_id'] ?? null);
        $fridgeId = $data['fridge_id'] ?? $user->fridges()->value('id');

        $reply = fn (array $created, int $used, string $message = '') => response()->json([
            'created' => MealEntryResource::collection(collect($created)->each->load('user:id,username'))->resolve($request),
            'creditsUsed' => $used,
            'balance' => $this->credits->balance($user),
            'message' => $message ?: null,
        ]);

        $open = $this->autofill->openSlots($user, $data['from'], $data['to'], $fridgeId);
        if ($open === []) {
            return $reply([], 0, 'Every slot in that range already has a meal.');
        }
        if (! $this->autofill->available()) {
            return $reply([], 0, "AI isn't available right now - plan these by hand instead.");
        }

        $this->credits->spend($user, CreditCost::MEAL_AUTOFILL, 'meal_autofill');
        $created = $this->autofill->fill($user, $open, $fridgeId, $user->memberFridges()->pluck('fridges.id')->all(), trim((string) ($data['prompt'] ?? '')));

        if ($created === []) {
            $this->credits->grant($user, CreditCost::MEAL_AUTOFILL, 'meal_autofill_refund');

            return $reply([], 0, "Couldn't come up with a plan this time - nothing was charged.");
        }

        return $reply($created, CreditCost::MEAL_AUTOFILL);
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
