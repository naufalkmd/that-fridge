<?php

namespace App\Services;

use App\Models\AiCreditLedger;
use App\Models\ApiUsageLog;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * What each AI feature and each user actually cost, next to the credits they were charged, for the
 * AI costs admin page. Costs come from our call log (ApiUsageLog, OpenRouter's reported cost per
 * call; fal.ai is estimated), credits from the ledger net of refunds. Summed in SQL; only the
 * grouped rows come back to PHP.
 */
class AiCostReport
{
    /** What a credit is priced at (see CreditCost). Free monthly credits earn nothing, so this is an upper bound. */
    public const CREDIT_USD = 0.01;

    /** Ledger reason (refunds are "<reason>_refund") => the ApiUsageFeature label for the same action. */
    private const REASON_FEATURE = [
        'chat' => 'Quick Chat', 'chat_image' => 'Quick Chat', 'chat_pdf' => 'Quick Chat', 'chat_tools' => 'Quick Chat',
        'icon' => 'Icon generation', 'expiry_scan' => 'Expiry date scan', 'receipt_scan' => 'Receipt scan',
        'photo_scan' => 'Fridge photo scan', 'label_scan' => 'Nutrition label scan', 'calorie_estimate' => 'Calorie estimate',
        'autofill' => 'Add-item autofill', 'item_autofill' => 'Item autofill', 'machine_build' => 'Kitchen Lab draft',
        'meal_autofill' => 'Ask Chef (meal plan)', 'recipe_chef' => 'Ask Chef (recipe)',
    ];

    /** The feature a ledger reason paid for, or null for grants, packs and admin adjustments. */
    public static function featureForReason(string $reason): ?string
    {
        return self::REASON_FEATURE[preg_replace('/_refund$/', '', $reason)] ?? null;
    }

    /**
     * One row per feature, most expensive first.
     *
     * @return list<array{feature: string, calls: int, failed: int, users: int, prompt_tokens: int, completion_tokens: int,
     *     cost: float, unpriced: int, avg_cost: ?float, cost_per_user: ?float, credits: ?int, credit_value: ?float, margin: ?float}>
     */
    public function byFeature(int $days): array
    {
        $credits = $this->creditsByFeature($days);

        $rows = ApiUsageLog::query()
            ->where('created_at', '>=', $this->since($days))
            ->groupBy('feature')
            ->selectRaw('feature, count(*) as calls, sum(case when ok then 0 else 1 end) as failed, count(distinct user_id) as users,
                sum(prompt_tokens) as prompt_tokens, sum(completion_tokens) as completion_tokens, sum(cost_usd) as cost,
                sum(case when ok and cost_usd is null then 1 else 0 end) as unpriced')
            ->get()
            ->map(function ($r) use ($credits) {
                $cost = (float) $r->cost;
                $calls = (int) $r->calls;
                $users = (int) $r->users;
                $charged = $credits[$r->feature] ?? null;

                return [
                    'feature' => $r->feature,
                    'calls' => $calls,
                    'failed' => (int) $r->failed,
                    'users' => $users,
                    'prompt_tokens' => (int) $r->prompt_tokens,
                    'completion_tokens' => (int) $r->completion_tokens,
                    'cost' => round($cost, 4),
                    'unpriced' => (int) $r->unpriced,
                    'avg_cost' => $calls > 0 ? round($cost / $calls, 5) : null,
                    'cost_per_user' => $users > 0 ? round($cost / $users, 4) : null,
                    'credits' => $charged,
                    'credit_value' => $charged === null ? null : round($charged * self::CREDIT_USD, 2),
                    'margin' => $charged === null ? null : round($charged * self::CREDIT_USD - $cost, 4),
                ];
            })
            ->sortByDesc('cost')
            ->values()
            ->all();

        return $rows;
    }

    /**
     * The heaviest AI users, most expensive first.
     *
     * @return list<array{user_id: int, name: ?string, email: ?string, pro: bool, calls: int, cost: float, credits: int,
     *     credit_value: float, margin: float, top_feature: ?string, features: int}>
     */
    public function byUser(int $days, int $limit = 25): array
    {
        $perUser = [];
        ApiUsageLog::query()
            ->where('created_at', '>=', $this->since($days))
            ->whereNotNull('user_id')
            ->groupBy('user_id', 'feature')
            ->selectRaw('user_id, feature, count(*) as calls, sum(cost_usd) as cost')
            ->get()
            ->each(function ($r) use (&$perUser) {
                $u = &$perUser[(int) $r->user_id];
                $u['calls'] = ($u['calls'] ?? 0) + (int) $r->calls;
                $u['cost'] = ($u['cost'] ?? 0.0) + (float) $r->cost;
                $u['features'][$r->feature] = (float) $r->cost;
            });

        uasort($perUser, fn ($a, $b) => $b['cost'] <=> $a['cost']);
        $perUser = array_slice($perUser, 0, $limit, true);
        if ($perUser === []) {
            return [];
        }

        $ids = array_keys($perUser);
        $users = User::query()->whereIn('id', $ids)->get()->keyBy('id');
        $credits = $this->creditsByUser($days, $ids);

        $out = [];
        foreach ($perUser as $id => $u) {
            arsort($u['features']);
            $charged = $credits[$id] ?? 0;
            $user = $users->get($id);
            $out[] = [
                'user_id' => $id,
                'name' => $user?->name,
                'email' => $user?->email,
                'pro' => (bool) $user?->isPro(),
                'calls' => $u['calls'],
                'cost' => round($u['cost'], 4),
                'credits' => $charged,
                'credit_value' => round($charged * self::CREDIT_USD, 2),
                'margin' => round($charged * self::CREDIT_USD - $u['cost'], 4),
                'top_feature' => array_key_first($u['features']),
                'features' => count($u['features']),
            ];
        }

        return $out;
    }

    /**
     * Headline numbers for the period.
     *
     * @return array{cost: float, calls: int, users: int, credits: int, credit_value: float, margin: float}
     */
    public function totals(int $days): array
    {
        $row = ApiUsageLog::query()
            ->where('created_at', '>=', $this->since($days))
            ->selectRaw('sum(cost_usd) as cost, count(*) as calls, count(distinct user_id) as users')
            ->first();
        $credits = array_sum($this->creditsByFeature($days));
        $cost = (float) ($row->cost ?? 0);

        return [
            'cost' => round($cost, 4),
            'calls' => (int) ($row->calls ?? 0),
            'users' => (int) ($row->users ?? 0),
            'credits' => $credits,
            'credit_value' => round($credits * self::CREDIT_USD, 2),
            'margin' => round($credits * self::CREDIT_USD - $cost, 4),
        ];
    }

    /** @return array<string, int> net credits charged per feature (spends minus refunds) */
    private function creditsByFeature(int $days): array
    {
        $out = [];
        AiCreditLedger::query()
            ->where('created_at', '>=', $this->since($days))
            ->groupBy('reason')
            ->selectRaw('reason, sum(delta) as total')
            ->get()
            ->each(function ($r) use (&$out) {
                $feature = self::featureForReason($r->reason);
                if ($feature !== null) {
                    // Spends are negative deltas and refunds positive, so the net charge is minus the sum.
                    $out[$feature] = ($out[$feature] ?? 0) - (int) $r->total;
                }
            });

        return $out;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, int> net credits charged per user for AI features
     */
    private function creditsByUser(int $days, array $ids): array
    {
        $out = [];
        AiCreditLedger::query()
            ->where('created_at', '>=', $this->since($days))
            ->whereIn('user_id', $ids)
            ->groupBy('user_id', 'reason')
            ->selectRaw('user_id, reason, sum(delta) as total')
            ->get()
            ->each(function ($r) use (&$out) {
                if (self::featureForReason($r->reason) !== null) {
                    $out[(int) $r->user_id] = ($out[(int) $r->user_id] ?? 0) - (int) $r->total;
                }
            });

        return $out;
    }

    private function since(int $days): Carbon
    {
        return Carbon::now()->subDays($days);
    }
}
