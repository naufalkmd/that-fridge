<?php

namespace App\Http\Controllers;

use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    // Kept as plain constants (not a DB enum) so the allowed set can change without a
    // migration - same treatment as the icon/location/source fields below.
    public const NUTRITION_CATEGORIES = ['protein', 'vegetables', 'fruit', 'grains', 'dairy', 'other_extras'];

    public function store(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $data = $request->validate([
            'product_id' => ['nullable', 'exists:products,id'],
            'name' => ['required', 'string', 'max:255'],
            'icon' => ['required', 'string', 'max:255'],
            'icon_url' => ['nullable', 'string', 'max:2048', 'url'],
            'nutrition_category' => ['nullable', 'string', Rule::in(self::NUTRITION_CATEGORIES)],
            'location' => ['nullable', 'string', 'in:fridge,freezer,pantry'],
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'expiry_date' => ['nullable', 'date'],
            'shelf_life_days' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'in:manual,barcode,receipt,photo,voice'],
            'shop_url' => ['nullable', 'string', 'max:2048', 'url'],
        ]);

        $item = $section->items()->create($data);

        return new ItemResource($item->load('product'));
    }

    public function update(Request $request, Item $item)
    {
        $this->authorize('update', $item);

        $data = $request->validate([
            'product_id' => ['sometimes', 'nullable', 'exists:products,id'],
            'section_id' => ['sometimes', Rule::exists('sections', 'id')->where(
                fn ($q) => $q->whereIn('fridge_id', $request->user()->memberFridges()->pluck('fridges.id'))
            )],
            'name' => ['sometimes', 'string', 'max:255'],
            'icon' => ['sometimes', 'string', 'max:255'],
            'icon_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'url'],
            'nutrition_category' => ['sometimes', 'nullable', 'string', Rule::in(self::NUTRITION_CATEGORIES)],
            'location' => ['sometimes', 'nullable', 'string', 'in:fridge,freezer,pantry'],
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'expiry_date' => ['sometimes', 'nullable', 'date'],
            'shelf_life_days' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'opened' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'source' => ['sometimes', 'nullable', 'string', 'in:manual,barcode,receipt,photo,voice'],
            'shop_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'url'],
        ]);

        $item->update($data);

        return new ItemResource($item->load('product'));
    }

    public function destroy(Request $request, Item $item)
    {
        $this->authorize('delete', $item);

        $item->delete();

        return response()->noContent();
    }
}
