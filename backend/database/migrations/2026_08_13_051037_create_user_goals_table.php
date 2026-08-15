<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('user_goals', function (Blueprint $table) {
            $table->id();
            // One goal per user (singleton, same convention as notification_prefs) - firstOrCreate
            // gives every user a reasonable default the first time this is read.
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('metric_type');
            $table->unsignedInteger('target_value');
            $table->string('period')->default('weekly');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_goals');
    }
};
