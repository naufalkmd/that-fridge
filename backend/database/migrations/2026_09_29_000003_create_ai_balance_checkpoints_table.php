<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * fal.ai has no balance API for a normal key, so the operator reads the balance off fal.ai/dashboard and tells us. We keep
     * every reading; the dashboard shows the latest one minus the estimated spend logged since it. Seeded with the balance
     * reported when this shipped.
     */
    public function up(): void
    {
        Schema::create('ai_balance_checkpoints', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 16);
            $table->decimal('balance_usd', 10, 2);
            $table->timestamp('recorded_at');

            $table->index(['provider', 'recorded_at']);
        });

        DB::table('ai_balance_checkpoints')->insert(['provider' => 'fal', 'balance_usd' => 11.46, 'recorded_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_balance_checkpoints');
    }
};
