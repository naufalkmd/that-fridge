<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class MemoryService
{
    private const MAX_FACTS = 8;

    private const MAX_FACT_LENGTH = 80;

    public function __construct(protected OpenRouterClient $client) {}

    /**
     * Extract/update the user's remembered facts from one chat exchange. Returns the
     * existing facts unchanged if no key is configured, the call fails, or the model's
     * reply can't be parsed - extraction failure must never wipe out what's already
     * remembered.
     */
    public function extractAndUpdate(array $existingFacts, string $userMessage, string $agentResponse): array
    {
        if (! $this->client->available()) {
            return $existingFacts;
        }

        try {
            $existingJson = json_encode(array_values($existingFacts));

            $prompt = <<<PROMPT
You are maintaining a short memory of durable facts about a home cook, for a kitchen inventory assistant. Facts should be things like dietary restrictions, food preferences, allergies, or habits - not one-off requests or anything about a single item.

Existing remembered facts (JSON array, may be empty):
{$existingJson}

New exchange:
User: "{$userMessage}"
Assistant: "{$agentResponse}"

Return ONLY a JSON array (no prose, no markdown fences) of updated facts: keep existing facts that are still useful, add any new fact clearly stated or strongly implied by the new exchange, and drop nothing unless it's contradicted by the new exchange. If nothing new or noteworthy was said, return the existing list unchanged. Maximum 8 facts, each a short phrase under 10 words.
PROMPT;

            $result = $this->client->complete([
                ['role' => 'user', 'content' => $prompt],
            ], 300);

            if ($result['ok']) {
                $facts = $this->parseJsonArray($result['content']);

                if ($facts !== null) {
                    return $this->applyGuardrails($facts);
                }
            }
        } catch (\Exception $e) {
            Log::error('Memory extraction failed', ['error' => $e->getMessage()]);
        }

        return $existingFacts;
    }

    /**
     * The model is asked for pure JSON but doesn't reliably self-limit (same lesson as
     * compact-mode replies) - it can return duplicates, empty strings, overlong facts, or
     * more than the requested cap. Enforce all of that deterministically.
     */
    private function applyGuardrails(array $facts): array
    {
        $seen = [];
        $clean = [];

        foreach ($facts as $fact) {
            if (! is_string($fact)) {
                continue;
            }

            $fact = trim($fact);
            if ($fact === '') {
                continue;
            }

            if (mb_strlen($fact) > self::MAX_FACT_LENGTH) {
                $fact = rtrim(mb_substr($fact, 0, self::MAX_FACT_LENGTH - 3)).'...';
            }

            $key = mb_strtolower($fact);
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $clean[] = $fact;

            if (count($clean) >= self::MAX_FACTS) {
                break;
            }
        }

        return $clean;
    }

    /**
     * The model is asked for raw JSON but occasionally wraps it in markdown fences anyway;
     * strip those defensively before decoding.
     */
    private function parseJsonArray(?string $content): ?array
    {
        if (! $content) {
            return null;
        }

        $content = trim(preg_replace('/^```(?:json)?|```$/m', '', trim($content)));
        $data = json_decode($content, true);

        return is_array($data) ? array_values($data) : null;
    }
}
