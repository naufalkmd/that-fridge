<?php

namespace App\Http\Controllers;

use App\Http\Resources\CategoryResource;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        return CategoryResource::collection(
            $request->user()->categories()->orderBy('position')->orderBy('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => [
                'required', 'string', 'max:40',
                Rule::unique('categories')->where('user_id', $request->user()->id),
            ],
            'color' => ['nullable', 'string', 'max:32'],
        ]);

        $data['position'] = ($request->user()->categories()->max('position') ?? 0) + 1;

        $category = $request->user()->categories()->create($data);

        return new CategoryResource($category);
    }

    public function update(Request $request, Category $category)
    {
        $this->authorize('update', $category);

        $data = $request->validate([
            'name' => [
                'sometimes', 'string', 'max:40',
                Rule::unique('categories')->where('user_id', $request->user()->id)->ignore($category->id),
            ],
            'color' => ['sometimes', 'nullable', 'string', 'max:32'],
            'position' => ['sometimes', 'integer', 'min:0'],
        ]);

        $category->update($data);

        return new CategoryResource($category);
    }

    public function destroy(Request $request, Category $category)
    {
        $this->authorize('delete', $category);

        // items.category_id is nullOnDelete — the items just become "Uncategorized".
        $category->delete();

        return response()->noContent();
    }
}
