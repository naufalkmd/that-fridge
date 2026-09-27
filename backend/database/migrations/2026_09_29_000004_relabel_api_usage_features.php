<?php

use App\Support\ApiUsageFeature;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The four scan services were logged under their class names ("PhotoService") because their
 * method names never matched ApiUsageFeature's labels. Rename those rows so the cost dashboard
 * counts them under the feature.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (ApiUsageFeature::LEGACY as $class => $label) {
            DB::table('api_usage_logs')->where('feature', $class)->update(['feature' => $label]);
            DB::table('api_usage_logs')->where('feature', "Admin studio: {$class}")->update(['feature' => "Admin studio: {$label}"]);
        }
    }

    public function down(): void
    {
        // Nothing to undo: the old labels were a bug.
    }
};
