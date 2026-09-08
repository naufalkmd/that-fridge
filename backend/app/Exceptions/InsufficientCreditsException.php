<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;

/**
 * Thrown by CreditService::spend when the user can't afford an AI action. Rendered as a 402
 * carrying the shortfall so the client can show a "top up" prompt.
 */
class InsufficientCreditsException extends \RuntimeException
{
    public function __construct(
        public readonly int $balance,
        public readonly int $needed,
        public readonly string $action,
    ) {
        parent::__construct("Not enough AI credits for {$action}: have {$balance}, need {$needed}.");
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => "You're out of AI credits. Top up to keep using {$this->action}.",
            'error' => 'insufficient_credits',
            'balance' => $this->balance,
            'needed' => $this->needed,
        ], 402);
    }
}
