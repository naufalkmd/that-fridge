<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Thin wrapper around fal.ai's synchronous REST endpoint for the flux/schnell model -
 * same shape as OpenRouterClient, kept separate since it's a different provider/auth scheme.
 */
class FalClient
{
    protected ?string $apiKey;

    protected string $generateUrl = 'https://fal.run/fal-ai/flux/schnell';

    protected string $rembgUrl = 'https://fal.run/fal-ai/imageutils/rembg';

    public function __construct()
    {
        $this->apiKey = config('services.fal.key');
    }

    public function available(): bool
    {
        return (bool) $this->apiKey;
    }

    /**
     * Generate an image from a prompt. Returns:
     *   ['ok' => true, 'image_url' => string]
     * or, on failure:
     *   ['ok' => false, 'reason' => 'no_api_key'|'unauthorized'|'rate_limited'|'server_error'|'api_error'|'exception', 'status' => ?int]
     */
    public function generate(string $prompt): array
    {
        return $this->post($this->generateUrl, [
            'prompt' => $prompt,
            'image_size' => 'square',
            'num_images' => 1,
            'output_format' => 'png',
        ], 'images.0.url', 'Icon generation', 'cost_generate', 0.003);
    }

    /**
     * flux/schnell doesn't reliably produce true alpha transparency from a prompt alone, so
     * generated icons get passed through a dedicated background-removal model before being
     * stored - keeps them visually consistent with the curated set's transparent PNGs.
     */
    public function removeBackground(string $imageUrl): array
    {
        return $this->post($this->rembgUrl, ['image_url' => $imageUrl], 'image.url', 'Icon background removal', 'cost_rembg', 0.0005);
    }

    /**
     * fal.ai does not report a cost per call, so each call is logged with an ESTIMATE from config (services.fal.cost_generate /
     * cost_rembg, in US$): flux/schnell is billed per megapixel and one square icon is about one. Correct the config if fal's prices change.
     */
    private function post(string $url, array $body, string $urlField, string $feature = 'Icon generation', string $costKey = 'cost_generate', float $defaultCost = 0.003): array
    {
        if (! $this->available()) {
            return ['ok' => false, 'reason' => 'no_api_key'];
        }

        try {
            $startedAt = microtime(true);
            $response = Http::withHeaders([
                'Authorization' => "Key {$this->apiKey}",
            ])->post($url, $body);
            $latency = (int) round((microtime(true) - $startedAt) * 1000);
            $record = fn (bool $ok, ?string $reason = null) => app(ApiUsageLogger::class)->record([
                'provider' => 'fal', 'feature' => $feature, 'model' => str_replace('https://fal.run/', '', $url), 'ok' => $ok, 'reason' => $reason,
                'cost_usd' => $ok ? (float) config("services.fal.{$costKey}", $defaultCost) : null, 'cost_estimated' => true, 'latency_ms' => $latency,
            ]);

            if ($response->successful()) {
                $imageUrl = $response->json($urlField);

                if (! $imageUrl) {
                    $record(false, 'api_error');
                    Log::error('fal.ai response missing image url', ['url' => $url, 'body' => $response->body()]);

                    return ['ok' => false, 'reason' => 'api_error', 'status' => $response->status()];
                }

                $record(true);

                return ['ok' => true, 'image_url' => $imageUrl];
            }

            $reason = match (true) {
                $response->status() === 401 => 'unauthorized',
                $response->status() === 429 => 'rate_limited',
                $response->status() >= 500 => 'server_error',
                default => 'api_error',
            };

            $record(false, $reason);
            Log::error('fal.ai API error', ['url' => $url, 'status' => $response->status(), 'reason' => $reason, 'body' => $response->body()]);

            return ['ok' => false, 'reason' => $reason, 'status' => $response->status()];
        } catch (\Exception $e) {
            Log::error('fal.ai request failed', ['url' => $url, 'error' => $e->getMessage()]);

            return ['ok' => false, 'reason' => 'exception'];
        }
    }
}
