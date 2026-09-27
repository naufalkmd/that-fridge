<?php

namespace App\Support;

/** How the admin dashboard writes small dollar amounts: cents for real money, more digits below a dollar so $0.004 does not read as $0.00. */
final class Money
{
    public static function usd(float $amount): string
    {
        if ($amount <= 0) {
            return '$0';
        }

        // A single AI call is often a fraction of a cent; four digits keeps $0.0003 from reading as $0.000.
        return '$'.number_format($amount, $amount < 0.01 ? 4 : ($amount < 1 ? 3 : 2));
    }

    /** A profit or loss: "+$0.021" / "-$0.004". */
    public static function signed(float $amount): string
    {
        if (round($amount, 4) == 0) {
            return '$0';
        }

        return ($amount > 0 ? '+' : '-').self::usd(abs($amount));
    }
}
