<?php

namespace App\Console\Commands;

use App\Models\GeneratedIcon;
use App\Models\SharedIcon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Curate one user-generated icon into the app-wide shared pack. The image file is COPIED to
 * its own path so it stays available if the generator later deletes their icon or account,
 * and no user id is carried over - it becomes a de-identified app asset (see the
 * shared_icons migration and apps/legal/terms §4).
 */
#[Signature('app:promote-icon {id : generated_icons row id} {--label= : short picker label, e.g. "Tomato"}')]
#[Description('Add a generated icon to the shared icon pack shown to all users')]
class PromoteIcon extends Command
{
    public function handle(): int
    {
        $source = GeneratedIcon::find($this->argument('id'));
        if (! $source) {
            $this->error("No generated_icons row with id {$this->argument('id')}.");

            return self::FAILURE;
        }

        if (SharedIcon::where('source_generated_icon_id', $source->id)->exists()) {
            $this->warn('Already in the shared pack.');

            return self::SUCCESS;
        }

        $disk = Storage::disk(config('filesystems.media_disk'));
        if (! $disk->exists($source->image_path)) {
            $this->error("Source image is missing on disk: {$source->image_path}");

            return self::FAILURE;
        }

        $path = 'shared-icons/'.Str::uuid().'.png';
        $disk->put($path, $disk->get($source->image_path));

        $label = $this->option('label') ?: Str::limit(Str::title(trim($source->prompt)), 40, '');

        $icon = SharedIcon::create([
            'label' => $label ?: null,
            'image_path' => $path,
            'image_url' => $disk->url($path),
            'source_generated_icon_id' => $source->id,
        ]);

        $this->info("Promoted generated icon #{$source->id} → shared_icons #{$icon->id}".($label ? " (\"{$label}\")" : ''));

        return self::SUCCESS;
    }
}
