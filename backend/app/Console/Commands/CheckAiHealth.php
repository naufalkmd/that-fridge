<?php

namespace App\Console\Commands;

use App\Mail\AiHealthAlertMail;
use App\Models\ApiUsageLog;
use App\Services\AiProviderBalance;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Warns the operator by email before users find out the hard way. Three separate warnings:
 * AI calls are failing, the prepaid OpenRouter balance is nearly gone, and the key's own
 * spending limit is nearly reached. Each is sent at most once a day while it lasts, and is
 * re-armed as soon as the problem clears.
 *
 * Written after October 2026, when the key hit its limit and every AI call failed for two
 * days before anyone noticed.
 */
#[Signature('app:check-ai-health')]
#[Description('Email the operator when AI calls keep failing or the OpenRouter balance is nearly gone')]
class CheckAiHealth extends Command
{
    /** A failure that repeats on every call until someone acts, so one is enough to warn. */
    private const BLOCKING = [
        'unauthorized' => 'OpenRouter rejected the API key (HTTP 401).',
        'out_of_credits' => 'The OpenRouter account balance is empty (HTTP 402).',
        'forbidden' => 'OpenRouter refused the key (HTTP 403). This usually means the key has reached its spending limit.',
    ];

    /** Any other failure (a timeout, a provider error) warns once this many calls in a row have failed. */
    private const STREAK = 3;

    /** Share of the key's spending limit left at which to warn. */
    private const KEY_LIMIT_WARN_AT = 0.2;

    public function handle(AiProviderBalance $balance): int
    {
        $this->checkFailures();
        $this->checkHeadroom($balance->openRouterHeadroom());

        return self::SUCCESS;
    }

    private function checkFailures(): void
    {
        // Only the last day counts: after a fix with no traffic since, old failures must not keep warning.
        $recent = ApiUsageLog::where('provider', 'openrouter')->where('created_at', '>=', now()->subDay())
            ->orderByDesc('id')->limit(self::STREAK)->get();
        $latest = $recent->first();

        $blocked = $latest && ! $latest->ok && isset(self::BLOCKING[$latest->reason]);
        $streak = $recent->count() === self::STREAK && $recent->every(fn (ApiUsageLog $call) => ! $call->ok);

        if (! $blocked && ! $streak) {
            $this->clear('failing');
            $this->line('AI calls: OK.');

            return;
        }

        $failedToday = ApiUsageLog::where('provider', 'openrouter')->where('created_at', '>=', now()->subDay())->where('ok', false)->count();

        $this->warnOperator('failing', 'AI calls are failing', [
            self::BLOCKING[$latest->reason] ?? 'The last '.self::STREAK." AI calls all failed. Reason recorded for the latest one: {$latest->reason}.",
            "{$failedToday} AI call(s) failed in the last 24 hours. Until this is fixed, Quick Chat, photo and receipt scans and the other AI features do not work for users.",
            'Check the key and the balance at https://openrouter.ai/settings/keys and https://openrouter.ai/settings/credits. Admin → AI calls shows each failed call.',
        ]);
    }

    /** @param  array{balance: ?float, key_limit: ?float, key_remaining: ?float}|null  $headroom */
    private function checkHeadroom(?array $headroom): void
    {
        if ($headroom === null) {
            return; // no API key configured
        }

        $threshold = (float) config('services.ai_alerts.low_balance_usd');
        $balance = $headroom['balance'];

        if ($balance !== null && $balance < $threshold) {
            $this->warnOperator('low-balance', 'OpenRouter balance is low ('.self::usd($balance).' left)', [
                'The prepaid OpenRouter balance is down to '.self::usd($balance).', below the '.self::usd($threshold).' warning level.',
                'When it reaches zero every AI call fails: Quick Chat, photo and receipt scans and the other AI features stop working for users.',
                'Add credit at https://openrouter.ai/settings/credits. Turning on auto top-up there prevents this.',
            ]);
        } elseif ($balance !== null) {
            $this->clear('low-balance');
            $this->line('OpenRouter balance: '.self::usd($balance).'.');
        }

        $limit = $headroom['key_limit'];
        $remaining = $headroom['key_remaining'];

        if ($limit !== null && $remaining !== null && $remaining <= $limit * self::KEY_LIMIT_WARN_AT) {
            $this->warnOperator('key-limit', 'OpenRouter key limit is nearly reached ('.self::usd($remaining).' of '.self::usd($limit).' left)', [
                'The API key has '.self::usd($remaining).' left of its '.self::usd($limit).' spending limit.',
                'When the limit is reached every AI call fails, even with credit in the account. This is what caused the October 2026 outage.',
                'Raise or remove the limit at https://openrouter.ai/settings/keys.',
            ]);
        } else {
            $this->clear('key-limit');
        }
    }

    /** @param  list<string>  $lines */
    private function warnOperator(string $kind, string $heading, array $lines): void
    {
        $this->warn($heading);

        $to = config('services.ai_alerts.to');
        // add() is false while an earlier warning of this kind is still within its day.
        if (! $to || ! Cache::add(self::key($kind), true, now()->addDay())) {
            return;
        }

        try {
            Mail::to($to)->send(new AiHealthAlertMail($heading, $lines));
            $this->line("Warning emailed to {$to}.");
        } catch (\Throwable $e) {
            Cache::forget(self::key($kind)); // try again on the next run
            Log::error('Could not send the AI health alert', ['kind' => $kind, 'error' => $e->getMessage()]);
        }
    }

    private function clear(string $kind): void
    {
        Cache::forget(self::key($kind));
    }

    private static function key(string $kind): string
    {
        return "ai-health:alerted:{$kind}";
    }

    private static function usd(float $amount): string
    {
        return '$'.number_format($amount, 2);
    }
}
