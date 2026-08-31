<?php

namespace App\Http\Controllers;

use App\Http\Resources\RecipeResource;
use App\Models\Item;
use App\Models\Recipe;
use App\Services\AgentService;
use App\Services\RecipeLinkImportService;
use App\Support\ItemFreshness;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class RecipeController extends Controller
{
    private const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'quick'];

    // "What Should I Eat?" tag enums - mirrored in AgentService::tagRecipe (which produces
    // meal_type/vibes/food_focus) and frontend/lib/thatfridge/types.ts.
    private const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

    // Returned (not just the first 3 shown) so the frontend's Shuffle button can page through
    // other real matches instead of only ever offering the same top 3.
    private const SUGGEST_MAX_RESULTS = 12;

    private const TAG_VIBES = ['comfort', 'light_fresh', 'quick_easy'];

    private const VIBES = ['comfort', 'light_fresh', 'quick_easy', 'something_new', 'use_it_up'];

    private const FOOD_FOCUS = ['high_protein', 'high_veg', 'low_carb', 'balanced'];

    /**
     * Every curated (user_id null) recipe, this user's own custom recipes, plus any custom
     * recipe of someone else's they've favorited from that person's profile - otherwise a
     * favorite would succeed but the recipe would never actually show up anywhere for the
     * favoriter.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $recipes = Recipe::query()
            ->where(fn ($q) => $q->whereNull('user_id')
                ->orWhere('user_id', $user->id)
                ->orWhereHas('favoritedBy', fn ($q2) => $q2->where('users.id', $user->id)))
            ->with(['favoritedBy' => fn ($q) => $q->where('users.id', $user->id), 'user:id,name,username'])
            ->orderBy('name')
            ->get();

        return RecipeResource::collection($recipes);
    }

    /**
     * A single recipe by id - the app opens this when a recipe isn't already in its local
     * book (e.g. tapping one on someone else's profile before favoriting it).
     */
    public function show(Request $request, Recipe $recipe)
    {
        $this->authorize('view', $recipe);

        return new RecipeResource($recipe->load('user:id,name,username'));
    }

    public function store(Request $request, AgentService $agentService)
    {
        $data = $this->validated($request);

        // Tagged once, here, at save time - covers manual add, "save from link import," and
        // "add Chef's suggestion to library," since all three already funnel through this same
        // endpoint. Never re-tagged on update (see the `update` method) - tags are advisory,
        // not correctness-critical.
        $tags = $agentService->tagRecipe($data['name'], $data['ingredients'], $data['minutes'], implode("\n", $data['steps']));
        $data['meal_type'] = $tags['meal_type'];
        $data['vibes'] = $tags['vibes'];
        $data['food_focus'] = $tags['food_focus'];
        // Explicit, not left to the column's DB-level default - create() otherwise returns an
        // in-memory model where made_count is simply absent (reads as null in the response)
        // until the row is re-fetched from the DB.
        $data['made_count'] = 0;

        $recipe = $request->user()->recipes()->create($data);

        return new RecipeResource($recipe);
    }

    public function update(Request $request, Recipe $recipe)
    {
        $this->authorize('update', $recipe);

        $data = $this->validated($request, sometimes: true);

        $recipe->update($data);

        return new RecipeResource($recipe);
    }

    public function destroy(Request $request, Recipe $recipe)
    {
        $this->authorize('delete', $recipe);

        $recipe->delete();

        return response()->noContent();
    }

    public function favorite(Request $request, Recipe $recipe)
    {
        $this->authorize('view', $recipe);

        $request->user()->favoriteRecipes()->syncWithoutDetaching([$recipe->id]);

        return new RecipeResource($recipe);
    }

    public function unfavorite(Request $request, Recipe $recipe)
    {
        $this->authorize('view', $recipe);

        $request->user()->favoriteRecipes()->detach($recipe->id);

        return new RecipeResource($recipe);
    }

    /**
     * "What Should I Eat?" - ranks the user's own visible recipes (curated + custom) against
     * their chosen meal_type/vibes/food_focus, returned as two separate tiers rather than one
     * flat list:
     *
     * - "exact" honors every hard filter (meal_type exact match, food_focus overlap) and only
     *   includes recipes that also score above 0 against whatever was selected.
     * - "similar" is what dropping a hard filter (food_focus first, then meal_type too) turns
     *   up beyond that - real recipes that share the selected vibes/food_focus but don't fully
     *   satisfy the exact combination - always computed and returned alongside "exact" (not
     *   just as an empty-results fallback), so a search with only 1-2 exact hits still has
     *   something else to offer instead of stopping there. Scoring for both tiers is always
     *   against the ORIGINAL selection (relaxing a filter changes what's allowed through, not
     *   what's being scored for), so "similar" results are still ranked by actual relevance.
     *
     * meal_type-only searches (no vibes, no food_focus) never get a "similar" tier - there's
     * nothing to judge similarity by once the one filter that was picked is gone.
     */
    public function suggest(Request $request)
    {
        $data = $request->validate([
            'meal_type' => ['sometimes', 'nullable', 'string', Rule::in(self::MEAL_TYPES)],
            'vibes' => ['sometimes', 'array'],
            'vibes.*' => ['string', Rule::in(self::VIBES)],
            'food_focus' => ['sometimes', 'array'],
            'food_focus.*' => ['string', Rule::in(self::FOOD_FOCUS)],
        ]);

        $user = $request->user();
        $mealType = $data['meal_type'] ?? null;
        $vibes = $data['vibes'] ?? [];
        $foodFocus = $data['food_focus'] ?? [];
        $hasScoringCriteria = ! empty($vibes) || ! empty($foodFocus);

        $recipes = Recipe::query()
            ->where(fn ($q) => $q->whereNull('user_id')
                ->orWhere('user_id', $user->id)
                ->orWhereHas('favoritedBy', fn ($q2) => $q2->where('users.id', $user->id)))
            ->with('user:id,name,username')
            ->orderBy('name')
            ->get();

        $expiringDaysByIcon = $this->expiringItemIcons($user);

        $rankScored = function (bool $applyMealTypeFilter, bool $applyFoodFocusFilter) use (
            $recipes, $mealType, $foodFocus, $vibes, $hasScoringCriteria, $expiringDaysByIcon
        ) {
            return $recipes
                ->when($applyMealTypeFilter && $mealType, fn ($c) => $c->where('meal_type', $mealType))
                ->when($applyFoodFocusFilter && ! empty($foodFocus), fn ($c) => $c->filter(
                    fn ($r) => count(array_intersect($foodFocus, $r->food_focus ?? [])) > 0
                ))
                // Always scored against the real (un-relaxed) selection, regardless of which
                // filters this particular pass is applying.
                ->map(fn ($r) => ['recipe' => $r, 'score' => $this->scoreRecipe($r, $vibes, $foodFocus, $expiringDaysByIcon)])
                ->when($hasScoringCriteria, fn ($c) => $c->filter(fn ($x) => $x['score'] > 0))
                ->sortByDesc('score');
        };

        $exactScored = $rankScored(true, true);
        $exact = $exactScored->take(self::SUGGEST_MAX_RESULTS)->pluck('recipe');
        $exactIds = $exact->pluck('id')->all();

        $similarScored = collect();
        if ($hasScoringCriteria) {
            if (! empty($foodFocus)) {
                $similarScored = $similarScored->merge($rankScored(true, false));
            }
            if ($mealType) {
                $similarScored = $similarScored->merge($rankScored(false, false));
            }
        }
        $similar = $similarScored
            ->reject(fn ($x) => in_array($x['recipe']->id, $exactIds, true))
            ->unique(fn ($x) => $x['recipe']->id)
            ->sortByDesc('score')
            ->take(self::SUGGEST_MAX_RESULTS)
            ->pluck('recipe');

        // Deliberately not the standard {"data": ...} Resource wrapper - apiFetch() on the
        // frontend unwraps a top-level "data" key automatically (see apiClient.ts), which
        // would silently strip the sibling exhausted flag this response needs.
        return response()->json([
            'exact' => RecipeResource::collection($exact),
            'similar' => RecipeResource::collection($similar),
            'exhausted' => $exact->isEmpty() && $similar->isEmpty(),
        ]);
    }

    private function scoreRecipe(Recipe $recipe, array $vibes, array $foodFocus, array $expiringDaysByIcon): float
    {
        $score = 0;

        foreach (self::TAG_VIBES as $tagVibe) {
            if (in_array($tagVibe, $vibes, true) && in_array($tagVibe, $recipe->vibes ?? [], true)) {
                $score += 1;
            }
        }

        // food_focus is also a hard filter above (at least one overlap required to reach this
        // point at all when it's set) - scored too, not just filtered, so a food_focus-only
        // search (no vibes picked) still has something to award points for instead of every
        // surviving candidate landing on a flat 0.
        $score += count(array_intersect($foodFocus, $recipe->food_focus ?? []));

        if (in_array('something_new', $vibes, true) && $recipe->made_count === 0) {
            $score += 1;
        }

        if (in_array('use_it_up', $vibes, true)) {
            foreach ($recipe->ingredients ?? [] as $ingredient) {
                $icon = $ingredient['icon'] ?? null;
                if ($icon && isset($expiringDaysByIcon[$icon])) {
                    // 0-3 days out -> weight 3 down to 0, matching the spec's urgency curve.
                    $score += max(0, 3 - $expiringDaysByIcon[$icon]);
                }
            }
        }

        return $score;
    }

    /**
     * icon => soonest days-until-expiry, across the user's own items that have an expiry_date
     * set (items with no date set carry no urgency signal either way). Recipes don't resolve
     * to specific item ids anywhere in this app - ingredient matching is icon-string equality
     * everywhere else too (see frontend's getRecipesView/openMarkRecipeMade), so this mirrors
     * that same heuristic server-side rather than inventing a new matching mechanism.
     */
    private function expiringItemIcons($user): array
    {
        $items = Item::query()
            ->whereHas('section.fridge.members', fn ($q) => $q->where('users.id', $user->id))
            ->whereNotNull('expiry_date')
            ->get();

        $byIcon = [];
        foreach ($items as $item) {
            $days = ItemFreshness::daysUntilExpiry($item);
            if ($days === null) {
                continue;
            }
            if (! isset($byIcon[$item->icon]) || $days < $byIcon[$item->icon]) {
                $byIcon[$item->icon] = $days;
            }
        }

        return $byIcon;
    }

    public function markMade(Request $request, Recipe $recipe)
    {
        $this->authorize('view', $recipe);

        $recipe->increment('made_count');

        return new RecipeResource($recipe);
    }

    private function validated(Request $request, bool $sometimes = false): array
    {
        $wrap = fn (array $rules) => $sometimes ? ['sometimes', ...$rules] : $rules;

        return $request->validate([
            'name' => $wrap(['required', 'string', 'max:255']),
            'minutes' => $wrap(['required', 'integer', 'min:1', 'max:1440']),
            'category' => ['sometimes', 'nullable', 'string', Rule::in(self::CATEGORIES)],
            'ingredients' => $wrap(['required', 'array', 'min:1']),
            'ingredients.*.name' => ['required', 'string', 'max:255'],
            'ingredients.*.icon' => ['required', 'string', 'max:255'],
            'steps' => $wrap(['required', 'array', 'min:1']),
            'steps.*' => ['required', 'string', 'max:1000'],
            'attachments' => ['sometimes', 'nullable', 'array'],
            'attachments.*.type' => ['required_with:attachments', 'string', Rule::in(['image', 'video'])],
            'attachments.*.url' => ['required_with:attachments', 'string', 'max:2048'],
        ]);
    }

    /**
     * Upload a single reference photo/video for a recipe. Not tied to a recipe id - the
     * recipe form uploads media as it's picked (including for a not-yet-saved new recipe)
     * and only attaches the returned URL to a recipe on Save, same as the barcode/expiry
     * photo upload flows elsewhere in the app.
     */
    public function uploadAttachment(Request $request)
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,gif,mp4,mov,webm', 'max:20480'],
        ]);

        $file = $request->file('file');
        $type = str_starts_with($file->getMimeType(), 'video/') ? 'video' : 'image';
        $path = $file->store('recipe-attachments', 'public');

        return response()->json([
            'type' => $type,
            // Storage::url() without a disk resolves against the *default* disk
            // (FILESYSTEM_DISK=local), not the "public" disk the file was actually stored on -
            // that mismatch was silently producing a bogus relative "/storage/..." URL instead
            // of an absolute one, which is why the uploaded photo/video looked broken.
            'url' => Storage::disk('public')->url($path),
        ]);
    }

    public function importFromLink(Request $request, RecipeLinkImportService $importer)
    {
        $data = $request->validate([
            'url' => ['required', 'url', 'max:2048'],
        ]);

        return response()->json($importer->importFromUrl($data['url']));
    }
}
