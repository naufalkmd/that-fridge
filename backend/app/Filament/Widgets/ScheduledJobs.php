<?php

namespace App\Filament\Widgets;

use App\Models\AdminAuditLog;
use App\Support\JobHeartbeat;
use Filament\Actions\Action;
use Filament\Actions\Concerns\InteractsWithActions;
use Filament\Actions\Contracts\HasActions;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Notifications\Notification;
use Filament\Widgets\Widget;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

/**
 * Last run of each scheduled command, plus "run now" buttons for the two that are safe to
 * trigger by hand. The monthly credit grant is deliberately schedule-only: running it
 * again in the same month is idempotent per user, but a mistyped --month would hand out a
 * second allowance, so it stays off the panel.
 */
class ScheduledJobs extends Widget implements HasActions, HasForms
{
    use InteractsWithActions;
    use InteractsWithForms;

    protected static string $view = 'filament.widgets.scheduled-jobs';

    protected static ?int $sort = 9;

    protected int|string|array $columnSpan = 'full';

    protected function getViewData(): array
    {
        return [
            'jobs' => collect(JobHeartbeat::JOBS)->map(function ($meta, $command) {
                $last = JobHeartbeat::last($command);

                return $meta + [
                    'command' => $command,
                    'ok' => $last['ok'] ?? null,
                    'at' => isset($last['at']) ? Carbon::parse($last['at'])->diffForHumans() : null,
                ];
            })->values(),
        ];
    }

    public function pruneDryRunAction(): Action
    {
        return Action::make('pruneDryRun')
            ->label('Preview prune')
            ->color('gray')
            ->action(fn () => $this->runCommand('app:prune-stale-data', ['--dry-run' => true], record: false));
    }

    public function pruneAction(): Action
    {
        return Action::make('prune')
            ->label('Run prune now')
            ->color('danger')
            ->requiresConfirmation()
            ->modalDescription('Deletes old analytics/notification rows, finished join requests and orphaned scan/icon files. Use "Preview prune" first to see what would go.')
            ->action(fn () => $this->runCommand('app:prune-stale-data'));
    }

    public function freshnessAction(): Action
    {
        return Action::make('freshness')
            ->label('Run freshness check now')
            ->requiresConfirmation()
            ->modalDescription('Creates expiry / low-stock notifications for users who want them. Running it twice in a day can repeat notifications.')
            ->action(fn () => $this->runCommand('app:check-item-freshness'));
    }

    private function runCommand(string $command, array $args = [], bool $record = true): void
    {
        $code = Artisan::call($command, $args);
        $output = trim(Artisan::output());
        $ok = $code === 0;

        if ($record) {
            JobHeartbeat::record($command, $ok);
            AdminAuditLog::record('ran_command', null, ['command' => $command, 'exit_code' => $code]);
        }

        Notification::make()
            ->title($ok ? "{$command} finished" : "{$command} failed (exit {$code})")
            ->body($output !== '' ? Str::limit($output, 1500) : null)
            ->status($ok ? 'success' : 'danger')
            ->persistent()
            ->send();
    }
}
