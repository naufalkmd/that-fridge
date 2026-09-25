<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->unsignedSmallInteger('opened_shelf_life_days')->nullable()->after('opened_at');
            $table->string('opened_shelf_life_source', 16)->nullable()->after('opened_shelf_life_days');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['opened_shelf_life_days', 'opened_shelf_life_source']);
        });
    }
};
