<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per call to a paid AI provider (OpenRouter, fal.ai): what it was for, how big, what it cost and whether it worked.
     * It feeds the admin dashboard's AI spend charts. The provider's own dashboard stays the source of truth for billing; these are
     * our own numbers, so they can be broken down by feature and per day. No prompts or responses are stored.
     */
    public function up(): void
    {
        Schema::create('api_usage_logs', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 16);              // openrouter | fal
            $table->string('feature', 60);               // what it was for, e.g. "Quick Chat"
            $table->string('model', 80)->nullable();
            $table->unsignedBigInteger('user_id')->nullable(); // who triggered it (null for jobs and commands)
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->decimal('cost_usd', 10, 6)->nullable(); // the provider's reported cost, or our estimate for fal
            $table->boolean('cost_estimated')->default(false);
            $table->boolean('ok')->default(true);
            $table->string('reason', 24)->nullable();    // why it failed
            $table->unsignedInteger('latency_ms')->default(0);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['provider', 'created_at']);
            $table->index(['feature', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('api_usage_logs');
    }
};
