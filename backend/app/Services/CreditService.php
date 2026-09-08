<?php

namespace App\Services;

use App\Exceptions\InsufficientCreditsException;
use App\Models\AiCreditLedger;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The authoritative AI-credit ledger. `users.ai_credits` is the balance every paid AI path
 * checks; this service is the only thing that writes it, always inside a row-locked
 * transaction so two concurrent requests can't overspend. RevenueCat Virtual Currency is
 * mirrored best-effort for display - a mirror failure never blocks the spend.
 */
class CreditService
{
    public function __construct(protected RevenueCatVirtualCurrency $rcCurrency) {}

    public function balance(User $user): int
    {
        return (int) $user->ai_credits;
    }

    /**
     * Debit the user for an AI action. Throws InsufficientCreditsException (renders 402) when
     * they can't afford it - the caller must spend BEFORE doing the paid work.
     */
    public function spend(User $user, int $amount, string $reason): void
    {
        if ($amount <= 0) {
            return;
        }

        DB::transaction(function () use ($user, $amount, $reason) {
            $fresh = User::whereKey($user->id)->lockForUpdate()->first();
            $balance = (int) $fresh->ai_credits;

            if ($balance < $amount) {
                throw new InsufficientCreditsException($balance, $amount, $reason);
            }

            $after = $balance - $amount;
            $fresh->forceFill(['ai_credits' => $after])->save();
            $user->ai_credits = $after;

            AiCreditLedger::create([
                'user_id' => $user->id,
                'delta' => -$amount,
                'balance_after' => $after,
                'reason' => $reason,
            ]);
        });

        $this->rcCurrency->adjust($user, -$amount);
    }

    /**
     * Spend what you can, up to $amount, without ever failing - for the after-the-fact chat
     * tool surcharge, where the user already got their answer. Returns the amount actually
     * charged.
     */
    public function spendUpTo(User $user, int $amount, string $reason): int
    {
        $charged = 0;

        DB::transaction(function () use ($user, $amount, $reason, &$charged) {
            $fresh = User::whereKey($user->id)->lockForUpdate()->first();
            $balance = (int) $fresh->ai_credits;
            $charged = max(0, min($amount, $balance));
            if ($charged === 0) {
                return;
            }

            $after = $balance - $charged;
            $fresh->forceFill(['ai_credits' => $after])->save();
            $user->ai_credits = $after;

            AiCreditLedger::create([
                'user_id' => $user->id,
                'delta' => -$charged,
                'balance_after' => $after,
                'reason' => $reason,
            ]);
        });

        if ($charged > 0) {
            $this->rcCurrency->adjust($user, -$charged);
        }

        return $charged;
    }

    /**
     * Credit the user. `$ref` (a RevenueCat event id for purchases / renewals) makes it
     * idempotent - a re-delivered webhook is a no-op. `$capAt` clamps the resulting balance
     * so a grant can't stockpile (monthly free / Pro rollover ceilings).
     */
    public function grant(User $user, int $amount, string $reason, ?string $ref = null, ?int $capAt = null): bool
    {
        if ($amount <= 0) {
            return false;
        }

        $granted = false;

        DB::transaction(function () use ($user, $amount, $reason, $ref, $capAt, &$granted) {
            if ($ref !== null && AiCreditLedger::where('reason', $reason)->where('ref', $ref)->exists()) {
                return; // already applied this exact grant
            }

            $fresh = User::whereKey($user->id)->lockForUpdate()->first();
            $balance = (int) $fresh->ai_credits;
            $target = $capAt !== null ? min($balance + $amount, max($balance, $capAt)) : $balance + $amount;
            $delta = $target - $balance;
            if ($delta <= 0) {
                return;
            }

            $fresh->forceFill(['ai_credits' => $target])->save();
            $user->ai_credits = $target;

            AiCreditLedger::create([
                'user_id' => $user->id,
                'delta' => $delta,
                'balance_after' => $target,
                'reason' => $reason,
                'ref' => $ref,
            ]);
            $granted = true;
        });

        if ($granted) {
            $this->rcCurrency->adjust($user, $amount);
        }

        return $granted;
    }

    /** @return array<int, array{delta:int, balance_after:int, reason:string, at:string}> */
    public function recentLedger(User $user, int $limit = 25): array
    {
        return $user->aiCreditLedger()
            ->latest('id')
            ->limit($limit)
            ->get(['delta', 'balance_after', 'reason', 'created_at'])
            ->map(fn ($row) => [
                'delta' => $row->delta,
                'balance_after' => $row->balance_after,
                'reason' => $row->reason,
                'at' => $row->created_at?->toIso8601String(),
            ])
            ->all();
    }
}
