<?php

namespace App\Support;

use App\Models\AlgoFeedbackEvent;
use App\Models\User;
use Illuminate\Support\Str;

/** Records only structured, first-party correction signals from authenticated actions. */
final class AlgoFeedback
{
    public const RULES_VERSION = 1;

    /**
     * @param  array{kind: string, name?: ?string, class?: ?string, guess?: ?string, final?: ?string, guess_number?: ?float, final_number?: ?float, source?: ?string, confidence?: ?float, outcome?: ?string}  $signal
     */
    public static function record(User $user, string $algo, array $signal): ?AlgoFeedbackEvent
    {
        if (! config('app.algo_feedback_enabled') || ($user->preferences['help_improve'] ?? true) === false) {
            return null;
        }

        // A matched rule already has a useful, non-personal class. Retain names only for
        // gaps where the rule could not classify the item. Never store email-like input.
        $nameKey = empty($signal['class']) ? self::nameKey($signal['name'] ?? null) : null;

        return AlgoFeedbackEvent::create([
            'user_id' => $user->id,
            'algo' => $algo,
            'kind' => $signal['kind'],
            'rules_v' => self::RULES_VERSION,
            'name_key' => $nameKey,
            'class' => $signal['class'] ?? null,
            'guess' => $signal['guess'] ?? null,
            'final' => $signal['final'] ?? null,
            'guess_number' => $signal['guess_number'] ?? null,
            'final_number' => $signal['final_number'] ?? null,
            'source' => $signal['source'] ?? null,
            'confidence' => $signal['confidence'] ?? null,
            'outcome' => $signal['outcome'] ?? null,
            'occurred_at' => now(),
        ]);
    }

    public static function nameKey(?string $name): ?string
    {
        if ($name === null || str_contains($name, '@')) {
            return null;
        }

        $value = preg_replace('/\p{N}+/u', '', Str::lower(trim($name)));
        $value = preg_replace('/[^\p{L}\s\-]/u', ' ', $value ?? '');
        $value = preg_replace('/\s+/u', ' ', trim($value ?? ''));

        return $value === '' ? null : Str::limit($value, 60, '');
    }
}
