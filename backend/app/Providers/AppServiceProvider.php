<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Signup: a per-minute anti-hammering floor plus a per-day-per-IP cap. Each new
        // account carries a free AI-credit allowance, so a single IP minting dozens a day is
        // almost always credit farming, not a household - and no real household needs it.
        RateLimiter::for('register', fn (Request $request) => [
            Limit::perMinute(6)->by($request->ip()),
            Limit::perDay(20)->by($request->ip()),
        ]);
    }
}
