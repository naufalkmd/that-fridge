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

        return '$'.number_format($amount, $amount < 1 ? 3 : 2);
    }
}
