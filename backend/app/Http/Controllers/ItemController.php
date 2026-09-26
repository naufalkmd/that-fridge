<?php

namespace App\Http\Controllers;

use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Models\Product;
use App\Models\Section;
use App\Services\AgentService;
use App\Services\CreditService;
use App\Services\CustomFieldAutofill;
use App\Services\ItemRemovalService;
use App\Support\AlgoFeedback;
use App\Support\CreditCost;
use App\Support\CustomFieldValue;
use App\Support\FoodGroupClassifier;
use App\Support\ItemFeedback;
use App\Support\ItemPayload;
use App\Support\ItemSuggestionToken;
use App\Support\OpenedShelfLife;
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
            'source' => ['nullable', 'string', 'in:manual,barcode,receipt,photo,voice,chat'],
            'shop_url' => ['nullable', 'string', 'max:2048', 'url'],
            'calories' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'custom_fields' => ['nullable', 'array', 'max:20'],
            'custom_fields.*.id' => ['nullable', 'string', 'max:36'],
            'custom_fields.*.label' => ['required', 'string', 'max:40'],
            'custom_fields.*.value' => ['nullable', 'string', 'max:255'],
            'suggestion_token' => ['sometimes', 'string', 'max:2048'],
            'barcode_miss' => ['sometimes', 'string', 'max:64', 'regex:/^[A-Za-z0-9-]+$/'],
            'add_started_at' => ['sometimes', 'date'],
            'parsed_name' => ['sometimes', 'string', 'max:255'],
        ]);

        $suggested = ItemSuggestionToken::read($request->user(), $data['name'], $data['suggestion_token'] ?? null);
        $itemData = array_diff_key($data, ['suggestion_token' => true, 'barcode_miss' => true, 'add_started_at' => true, 'parsed_name' => true]);
        $item = $section->items()->create(ItemPayload::normalize($itemData));
        ItemFeedback::created($request->user(), $item, $suggested, $data['add_started_at'] ?? null);
        ItemFeedback::scanned($request->user(), $item, $data['parsed_name'] ?? null);
        if (isset($data['barcode_miss']) && ! Product::where('barcode', $data['barcode_miss'])->exists()) {
            AlgoFeedback::record($request->user(), 'barcode', [
                'kind' => 'miss_named', 'name' => $item->name,
                'guess' => $data['barcode_miss'], 'source' => 'scanner',
                'outcome' => 'submitted',
            ]);
        }

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
            'opened_shelf_life_days' => ['sometimes', 'integer', 'min:1', 'max:365'],
            'note' => ['sometimes', 'nullable', 'string', 'max:255'],
            'source' => ['sometimes', 'nullable', 'string', 'in:manual,barcode,receipt,photo,voice,chat'],
            'shop_url' => ['sometimes', 'nullable', 'string', 'max:2048', 'url'],
            'calories' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100000'],
            'custom_fields' => ['sometimes', 'array', 'max:20'],
            'custom_fields.*.id' => ['nullable', 'string', 'max:36'],
            'custom_fields.*.label' => ['required', 'string', 'max:40'],
            'custom_fields.*.value' => ['nullable', 'string', 'max:255'],
        ]);

        if (isset($data['opened_shelf_life_days'])) {
            abort_unless((bool) ($data['opened'] ?? $item->opened), 422, 'Mark the item opened before setting its opening duration.');
            $baseline = OpenedShelfLife::resolve(
                $data['name'] ?? $item->name,
                $data['icon'] ?? $item->icon,
                $data['location'] ?? $item->location,
                $data['nutrition_category'] ?? $item->nutrition_category,
                $data['shelf_life_days'] ?? $item->shelf_life_days,
            );
            abort_if(
                $data['opened_shelf_life_days'] > ($baseline['days'] ?? 3) &&
                ! OpenedShelfLife::canLengthen($data['name'] ?? $item->name, $data['location'] ?? $item->location),
                422,
                'Opening estimates for this food can only be shortened.',
            );
        }

        $before = ItemFeedback::snapshot($item);
        $item->update(ItemPayload::normalize($data));
        ItemFeedback::updated($request->user(), $item, $before);
        ItemFeedback::autofillApplied($request->user(), $item, $data);

        return new ItemResource($item->load('product'));
    }

    /**
     * AI "Autofill" for an existing item's still-empty weight, calories, shelf life, and food
     * group, in one credit-metered call. Deliberately only ever proposes fields the item is
     * missing - never a field it already has a value for, so pressing this can't silently
     * overwrite something the user (or a scan) already set. The client applies the returned
     * fields via a normal PATCH, same review-then-confirm shape as estimate-calories.
     */
    public function autofill(Request $request, Item $item, CustomFieldAutofill $customFields)
    {
        $this->authorize('update', $item);

        $needsWeight = $item->weight === null;
        $needsCalories = $item->calories === null;
        $needsShelfLife = $item->expiry_date === null;
        $needsCategory = $item->nutrition_category === null;

        // Empty custom fields ("Protein"...): what history and the nutrient table can settle is free; what is left rides on the one AI call.
        $custom = $customFields->resolve($request->user(), $item);
        $needsCustomAi = $custom['ask'] !== [];

        if (! $needsWeight && ! $needsCalories && ! $needsShelfLife && ! $needsCategory && $custom['filled'] === [] && ! $needsCustomAi) {
            return response()->json(['fields' => (object) []], 200);
        }

        $fields = [];
        $categorySource = 'ai';
        $customSources = [];
        $customValues = [];
        foreach ($custom['filled'] as $label => $found) {
            $customValues[$label] = $found['value'];
            $customSources[$label] = $found['source'];
        }

        // Deterministic food-group classification first (keyword rules, then a cache of
        // previously AI-resolved names - see FoodGroupClassifier) - a confident hit here
        // never needs an AI call. When category was the ONLY thing this item needed, that
        // means skipping the AI call - and its credit - entirely.
        if ($needsCategory) {
            $localCategory = FoodGroupClassifier::resolve($item->name, $item->icon);
            if ($localCategory !== null) {
                $fields['nutrition_category'] = $localCategory;
                $categorySource = 'classifier';
                $needsCategory = false;
            }
        }

        if (! $needsWeight && ! $needsCalories && ! $needsShelfLife && ! $needsCategory && ! $needsCustomAi) {
            ItemFeedback::autofillProposed($request->user(), $item, $fields, $categorySource);

            return $this->autofillResponse($item, $fields, $customValues, $customSources);
        }

        $this->credits->spend($request->user(), CreditCost::AUTOFILL, 'item_autofill');

        $estimate = $this->agent->autofillItemDetails($item, $custom['ask'], $custom['examples']);
        foreach ($estimate['custom'] ?? [] as $label => $value) {
            $customValues[$label] = $value;
            $customSources[$label] = 'ai';
        }

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
        // Left out entirely (not even a null field) when even the AI couldn't confidently
        // classify it - leaving nutrition_category blank beats forcing a wrong bucket, see
        // FoodGroupClassifier's docblock.
        if ($needsCategory && $estimate['nutrition_category'] !== null) {
            $fields['nutrition_category'] = $estimate['nutrition_category'];
        }

        // Only weight and category can legitimately come back empty (no sensible unit
        // weight, or a name nothing could confidently classify) - refund when that left
        // nothing new at all, since the user got nothing for their credit, same precedent as
        // CalorieController::scanLabel.
        if ($fields === [] && $customValues === []) {
            $this->credits->grant($request->user(), CreditCost::AUTOFILL, 'item_autofill_refund');

            return response()->json(['fields' => (object) [], 'message' => "Couldn't confidently estimate anything new for this item."], 200);
        }

        ItemFeedback::autofillProposed($request->user(), $item, $fields, $categorySource);

        return $this->autofillResponse($item, $fields, $customValues, $customSources);
    }

    /**
     * The proposal: the plain fields, plus - when custom fields were filled - the item's WHOLE custom_fields array with the new values
     * in place (ids kept), because that is what the client PATCHes back (it replaces the array). `custom_sources` says where each
     * value came from (history / table / ai) so the review card can show it. Values are proposals only; nothing is written here.
     *
     * @param  array<string, mixed>  $fields
     * @param  array<string, string>  $customValues  label => proposed value
     * @param  array<string, string>  $customSources  label => history|table|ai
     */
    private function autofillResponse(Item $item, array $fields, array $customValues, array $customSources)
    {
        $body = ['fields' => $fields];
        if ($customValues !== []) {
            $rows = array_map(function ($row) use ($customValues) {
                foreach ($customValues as $label => $value) {
                    if (trim((string) ($row['value'] ?? '')) === '' && CustomFieldValue::sameLabel((string) ($row['label'] ?? ''), (string) $label)) {
                        $row['value'] = $value;
                    }
                }

                return $row;
            }, $item->custom_fields ?? []);
            $body['fields']['custom_fields'] = array_values($rows);
            $body['custom_sources'] = $customSources;
        }
        $body['fields'] = (object) $body['fields'];

        return response()->json($body, 200);
    }

    public function destroy(Request $request, Item $item)
    {
        $this->authorize('delete', $item);

        $context = $request->query('context');
        abort_if($context !== null && ! in_array($context, ['recipe_used'], true), 422);
        $outcome = app(ItemRemovalService::class)->remove($request->user(), $item, $context);

        return response()->json([
            'id' => (string) $outcome->id,
            'outcome' => $outcome->outcome,
            'confidence' => $outcome->confidence,
        ]);
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
