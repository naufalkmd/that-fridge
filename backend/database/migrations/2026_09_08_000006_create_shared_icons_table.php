<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Icons hand-picked from users' AI generations (app:promote-icon) and offered to everyone
     * in the icon picker, alongside the bundled pixel-art pack. The image is COPIED to its own
     * stable path on promotion and stored here with no user_id, so it's a de-identified app
     * asset that survives the original generator deleting their icon or their account. The
     * Terms grant the licence for this (see apps/legal/terms §4).
     */
    public function up(): void
    {
        Schema::create('shared_icons', function (Blueprint $table) {
            $table->id();
            $table->string('label')->nullable();       // short human label shown in the picker
            $table->string('image_path');
            $table->string('image_url');
            // Kept only for provenance / de-dup; nulled if the source row is later removed.
            $table->foreignId('source_generated_icon_id')->nullable()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shared_icons');
    }
};
