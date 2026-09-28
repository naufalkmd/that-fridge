<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a curated recipe came from, for automatic imports into Explore: a stable id at the source
 * (so a recipe is never imported twice), the page to credit and link, the site's name and the
 * cook's name when the source gives one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->string('external_id', 80)->nullable()->unique()->after('user_id');
            $table->string('source_url', 500)->nullable()->after('external_id');
            $table->string('source_name', 120)->nullable()->after('source_url');
            $table->string('author', 120)->nullable()->after('source_name');
        });
    }

    public function down(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->dropUnique(['external_id']);
            $table->dropColumn(['external_id', 'source_url', 'source_name', 'author']);
        });
    }
};
