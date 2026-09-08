<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Mirrors the backend credit balance into RevenueCat's Virtual Currency ("AICR") so the RC
 * dashboard and the SDK's getVirtualCurrencies() show the same number. Best-effort only -
 * CreditService stays authoritative and never blocks on this. Configure the secret API key
 * + currency code in config/services.php; with no key set this is a silent no-op (local dev,
 * tests).
 */
class RevenueCatVirtualCurrency
{
    public function adjust(User $user, int $delta): void
    {
        $key = config('services.revenuecat.secret_api_key');
        $project = config('services.revenuecat.project_id');
        $code = config('services.revenuecat.currency_code', 'AICR');

        if (! $key || ! $project || $delta === 0) {
            return;
        }

        try {
            $response = Http::withToken($key)
                ->acceptJson()
                ->post("https://api.revenuecat.com/v2/projects/{$project}/customers/{$user->id}/virtual_currencies/transactions", [
                    'adjustments' => [$code => $delta],
                ]);

            if ($response->failed()) {
                Log::warning('RC virtual-currency mirror failed', [
                    'user_id' => $user->id, 'delta' => $delta, 'status' => $response->status(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('RC virtual-currency mirror threw', ['user_id' => $user->id, 'error' => $e->getMessage()]);
        }
    }
}
