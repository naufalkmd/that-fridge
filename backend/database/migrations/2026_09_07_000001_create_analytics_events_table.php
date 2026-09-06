<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lightweight first-party event log. Feeds the onboarding funnel (see
 * apps/mobile/PRE_SIGNUP_ONBOARDING.md) and, later, any other product metric worth
 * a query. `user_id` is nullable — pre-sign-in events carry only an `anon_id` that the
 * client keeps across the auth boundary so a funnel can be stitched signup ← anon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('anon_id', 64)->nullable()->index();
            $table->string('name', 80)->index();
            $table->json('props')->nullable();
            $table->string('platform', 16)->nullable();
            $table->string('app_version', 24)->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_events');
    }
};
