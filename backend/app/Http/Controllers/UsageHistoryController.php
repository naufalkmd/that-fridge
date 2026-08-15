<?php

namespace App\Http\Controllers;

use App\Http\Resources\UsageHistoryResource;
use App\Models\UsageHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class UsageHistoryController extends Controller
{
    // Mirrors ItemController::NUTRITION_CATEGORIES - keep both in sync if the allowed set changes.
    private const NUTRITION_CATEGORIES = ['protein', 'vegetables', 'fruit', 'grains', 'dairy', 'other_extras'];

    public function index(Request $request)
    {
        $entries = $request->user()->usageHistory()->orderByDesc('last_used_at')->get();

        return UsageHistoryResource::collection($entries);
    }

    /**
     * Record that an item was used up - increments the existing entry for this item name
     * if one exists, otherwise creates one. This is what makes "Shopkeeper remembers items
     * you use often" actually true: AgentService reads this back into the agent's prompt
     * (see buildUsageSummary on the frontend) instead of it just sitting in a list no one
     * but the user ever looks at.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'icon' => ['required', 'string', 'max:255'],
            // Both optional and both fed straight from data the frontend already has at the
            // moment an item is removed (Item.days / Item.freshness) - not invented. They back
            // the "items rescued" / "average freshness at use" goal metrics (see UserGoal).
            'daysRemaining' => ['sometimes', 'nullable', 'integer'],
            'freshness' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            // The item's nutrition category at the moment it was used - feeds the Food
            // Balance goal metric's variety calculation. Optional; older/uncategorized items
            // just won't contribute a category for that use.
            'category' => ['sometimes', 'nullable', 'string', Rule::in(self::NUTRITION_CATEGORIES)],
        ]);

        $key = Str::lower(trim($data['name']));

        $freshUseIncrement = array_key_exists('daysRemaining', $data) && $data['daysRemaining'] !== null && $data['daysRemaining'] >= 0 ? 1 : 0;
        $freshnessIncrement = array_key_exists('freshness', $data) && $data['freshness'] !== null ? $data['freshness'] : 0;
        $freshnessSampleIncrement = array_key_exists('freshness', $data) && $data['freshness'] !== null ? 1 : 0;

        $entry = $request->user()->usageHistory()->where('key', $key)->first();

        if ($entry) {
            $entry->update([
                'count' => $entry->count + 1,
                'fresh_use_count' => $entry->fresh_use_count + $freshUseIncrement,
                'freshness_sum' => $entry->freshness_sum + $freshnessIncrement,
                'freshness_sample_count' => $entry->freshness_sample_count + $freshnessSampleIncrement,
                'last_used_at' => now(),
                'name' => $data['name'],
                'icon' => $data['icon'],
                'category' => $data['category'] ?? $entry->category,
            ]);
        } else {
            $entry = $request->user()->usageHistory()->create([
                'key' => $key,
                'name' => $data['name'],
                'icon' => $data['icon'],
                'category' => $data['category'] ?? null,
                'count' => 1,
                'fresh_use_count' => $freshUseIncrement,
                'freshness_sum' => $freshnessIncrement,
                'freshness_sample_count' => $freshnessSampleIncrement,
                'last_used_at' => now(),
            ]);
        }

        return new UsageHistoryResource($entry);
    }

    public function destroy(Request $request, UsageHistory $usageHistory)
    {
        $this->authorize('delete', $usageHistory);

        $usageHistory->delete();

        return response()->noContent();
    }

    public function clear(Request $request)
    {
        $request->user()->usageHistory()->delete();

        return response()->noContent();
    }
}
