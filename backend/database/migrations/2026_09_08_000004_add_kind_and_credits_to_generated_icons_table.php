<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * All AI image generation (item icons, recipe icons) now draws on one shared weekly free
     * budget instead of a per-feature count. `kind` says what was generated; `credits` is what
     * that generation cost against the budget (stored per-row so re-pricing a kind later
     * doesn't retroactively change old rows). The free-tier check becomes
     * SUM(credits) since the week start <= 5 (see IconController). Existing rows are all
     * item icons that cost 1 - the column defaults cover them.
     */
    public function up(): void
    {
        Schema::table('generated_icons', function (Blueprint $table) {
            $table->string('kind')->default('icon')->after('user_id');
            $table->unsignedTinyInteger('credits')->default(1)->after('kind');
        });
    }

    public function down(): void
    {
        Schema::table('generated_icons', function (Blueprint $table) {
            $table->dropColumn(['kind', 'credits']);
        });
    }
};
