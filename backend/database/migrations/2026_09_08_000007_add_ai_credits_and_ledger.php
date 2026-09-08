<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every AI action (chat, icon generation, expiry / receipt / photo scan, auto-fill) is
     * metered in credits. `users.ai_credits` is the authoritative balance the backend checks
     * before doing any paid work; `ai_credit_ledger` is the append-only audit trail (grants
     * from the monthly free allowance / a Pro renewal / a consumable pack purchase; spends
     * per action). RevenueCat's Virtual Currency is the displayed balance and where purchases
     * land - the backend mirrors into it best-effort, but this column wins for spend gating.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->integer('ai_credits')->default(50)->after('pro_expires_at');
        });

        Schema::create('ai_credit_ledger', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->integer('delta'); // + grant, - spend
            $table->integer('balance_after');
            $table->string('reason'); // 'monthly_free' | 'pro_grant' | 'pack_purchase' | 'chat' | 'icon' | 'expiry_scan' | ...
            // External id for idempotency - a RevenueCat event id on grants, null on spends.
            $table->string('ref')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->unique(['reason', 'ref']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_credit_ledger');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('ai_credits');
        });
    }
};
