<?php

namespace App\Services;

use App\Models\ApiUsageLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/** Records one AI provider call. It must never break the call it is describing, so every failure is swallowed (and logged). */
class ApiUsageLogger
{
    /**
     * @param  array{provider: string, feature: string, model?: ?string, prompt_tokens?: int, completion_tokens?: int, cost_usd?: ?float, cost_estimated?: bool, ok: bool, reason?: ?string, latency_ms?: int}  $data
     */
    public function record(array $data): void
    {
        try {
            ApiUsageLog::create($data + ['user_id' => Auth::id()]);
        } catch (\Throwable $e) {
            Log::warning('Could not record AI usage', ['error' => $e->getMessage()]);
        }
    }
}
