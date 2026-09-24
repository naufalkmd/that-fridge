<?php

namespace App\Http\Controllers;

use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Models\Section;
use App\Services\AgentService;
use App\Services\CreditService;
use App\Support\CreditCost;
use App\Support\ItemPayload;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    // Kept as plain constants (not a DB enum) so the allowed set can change without a
    // migration - same treatment as the icon/location/source fields below.
    public const NUTRITION_CATEGORIES = ['protein', 'vegetables', 'fruit', 'grains', 'dairy', 'other_extras'];

    // Alias so existing Rule::in(self::WEIGHT_UNITS) call sites below don't need to change -
    // the real list now lives in ItemPayload, shared with AgentToolbox's update_item tool.
    public const WEIGHT_UNITS = ItemPayload::WEIGHT_UNITS;

    public function __construct(
        protected AgentService $agent,
        protected CreditService $credits,
    ) {}

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

        $item = $section->items()->create(ItemPayload::normalize($data));

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

        $item->update(ItemPayload::normalize($data));

        return new ItemResource($item->load('product'));
    }

    /**
     * AI "Autofill" for an existing item's still-empty weight, calories, shelf life, and food
     * group, in one credit-metered call. Deliberately only ever proposes fields the item is
     * missing - never a field it already has a value for, so pressing this can't silently
     * overwrite something the user (or a scan) already set. The client applies the returned
     * fields via a normal PATCH, same review-then-confirm shape as estimate-calories.
     */
    public function autofill(Request $request, Item $item)
    {
        $this->authorize('update', $item);

        $needsWeight = $item->weight === null;
        $needsCalories = $item->calories === null;
        $needsShelfLife = $item->expiry_date === null;
        $needsCategory = $item->nutrition_category === null;

        if (! $needsWeight && ! $needsCalories && ! $needsShelfLife && ! $needsCategory) {
            return response()->json(['fields' => (object) []], 200);
        }

        $this->credits->spend($request->user(), CreditCost::AUTOFILL, 'item_autofill');

        $estimate = $this->agent->autofillItemDetails($item);

        $fields = [];
        if ($needsWeight && $estimate['weight'] !== null) {
            $fields['weight'] = $estimate['weight'];
            $fields['weight_unit'] = $estimate['weight_unit'];
        }
        if ($needsCalories) {
            $fields['calories'] = $estimate['calories'];
        }
        if ($needsShelfLife) {
            $fields['shelf_life_days'] = $estimate['shelf_life_days'];
            $fields['expiry_date'] = now()->addDays($estimate['shelf_life_days'])->toDateString();
        }
        if ($needsCategory) {
            $fields['nutrition_category'] = $estimate['nutrition_category'];
        }

        // Only weight can legitimately come back empty (a food with no sensible unit
        // weight) - refund when that was the only thing this item needed, since the user
        // got nothing for their credit, same precedent as CalorieController::scanLabel.
        if ($fields === []) {
            $this->credits->grant($request->user(), CreditCost::AUTOFILL, 'item_autofill_refund');

            return response()->json(['fields' => (object) [], 'message' => "Couldn't confidently estimate anything new for this item."], 200);
        }

        return response()->json(['fields' => (object) $fields], 200);
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
