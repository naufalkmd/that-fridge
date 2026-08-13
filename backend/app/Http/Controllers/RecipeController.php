<?php

namespace App\Http\Controllers;

use App\Http\Resources\RecipeResource;
use App\Models\Recipe;
use App\Services\RecipeLinkImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
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
