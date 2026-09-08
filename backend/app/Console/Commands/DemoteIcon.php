<?php

namespace App\Console\Commands;

use App\Models\SharedIcon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

#[Signature('app:demote-icon {id : shared_icons row id}')]
#[Description('Remove an icon from the shared icon pack (deletes its file too)')]
class DemoteIcon extends Command
{
    public function handle(): int
    {
        $icon = SharedIcon::find($this->argument('id'));
        if (! $icon) {
            $this->error("No shared_icons row with id {$this->argument('id')}.");

            return self::FAILURE;
        }

        Storage::disk(config('filesystems.media_disk'))->delete($icon->image_path);
        $icon->delete();

        $this->info("Removed shared_icons #{$icon->id} from the pack.");

        return self::SUCCESS;
    }
}
