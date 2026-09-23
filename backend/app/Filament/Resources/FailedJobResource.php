<?php

namespace App\Filament\Resources;

use App\Filament\Resources\FailedJobResource\Pages;
use App\Models\AdminAuditLog;
use App\Models\FailedJob;
use Filament\Infolists;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Artisan;

/** Queue jobs that exhausted their retries. Retry pushes them back onto the queue. */
class FailedJobResource extends Resource
{
    protected static ?string $model = FailedJob::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-exclamation-triangle';

    protected static ?string $navigationGroup = 'System';

    protected static ?int $navigationSort = 3;

    public static function getNavigationBadge(): ?string
    {
        $count = FailedJob::count();

        return $count > 0 ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('failed_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('failed_at')->dateTime()->sortable(),
                Tables\Columns\TextColumn::make('job')->state(fn (FailedJob $record) => $record->jobName()),
                Tables\Columns\TextColumn::make('queue'),
                Tables\Columns\TextColumn::make('exception')
                    ->state(fn (FailedJob $record) => strtok($record->exception, "\n"))
                    ->limit(100)
                    ->wrap(),
            ])
            ->actions([
                Tables\Actions\ViewAction::make()
                    ->infolist([
                        Infolists\Components\TextEntry::make('uuid')->copyable(),
                        Infolists\Components\TextEntry::make('exception')
                            ->extraAttributes(['style' => 'white-space: pre-wrap; font-family: monospace; font-size: 12px']),
                    ]),
                Tables\Actions\Action::make('retry')
                    ->icon('heroicon-o-arrow-path')
                    ->action(fn (FailedJob $record) => self::retry(collect([$record]))),
                Tables\Actions\DeleteAction::make()
                    ->after(fn (FailedJob $record) => AdminAuditLog::record('deleted_failed_job', $record, ['job' => $record->jobName()])),
            ])
            ->bulkActions([
                Tables\Actions\BulkAction::make('retry')
                    ->icon('heroicon-o-arrow-path')
                    ->deselectRecordsAfterCompletion()
                    ->action(fn (Collection $records) => self::retry($records)),
                Tables\Actions\DeleteBulkAction::make()
                    ->after(fn (Collection $records) => AdminAuditLog::record('deleted_failed_job', null, ['count' => $records->count()])),
            ]);
    }

    /** queue:retry removes each job from failed_jobs and pushes it back onto its queue. */
    private static function retry(Collection $records): void
    {
        Artisan::call('queue:retry', ['id' => $records->pluck('uuid')->all()]);
        AdminAuditLog::record('retried_failed_jobs', null, ['uuids' => $records->pluck('uuid')->all()]);
        Notification::make()->success()->title("Retrying {$records->count()} job(s).")->send();
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListFailedJobs::route('/'),
        ];
    }
}
