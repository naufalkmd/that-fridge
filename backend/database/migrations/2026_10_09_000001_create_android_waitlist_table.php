<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Emails from thatfridge.com's "Tell me when Android is out" form. Stores no IP: country comes
 * from Cloudflare's CF-IPCountry header, so we know where to launch first without keeping where
 * anyone is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('android_waitlist', function (Blueprint $table) {
            $table->id();
            $table->string('email', 254)->unique(); // lowercased before insert
            $table->char('country', 2)->nullable();
            $table->string('source', 40)->nullable();
            $table->timestamp('consented_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('android_waitlist');
    }
};
