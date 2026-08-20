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
        ], 'images.0.url');
    }

    /**
     * flux/schnell doesn't reliably produce true alpha transparency from a prompt alone, so
     * generated icons get passed through a dedicated background-removal model before being
     * stored - keeps them visually consistent with the curated set's transparent PNGs.
     */
    public function removeBackground(string $imageUrl): array
    {
        return $this->post($this->rembgUrl, ['image_url' => $imageUrl], 'image.url');
    }

    private function post(string $url, array $body, string $urlField): array
    {
        if (! $this->available()) {
            return ['ok' => false, 'reason' => 'no_api_key'];
        }

        try {
            $response = Http::withHeaders([
                'Authorization' => "Key {$this->apiKey}",
            ])->post($url, $body);

            if ($response->successful()) {
                $imageUrl = $response->json($urlField);

                if (! $imageUrl) {
                    Log::error('fal.ai response missing image url', ['url' => $url, 'body' => $response->body()]);

                    return ['ok' => false, 'reason' => 'api_error', 'status' => $response->status()];
                }

                return ['ok' => true, 'image_url' => $imageUrl];
            }

            $reason = match (true) {
                $response->status() === 401 => 'unauthorized',
                $response->status() === 429 => 'rate_limited',
                $response->status() >= 500 => 'server_error',
                default => 'api_error',
            };

            Log::error('fal.ai API error', ['url' => $url, 'status' => $response->status(), 'reason' => $reason, 'body' => $response->body()]);

            return ['ok' => false, 'reason' => $reason, 'status' => $response->status()];
        } catch (\Exception $e) {
            Log::error('fal.ai request failed', ['url' => $url, 'error' => $e->getMessage()]);

            return ['ok' => false, 'reason' => 'exception'];
        }
    }
}
