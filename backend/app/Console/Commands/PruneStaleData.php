<?php

namespace App\Console\Commands;

use App\Models\AnalyticsEvent;
use App\Models\FridgeJoinRequest;
use App\Models\GeneratedIcon;
use App\Models\NotificationEvent;
use App\Models\Recipe;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Keeps the few unbounded tables + orphaned upload files from growing forever on the VPS.
 * Runs daily (routes/console.php). Everything here is either terminal-state rows nothing
 * queries any more, or scan images that are read once during the review sheet and then
 * never referenced again (photo_scans / receipts rows are never even written - the vision
 * services just store the file and return it inline).
 *
 * Deliberately NOT pruned: chat_history (user-visible, needs a UI "kept 12 months" message
 * first), items / recipes / usage_history / user_memories (user's real data).
 */
#[Signature('app:prune-stale-data {--dry-run : Report what would be deleted without deleting}')]
#[Description('Delete stale analytics/notification rows, terminal join requests, and orphaned scan/icon files')]
class PruneStaleData extends Command
{
    private const ANALYTICS_RETENTION_DAYS = 180;

    private const NOTIFICATION_DONE_RETENTION_DAYS = 60;

    private const NOTIFICATION_HARD_RETENTION_DAYS = 180;

    private const JOIN_REQUEST_RETENTION_DAYS = 90;

    /** Fridge-photo / receipt scan images: read once in the review sheet, never persisted. */
    private const SCAN_FILE_RETENTION_DAYS = 7;

    /** Generated-icon files with no owning row (a generation that failed mid-write). */
    private const ORPHAN_ICON_RETENTION_DAYS = 7;

    /** Recipe-attachment uploads never attached to a saved recipe (abandoned drafts). */
    private const ORPHAN_ATTACHMENT_RETENTION_DAYS = 7;

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $now = Carbon::now();

        $this->pruneRows(
            'analytics_events',
            AnalyticsEvent::where('created_at', '<', $now->copy()->subDays(self::ANALYTICS_RETENTION_DAYS)),
            $dry,
        );

        $this->pruneRows(
            'notification_events (done)',
            NotificationEvent::where('done', true)
                ->where('updated_at', '<', $now->copy()->subDays(self::NOTIFICATION_DONE_RETENTION_DAYS)),
            $dry,
        );

        $this->pruneRows(
            'notification_events (aged out)',
            NotificationEvent::where('created_at', '<', $now->copy()->subDays(self::NOTIFICATION_HARD_RETENTION_DAYS)),
            $dry,
        );

        $this->pruneRows(
            'fridge_join_requests (terminal)',
            FridgeJoinRequest::whereIn('status', ['accepted', 'declined'])
                ->where('updated_at', '<', $now->copy()->subDays(self::JOIN_REQUEST_RETENTION_DAYS)),
            $dry,
        );

        $this->pruneScanFiles('photos', $dry);
        $this->pruneScanFiles('receipts', $dry);
        $this->pruneOrphanIconFiles($dry);
        $this->pruneOrphanRecipeAttachments($dry);

        return self::SUCCESS;
    }

    /**
     * @param  \Illuminate\Database\Eloquent\Builder<*>  $query
     */
    private function pruneRows(string $label, $query, bool $dry): void
    {
        $count = (clone $query)->count();
        if ($count === 0) {
            $this->line("  {$label}: nothing to prune");

            return;
        }

        if ($dry) {
            $this->warn("  {$label}: would delete {$count} row(s)");

            return;
        }

        $deleted = $query->delete();
        $this->info("  {$label}: deleted {$deleted} row(s)");
    }

    private function pruneScanFiles(string $dir, bool $dry): void
    {
        $disk = Storage::disk(config('filesystems.media_disk'));
        $cutoff = Carbon::now()->subDays(self::SCAN_FILE_RETENTION_DAYS)->getTimestamp();
        $deleted = 0;

        foreach ($disk->files($dir) as $path) {
            if ($disk->lastModified($path) >= $cutoff) {
                continue;
            }
            if ($dry) {
                $deleted++;

                continue;
            }
            $disk->delete($path);
            $deleted++;
        }

        $verb = $dry ? 'would delete' : 'deleted';
        $this->{$dry ? 'warn' : 'info'}("  {$dir}/ scan files: {$verb} {$deleted} file(s)");
    }

    private function pruneOrphanIconFiles(bool $dry): void
    {
        $disk = Storage::disk(config('filesystems.media_disk'));
        $known = GeneratedIcon::pluck('image_path')->flip();
        $cutoff = Carbon::now()->subDays(self::ORPHAN_ICON_RETENTION_DAYS)->getTimestamp();
        $deleted = 0;

        foreach ($disk->files('icons') as $path) {
            if ($known->has($path) || $disk->lastModified($path) >= $cutoff) {
                continue;
            }
            if (! $dry) {
                $disk->delete($path);
            }
            $deleted++;
        }

        $verb = $dry ? 'would delete' : 'deleted';
        $this->{$dry ? 'warn' : 'info'}("  icons/ orphan files: {$verb} {$deleted} file(s)");
    }

    private function pruneOrphanRecipeAttachments(bool $dry): void
    {
        $disk = Storage::disk(config('filesystems.media_disk'));

        // Every referenced attachment, matched on basename so it works whether the stored url
        // is a local "/storage/..." path or an absolute R2 url.
        $referenced = Recipe::whereNotNull('attachments')
            ->pluck('attachments')
            ->flatMap(fn ($a) => collect($a)->pluck('url'))
            ->filter()
            ->map(fn ($u) => basename(parse_url((string) $u, PHP_URL_PATH) ?: (string) $u))
            ->flip();

        $cutoff = Carbon::now()->subDays(self::ORPHAN_ATTACHMENT_RETENTION_DAYS)->getTimestamp();
        $deleted = 0;

        foreach ($disk->files('recipe-attachments') as $path) {
            if ($referenced->has(basename($path)) || $disk->lastModified($path) >= $cutoff) {
                continue;
            }
            if (! $dry) {
                $disk->delete($path);
            }
            $deleted++;
        }

        $verb = $dry ? 'would delete' : 'deleted';
        $this->{$dry ? 'warn' : 'info'}("  recipe-attachments/ orphan files: {$verb} {$deleted} file(s)");
    }
}
