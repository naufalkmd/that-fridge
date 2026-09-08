<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\CreditService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * The monthly AI-credit top-up. Free users are brought UP to credits.free_monthly (purchased
 * credits on top are kept, and it grants nothing if they're already above it). Pro users get
 * their credits.pro_monthly grant here too as a safety net in case a renewal webhook was
 * missed - both keyed on the calendar month so a re-run is a no-op.
 */
#[Signature('app:grant-monthly-credits {--month= : YYYY-MM, defaults to now}')]
#[Description('Top up every user\'s monthly AI credit allowance')]
class GrantMonthlyCredits extends Command
{
    public function handle(CreditService $credits): int
    {
        $month = $this->option('month') ?: now()->format('Y-m');
        $free = (int) config('credits.free_monthly');
        $pro = (int) config('credits.pro_monthly');
        $cap = (int) config('credits.pro_rollover_cap');

        $freeCount = 0;
        $proCount = 0;

        User::query()->where('is_demo', false)->chunkById(200, function ($users) use ($credits, $month, $free, $pro, $cap, &$freeCount, &$proCount) {
            foreach ($users as $user) {
                if ($user->isPro()) {
                    if ($credits->grant($user, $pro, 'pro_grant', "monthly:{$month}", $cap)) {
                        $proCount++;
                    }
                } else {
                    $deficit = max(0, $free - $credits->balance($user));
                    if ($deficit > 0 && $credits->grant($user, $deficit, 'monthly_free', "monthly:{$month}")) {
                        $freeCount++;
                    }
                }
            }
        });

        $this->info("Topped up {$freeCount} free user(s) and {$proCount} Pro user(s) for {$month}.");

        return self::SUCCESS;
    }
}
