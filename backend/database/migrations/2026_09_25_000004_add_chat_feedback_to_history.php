<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_history', function (Blueprint $table) {
            $table->string('feedback_rating', 8)->nullable();
            $table->string('feedback_reason', 32)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('chat_history', function (Blueprint $table) {
            $table->dropColumn(['feedback_rating', 'feedback_reason']);
        });
    }
};
