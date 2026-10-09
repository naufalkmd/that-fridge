<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Frontend runs on a different origin/port (Next.js, typically
    | localhost:3000) than this API. Auth is Bearer-token based, not
    | cookie-based, so `supports_credentials` stays false — the browser
    | only needs these headers to allow the cross-origin fetch/XHR itself.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    // thatfridge.com's static site posts its Android waitlist form here (/api/waitlist).
    'allowed_origins' => ['https://thatfridge.com', 'https://www.thatfridge.com'],

    // Matches any localhost/127.0.0.1 origin regardless of port, so this
    // keeps working whichever port `npm run dev` happens to pick.
    'allowed_origins_patterns' => ['#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#'],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
