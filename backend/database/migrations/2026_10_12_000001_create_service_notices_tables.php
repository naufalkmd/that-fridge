<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // An email the operator writes in Admin → Service notices and sends to users.
        Schema::create('service_notices', function (Blueprint $table) {
            $table->id();
            $table->string('subject', 150);
            $table->text('body');
            $table->string('audience', 16)->default('all');   // all | ai_failed
            $table->timestamp('audience_from')->nullable();   // ai_failed: failed calls in this window
            $table->timestamp('audience_until')->nullable();
            $table->string('status', 12)->default('draft');   // draft | sending | sent
            $table->unsignedInteger('recipient_count')->nullable(); // fixed at send time
            $table->string('sent_by_email')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });

        // One row per recipient. The unique key is what stops anyone being emailed a notice twice.
        Schema::create('service_notice_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_notice_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email');
            $table->string('status', 8)->default('queued');   // queued | sent | failed
            $table->string('error')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();

            $table->unique(['service_notice_id', 'email']);
            $table->index(['service_notice_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_notice_deliveries');
        Schema::dropIfExists('service_notices');
    }
};
