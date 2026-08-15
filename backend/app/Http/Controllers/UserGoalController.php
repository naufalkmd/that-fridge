<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserGoalResource;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserGoalController extends Controller
{
    // money_saved is deliberately not in this list - there's no price data anywhere in the
    // schema (no price column on products/items/receipt_line_items), so it can't be computed
    // without inventing a number. See backend/API.md for the full explanation.
    public const METRIC_TYPES = ['waste_rate', 'items_rescued', 'freshness_at_use'];

    public const PERIODS = ['weekly', 'monthly'];

    // waste_rate and freshness_at_use are both 0-100 scales (a percentage and a freshness
    // score respectively) - a target above 100 for either is nonsensical. items_rescued is a
    // plain count with no such ceiling.
    private const PERCENTAGE_METRICS = ['waste_rate', 'freshness_at_use'];

    private const DEFAULTS = [
        'metric_type' => 'waste_rate',
        'target_value' => 20, // keep waste under 20%
        'period' => 'weekly',
        'is_active' => true,
    ];

    public function show(Request $request)
    {
        $goal = $request->user()->goal()->firstOrCreate([], self::DEFAULTS);

        return new UserGoalResource($goal);
    }

    public function update(Request $request)
    {
        $goal = $request->user()->goal()->firstOrCreate([], self::DEFAULTS);

        $data = $this->validated($request, $goal->metric_type);

        $goal->update($data);

        return new UserGoalResource($goal);
    }

    private function validated(Request $request, string $currentMetricType): array
    {
        $input = $request->validate([
            'metricType' => ['sometimes', 'string', Rule::in(self::METRIC_TYPES)],
            'targetValue' => ['sometimes', 'integer', 'min:1'],
            'period' => ['sometimes', 'string', Rule::in(self::PERIODS)],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $effectiveMetric = $input['metricType'] ?? $currentMetricType;

        if (isset($input['targetValue']) && in_array($effectiveMetric, self::PERCENTAGE_METRICS, true) && $input['targetValue'] > 100) {
            throw ValidationException::withMessages([
                'targetValue' => ['targetValue must be 100 or less for this metric.'],
            ]);
        }

        return array_filter([
            'metric_type' => $input['metricType'] ?? null,
            'target_value' => $input['targetValue'] ?? null,
            'period' => $input['period'] ?? null,
            'is_active' => $input['isActive'] ?? null,
        ], fn ($value) => $value !== null);
    }
}
