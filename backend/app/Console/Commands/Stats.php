<?php

namespace App\Console\Commands;

use App\Services\AdminStats;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * A one-glance operational pulse for a solo operator - "is anyone using this, and is
 * anything on fire". Same numbers as the /admin dashboard (both read AdminStats); this is
 * the SSH version. `--json` for piping into anything else.
 */
#[Signature('app:stats {--json : Emit a JSON object instead of a table}')]
#[Description('Print user / usage / content / cost counters at a glance')]
class Stats extends Command
{
    public function handle(AdminStats $adminStats): int
    {
        $stats = $adminStats->snapshot();

        if ($this->option('json')) {
            $this->line(json_encode($stats, JSON_PRETTY_PRINT));

            return self::SUCCESS;
        }

        foreach ($stats as $section => $rows) {
            $this->newLine();
            $this->components->info(str_replace('_', ' ', ucfirst($section)));
            foreach ($rows as $label => $value) {
                $this->components->twoColumnDetail(
                    str_replace('_', ' ', $label),
                    (string) $value.($label === 'conversion_pct' ? '%' : ''),
                );
            }
        }
        $this->newLine();

        return self::SUCCESS;
    }
}
