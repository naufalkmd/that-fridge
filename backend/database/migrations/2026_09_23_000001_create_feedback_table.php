<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feedback', function (Blueprint $table) {
            $table->id();
            // Nullable + no cascade delete: feedback should survive the account that sent it
            // (an account can be deleted later; the message itself is still worth keeping).
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            // A free-typed contact address, not necessarily the account's own email - the
            // sender may want a reply somewhere else.
            $table->string('email');
            $table->text('message');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback');
    }
};
