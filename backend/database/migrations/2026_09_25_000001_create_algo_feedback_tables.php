<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('algo_feedback_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('algo', 40);
            $table->string('kind', 40);
            $table->unsignedSmallInteger('rules_v');
            $table->string('name_key', 60)->nullable();
            $table->string('class', 80)->nullable();
            $table->string('guess', 120)->nullable();
            $table->string('final', 120)->nullable();
            $table->decimal('guess_number', 12, 3)->nullable();
            $table->decimal('final_number', 12, 3)->nullable();
            $table->string('source', 40)->nullable();
            $table->decimal('confidence', 4, 3)->nullable();
            $table->string('outcome', 40)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['occurred_at', 'algo', 'rules_v']);
            $table->index(['algo', 'kind', 'class']);
            $table->index(['name_key', 'occurred_at']);
            $table->index(['user_id', 'occurred_at']);
        });

        Schema::create('algo_stats_daily', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->string('algo', 40);
            $table->string('kind', 40);
            $table->string('class', 80)->nullable();
            $table->string('name_key', 60)->nullable();
            $table->string('source', 40)->nullable();
            $table->unsignedSmallInteger('rules_v');
            $table->unsignedInteger('events');
            $table->unsignedInteger('users');
            $table->unsignedInteger('corrections');
            $table->decimal('sum_guess', 16, 3)->nullable();
            $table->decimal('sum_final', 16, 3)->nullable();
            $table->timestamps();
            $table->index(['day', 'algo', 'rules_v']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('algo_stats_daily');
        Schema::dropIfExists('algo_feedback_events');
    }
};
