<?php

namespace App\Services;

use App\Models\AiBalanceCheckpoint;
use App\Models\ApiUsageLog;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * The live account figures OpenRouter will tell us with the API key we already have: how much has been used, and (when a spend limit
 * or purchased credit balance is visible) how much is left. Cached for ten minutes so the dashboard never waits on it, and any
 * failure is just "unavailable". fal.ai offers no such endpoint for a normal key, so its balance is the last one the operator entered (AiBalanceCheckpoint) minus the
 * estimated fal.ai spend logged since.
 */
class AiProviderBalance
{
    private const CACHE_KEY = 'admin:openrouter-account';

    /** @return array{used: ?float, remaining: ?float, limit: ?float}|null null when there is no key or OpenRouter would not say */
    public function openRouter(): ?array
    {
        $key = config('services.openrouter.key');
        if (! $key) {
            return null;
        }

        return Cache::remember(self::CACHE_KEY, 600, fn () => $this->fetch((string) $key)) ?: null;
    }

    /**
     * @return array{balance: float, remaining: float, spent_since: float, as_of: Carbon}|null null until a balance has been entered
     */
    public function fal(): ?array
    {
        $checkpoint = AiBalanceCheckpoint::where('provider', 'fal')->orderByDesc('recorded_at')->orderByDesc('id')->first();
        if (! $checkpoint) {
            return null;
        }
        $spent = (float) ApiUsageLog::where('provider', 'fal')->where('created_at', '>=', $checkpoint->recorded_at)->sum('cost_usd');

        return [
            'balance' => $checkpoint->balance_usd,
            'remaining' => max(0.0, round($checkpoint->balance_usd - $spent, 4)),
            'spent_since' => round($spent, 4),
            'as_of' => $checkpoint->recorded_at,
        ];
    }

    /** @return array{used: ?float, remaining: ?float, limit: ?float}|false */
    private function fetch(string $key): array|false
    {
        try {
            $headers = ['Authorization' => "Bearer {$key}"];

            // Purchased credits and lifetime usage (works for keys allowed to read the account).
            $credits = Http::withHeaders($headers)->timeout(6)->get('https://openrouter.ai/api/v1/credits');
            if ($credits->successful() && is_numeric($credits->json('data.total_credits'))) {
                $total = (float) $credits->json('data.total_credits');
                $used = (float) ($credits->json('data.total_usage') ?? 0);

                return ['used' => $used, 'remaining' => max(0.0, $total - $used), 'limit' => $total];
            }

            // Otherwise the key's own usage and spend limit.
            $info = Http::withHeaders($headers)->timeout(6)->get('https://openrouter.ai/api/v1/key');
            if ($info->successful() && is_array($info->json('data'))) {
                $limit = $info->json('data.limit');

                return [
                    'used' => is_numeric($info->json('data.usage')) ? (float) $info->json('data.usage') : null,
                    'remaining' => is_numeric($info->json('data.limit_remaining')) ? (float) $info->json('data.limit_remaining') : null,
                    'limit' => is_numeric($limit) ? (float) $limit : null,
                ];
            }
        } catch (\Throwable) {
            // unavailable
        }

        return false;
    }
}
