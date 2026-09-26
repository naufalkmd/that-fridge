<?php

namespace App\Http\Controllers;

use App\Http\Resources\ExploreItemResource;
use App\Http\Resources\MealEntryResource;
use App\Http\Resources\RecipeResource;
use App\Models\ExploreItem;
use App\Models\MealEntry;
use App\Models\Recipe;
use App\Models\SharedIcon;
use App\Services\ExploreSearch;
use App\Services\MealPlanService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ExploreController extends Controller
{
    /** The most a browse (no search phrase) returns; a search returns up to the same many best matches. */
    private const LIMIT = 120;

    public function __construct(private ExploreSearch $search, private MealPlanService $meals) {}

    /**
     * Browse or search the catalogue. No `q`: featured items (in the admin's order) plus everything else
     * in order. With `q`: ranked matches only (see ExploreSearch). `type` narrows either to one library.
     * Not wrapped in `data`, so `featured` and `items` sit side by side.
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:80'],
            'type' => ['sometimes', 'nullable', Rule::in(ExploreItem::TYPES)],
        ]);
        $q = trim((string) ($data['q'] ?? ''));

        $all = ExploreItem::query()->published()
            ->when($data['type'] ?? null, fn ($query, $type) => $query->where('type', $type))
            ->orderBy('position')->orderBy('title')
            ->limit(2000)->get();

        // An icon or recipe whose row has since been deleted is dropped rather than shown broken.
        $this->attachRelated($all);
        $all = $all->reject(fn (ExploreItem $i) => ($i->type === 'recipe' && ! $i->getRelation('recipe')) || ($i->type === 'icon' && ! $i->getRelation('icon')))->values();

        $items = $q === '' ? $all : $this->search->rank($all, $q);
        $featured = $q === '' ? $items->where('featured', true)->values() : collect();
        $shown = $items->take(self::LIMIT)->values();

        return response()->json([
            'featured' => ExploreItemResource::collection($featured)->resolve($request),
            'items' => ExploreItemResource::collection($shown)->resolve($request),
        ]);
    }

    /**
     * Take an item as your own. Recipe: a copy in your recipe book. Machine: the draft, for the Kitchen Lab
     * review screen (nothing is saved or run). Meal plan: its meals put on your plan from `start`, skipping
     * slots you already filled. Icon: nothing to copy - shared icons are in the icon picker for everyone.
     */
    public function use(Request $request, ExploreItem $item)
    {
        abort_unless($item->status === 'published', 404);

        return match ($item->type) {
            'recipe' => $this->useRecipe($request, $item),
            'machine' => response()->json(['type' => 'machine', 'draft' => $item->payload]),
            'meal_plan' => $this->useMealPlan($request, $item),
            default => response()->json(['type' => $item->type]),
        };
    }

    private function useRecipe(Request $request, ExploreItem $item)
    {
        $source = Recipe::query()->whereNull('user_id')->find($item->ref_id);
        abort_if($source === null, 404);

        $copy = $source->replicate(['user_id', 'made_count', 'attachments', 'icon_url']);
        $copy->user_id = $request->user()->id;
        $copy->made_count = 0;
        $copy->save();

        return response()->json(['type' => 'recipe', 'recipe' => (new RecipeResource($copy))->resolve($request)], 201);
    }

    private function useMealPlan(Request $request, ExploreItem $item)
    {
        $data = $request->validate([
            'start' => ['required', 'date_format:Y-m-d'],
            'fridge_id' => ['sometimes', 'nullable', 'integer'],
        ]);
        $user = $request->user();
        if (isset($data['fridge_id'])) {
            abort_unless($user->memberFridges()->where('fridges.id', $data['fridge_id'])->exists(), 404);
        }
        $fridgeId = $data['fridge_id'] ?? $user->fridges()->value('id');
        $start = Carbon::parse($data['start'])->startOfDay();

        $created = [];
        $skipped = 0;
        foreach (array_slice($item->payload['days'] ?? [], 0, 42) as $meal) {
            $date = $start->copy()->addDays((int) ($meal['day'] ?? 0))->toDateString();
            $slot = Str::limit((string) ($meal['slot'] ?? 'Dinner'), 40, '');
            $taken = MealEntry::query()->visibleTo($user)->where('date', $date)->whereRaw('lower(slot) = ?', [Str::lower($slot)])->exists();
            if ($taken) {
                $skipped++;

                continue;
            }
            $created[] = $this->meals->create($user, [
                'fridge_id' => $fridgeId, 'date' => $date, 'slot' => $slot, 'title' => Str::limit((string) ($meal['title'] ?? 'Meal'), 120, ''),
            ]);
        }

        return response()->json([
            'type' => 'meal_plan',
            'created' => MealEntryResource::collection(collect($created)->each->load('user:id,username'))->resolve($request),
            'skipped' => $skipped,
        ], 201);
    }

    /** One query per related table, then hang the rows on the items. @param  Collection<int, ExploreItem>  $items */
    private function attachRelated(Collection $items): void
    {
        $recipes = Recipe::query()->whereIn('id', $items->where('type', 'recipe')->pluck('ref_id')->filter()->unique())->get()->keyBy('id');
        $icons = SharedIcon::query()->whereIn('id', $items->where('type', 'icon')->pluck('ref_id')->filter()->unique())->get()->keyBy('id');

        foreach ($items as $item) {
            $item->setRelation('recipe', $item->type === 'recipe' ? $recipes->get($item->ref_id) : null);
            $item->setRelation('icon', $item->type === 'icon' ? $icons->get($item->ref_id) : null);
        }
    }
}
