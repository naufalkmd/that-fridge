<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The personal-goal feature was removed for v1 (its screen, then its API); nothing reads or
 * writes this table any more. `down()` restores the same shape, empty.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('user_goals');
    }

    public function down(): void
    {
        Schema::create('user_goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('metric_type');
            $table->unsignedInteger('target_value');
            $table->string('period')->default('weekly');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }
};
