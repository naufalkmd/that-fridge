<?php

namespace App\Http\Controllers;

use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Models\Section;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    // Kept as plain constants (not a DB enum) so the allowed set can change without a
    // migration - same treatment as the icon/location/source fields below.
    public const NUTRITION_CATEGORIES = ['protein', 'vegetables', 'fruit', 'grains', 'dairy', 'other_extras'];

    // Metric mass/volume plus imperial - covers a block of cheese in grams and a carton of
    // milk in liters the same way. Order matters to the client's chip picker.
    public const WEIGHT_UNITS = ['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb'];

    public function store(Request $request, Section $section)
    {
        $this->authorize('update', $section);

        $data = $request->validate([
            'product_id' => ['nullable', 'exists:products,id'],
            'name' => ['required', 'string', 'max:255'],
            'icon' => ['required', 'string', 'max:255'],
            'icon_url' => ['nullable', 'string', 'max:2048', 'url'],
            'nutrition_category' => ['nullable', 'string', Rule::in(self::NUTRITION_CATEGORIES)],
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $request->user()->id)],
            'location' => ['nullable', 'string', 'in:fridge,freezer,pantry'],
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'weight' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'weight_unit' => ['nullable', 'string', Rule::in(self::WEIGHT_UNITS), 'required_with:weight'],
            'expiry_date' => ['nullable', 'date'],
            'shelf_life_days' => ['nullable', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'in:manual,barcode,receipt,photo,voice'],
            'shop_url' => ['nullable', 'string', 'max:2048', 'url'],
            'calories' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'custom_fields' => ['nullable', 'array', 'max:20'],
            'custom_fields.*.id' => ['nullable', 'string', 'max:36'],
            'custom_fields.*.label' => ['required', 'string', 'max:40'],
            'custom_fields.*.value' => ['nullable', 'string', 'max:255'],
        ]);

        $item = $section->items()->create($this->normalizeItemPayload($data));

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
            'category_id' => ['sometimes', 'nullable', Rule::exists('categories', 'id')->where('user_id', $request->user()->id)],
            'location' => ['sometimes', 'nullable', 'string', 'in:fridge,freezer,pantry'],
            'quantity' => ['sometimes', 'integer', 'min:1'],
            'weight' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999999'],
            // No 'sometimes' here (unlike every other field): 'sometimes' skips a field's
            // rules entirely when *that* field is absent from the request, which would let a
            // PATCH of {weight: 5} alone skip required_with:weight - the exact case it exists
            // to catch. Safe without it: 'nullable' still short-circuits when both weight and
            // weight_unit are absent, and required_with only fires when weight *is* present.
            'weight_unit' => ['nullable', 'string', Rule::in(self::WEIGHT_UNITS), 'required_with:weight'],
            'expiry_date' => ['sometimes', 'nullable', 'date'],
            'shelf_life_days' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'opened' => ['sometimes', 'boolean'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'source' => ['sometimes', 'nullable', 'string', 'in:manual,barcode,receipt,photo,voice'],
            'shop_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'url'],
            'calories' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'custom_fields' => ['sometimes', 'array', 'max:20'],
            'custom_fields.*.id' => ['nullable', 'string', 'max:36'],
            'custom_fields.*.label' => ['required', 'string', 'max:40'],
            'custom_fields.*.value' => ['nullable', 'string', 'max:255'],
        ]);

        $item->update($this->normalizeItemPayload($data));

        return new ItemResource($item->load('product'));
    }

    /**
     * Two rules validation alone can't express: clearing `weight` must clear `weight_unit`
     * too (Rule::in/required_with only constrain what's present, not what a null implies);
     * and custom_fields entries need a stable id - the client omits it for a brand-new row,
     * so one is assigned here rather than trusting the client to invent one.
     */
    private function normalizeItemPayload(array $data): array
    {
        if (array_key_exists('weight', $data) && $data['weight'] === null) {
            $data['weight_unit'] = null;
        }

        if (isset($data['custom_fields'])) {
            $data['custom_fields'] = array_values(array_map(fn ($field) => [
                'id' => $field['id'] ?? (string) Str::uuid(),
                'label' => trim($field['label']),
                'value' => trim($field['value'] ?? ''),
            ], $data['custom_fields']));
        }

        return $data;
    }

    public function destroy(Request $request, Item $item)
    {
        $this->authorize('delete', $item);

        $item->delete();

        return response()->noContent();
    }

    /**
     * Assign a user-defined category (or null to clear) to many items at once — backs the
     * Inventory multi-select "Move to…" action. Each item is authorized individually against
     * ItemPolicy; ones the caller can't touch are silently skipped.
     */
    public function bulkCategory(Request $request)
    {
        $data = $request->validate([
            'item_ids' => ['required', 'array', 'min:1'],
            'item_ids.*' => ['integer'],
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('user_id', $request->user()->id)],
        ]);

        $items = Item::with('section.fridge')->whereIn('id', $data['item_ids'])->get();

        $updated = 0;
        foreach ($items as $item) {
            if ($request->user()->can('update', $item)) {
                $item->update(['category_id' => $data['category_id'] ?? null]);
                $updated++;
            }
        }

        return response()->json(['updated' => $updated]);
    }
}
