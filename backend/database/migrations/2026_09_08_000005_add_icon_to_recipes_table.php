<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A recipe's own thumbnail, independent of its ingredients. `icon` is a curated pixel-pack
     * key; `icon_url` is a generated (fal.ai) image. Both null = fall back to the first
     * ingredient's icon on the client, which is how every existing recipe already renders.
     */
    public function up(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->string('icon')->nullable()->after('category');
            $table->string('icon_url')->nullable()->after('icon');
        });
    }

    public function down(): void
    {
        Schema::table('recipes', function (Blueprint $table) {
            $table->dropColumn(['icon', 'icon_url']);
        });
    }
};
