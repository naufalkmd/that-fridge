<?php

return [
    /*
     * The monthly free allowance, topped up by app:grant-monthly-credits. A free user's
     * balance is brought UP to this (purchased credits on top are kept); it never grants
     * more than needed to reach it, so credits can't be hoarded by not using the app.
     */
    'free_monthly' => (int) env('CREDITS_FREE_MONTHLY', 50),

    /*
     * Granted each month an active Pro subscription renews (and on first purchase). Rolls
     * over up to `pro_rollover_cap`.
     */
    'pro_monthly' => (int) env('CREDITS_PRO_MONTHLY', 400),
    'pro_rollover_cap' => (int) env('CREDITS_PRO_ROLLOVER_CAP', 800),

    /*
     * Consumable store product id => credits granted on purchase. Keep in sync with the
     * products created in the RevenueCat dashboard.
     */
    'packs' => [
        'credits_100' => 100,
        'credits_500' => 500,
        'credits_1500' => 1500,
    ],

    /*
     * The subscription store product ids that trigger the Pro monthly grant.
     */
    'pro_products' => ['thatfridge_pro_monthly', 'thatfridge_pro_yearly'],
];
