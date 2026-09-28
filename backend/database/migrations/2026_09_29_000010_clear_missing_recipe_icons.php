<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Recipe icons drawn by the queue worker before 2026-09-28 were recorded even when the file
 * couldn't be saved (the worker can't write into icons/), so they point at files that don't
 * exist. Clear those links (the recipe falls back to its pack icon) and drop their Generated
 * icons rows. Only links on our own disk are checked; anything else is left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        $disk = Storage::disk(config('filesystems.media_disk'));
        $prefix = rtrim($disk->url(''), '/').'/';

        DB::table('recipes')->whereNotNull('icon_url')->orderBy('id')->each(function ($r) use ($disk, $prefix) {
            if (! str_starts_with($r->icon_url, $prefix)) {
                return;
            }
            $path = substr($r->icon_url, strlen($prefix));
            if (! $disk->exists($path)) {
                DB::table('recipes')->where('id', $r->id)->update(['icon_url' => null]);
                DB::table('generated_icons')->where('image_path', $path)->delete();
            }
        });
    }

    public function down(): void {}
};
