<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_history', function (Blueprint $table) {
            $table->json('recipe_suggestion')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('chat_history', function (Blueprint $table) {
            $table->dropColumn('recipe_suggestion');
        });
    }
};
