<?php

namespace App\Services;

use App\Models\GeneratedIcon;
use App\Models\SharedIcon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Curates user-generated icons into the app-wide shared pack. Used by app:promote-icon /
 * app:demote-icon and the admin panel's icon pages.
 */
class IconCurator
{
    /**
     * The image file is COPIED to its own path so it stays available if the generator later
     * deletes their icon or account, and no user id is carried over - it becomes a
     * de-identified app asset (see the shared_icons migration and apps/legal/terms §4).
     *
     * Returns the existing row when the icon is already in the pack.
     *
     * @throws RuntimeException when the source image is missing on disk
     */
    public function promote(GeneratedIcon $source, ?string $label = null): SharedIcon
    {
        $existing = SharedIcon::where('source_generated_icon_id', $source->id)->first();
        if ($existing) {
            return $existing;
        }

        $disk = Storage::disk(config('filesystems.media_disk'));
        if (! $disk->exists($source->image_path)) {
            throw new RuntimeException("Source image is missing on disk: {$source->image_path}");
        }

        $path = 'shared-icons/'.Str::uuid().'.png';
        $disk->put($path, $disk->get($source->image_path));

        $label = $label ?: Str::limit(Str::title(trim((string) $source->prompt)), 40, '');

        return SharedIcon::create([
            'label' => $label ?: null,
            'image_path' => $path,
            'image_url' => $disk->url($path),
            'source_generated_icon_id' => $source->id,
        ]);
    }

    /** Removes the icon from the pack and deletes its copied file. */
    public function demote(SharedIcon $icon): void
    {
        Storage::disk(config('filesystems.media_disk'))->delete($icon->image_path);
        $icon->delete();
    }
}
