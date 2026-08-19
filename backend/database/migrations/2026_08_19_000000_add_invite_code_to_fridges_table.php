<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('fridges', function (Blueprint $table) {
            $table->string('invite_code')->nullable()->unique()->after('style');
        });

        // Backfill: every existing fridge needs a code too, not just ones created after this
        // migration - otherwise pre-existing fridges could never be shared until someone
        // happened to trigger a regenerate.
        DB::table('fridges')->whereNull('invite_code')->select('id')->orderBy('id')->each(function ($fridge) {
            DB::table('fridges')->where('id', $fridge->id)->update(['invite_code' => $this->generateUniqueCode()]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('fridges', function (Blueprint $table) {
            $table->dropColumn('invite_code');
        });
    }

    private function generateUniqueCode(): string
    {
        do {
            $code = Str::upper(Str::random(8));
        } while (DB::table('fridges')->where('invite_code', $code)->exists());

        return $code;
    }
};
