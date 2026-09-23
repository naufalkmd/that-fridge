<?php

namespace App\Console\Commands;

use App\Models\GeneratedIcon;
use App\Models\SharedIcon;
use App\Services\IconCurator;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use RuntimeException;

/**
 * Curate one user-generated icon into the app-wide shared pack (see IconCurator::promote for
 * why the file is copied and de-identified). The admin panel's AI icons page does the same.
 */
#[Signature('app:promote-icon {id : generated_icons row id} {--label= : short picker label, e.g. "Tomato"}')]
#[Description('Add a generated icon to the shared icon pack shown to all users')]
class PromoteIcon extends Command
{
    public function handle(IconCurator $curator): int
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

        try {
            $icon = $curator->promote($source, $this->option('label'));
        } catch (RuntimeException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $label = $icon->label;
        $this->info("Promoted generated icon #{$source->id} → shared_icons #{$icon->id}".($label ? " (\"{$label}\")" : ''));

        return self::SUCCESS;
    }
}
