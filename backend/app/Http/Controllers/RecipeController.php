<?php

namespace App\Http\Controllers;

use App\Http\Resources\RecipeResource;
use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RecipeController extends Controller
{
    private const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'quick'];

    /**
     * Every curated (user_id null) recipe, plus this user's own custom recipes.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $recipes = Recipe::query()
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))
            ->with(['favoritedBy' => fn ($q) => $q->where('users.id', $user->id)])
            ->orderBy('name')
            ->get();

        return RecipeResource::collection($recipes);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);

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
        ]);
    }
}
