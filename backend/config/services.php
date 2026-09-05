<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'openrouter' => [
        'key' => env('OPENROUTER_API_KEY'),
    ],

    'fal' => [
        'key' => env('FAL_KEY'),
    ],

    // Sign in with Apple / Google. `client_ids` are the audiences an identity token is
    // allowed to carry — comma-separated in env. Apple: the iOS bundle id (native flow) and
    // any Services ID (web). Google: the iOS OAuth client id and the Web OAuth client id.
    'apple' => [
        'client_ids' => array_filter(explode(',', (string) env('APPLE_CLIENT_IDS', 'test.thatfridge.app'))),
    ],

    'google' => [
        'client_ids' => array_filter(explode(',', (string) env('GOOGLE_CLIENT_IDS', ''))),
    ],

    'revenuecat' => [
        // Whatever value you set as the "Authorization header" for this webhook in the
        // RevenueCat dashboard (Project Settings → Integrations → Webhooks) - compared
        // constant-time against the incoming Authorization header. Not a HMAC signing secret;
        // that's a separate (and plan-gated) verification method RevenueCat also offers.
        'webhook_secret' => env('REVENUECAT_WEBHOOK_SECRET'),
    ],

];
