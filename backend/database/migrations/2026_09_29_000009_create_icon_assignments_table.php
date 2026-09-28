<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An admin's icon for a food name the pack doesn't match (Icon Studio → Suggested by users →
 * Pick icon): a pack key, or a shared icon's image. New items, scans and barcode products with
 * that name get it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('icon_assignments', function (Blueprint $table) {
            $table->id();
            $table->string('name_key', 120)->unique(); // AlgoFeedback::nameKey of the food name
            $table->string('icon', 80)->nullable();
            $table->string('icon_url', 2048)->nullable();
            $table->foreignId('shared_icon_id')->nullable()->constrained('shared_icons')->nullOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('icon_assignments');
    }
};
