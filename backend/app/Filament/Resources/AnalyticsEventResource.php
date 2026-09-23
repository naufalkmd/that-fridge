<?php

namespace App\Filament\Resources;

use App\Filament\Resources\AnalyticsEventResource\Pages;
use App\Models\AnalyticsEvent;
use Filament\Forms;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only. Rows older than app:prune-stale-data's retention window are deleted daily. */
class AnalyticsEventResource extends Resource
{
    protected static ?string $model = AnalyticsEvent::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-chart-bar';

    protected static ?string $navigationGroup = 'System';

    protected static ?int $navigationSort = 2;

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('occurred_at')->dateTime()->sortable()->placeholder('-'),
                Tables\Columns\TextColumn::make('name')->badge()->searchable(),
                Tables\Columns\TextColumn::make('platform')->placeholder('-'),
                Tables\Columns\TextColumn::make('app_version')->placeholder('-'),
                Tables\Columns\TextColumn::make('user_id')->label('User')->placeholder('anon')
                    ->url(fn (AnalyticsEvent $record) => $record->user_id ? UserResource::getUrl('view', ['record' => $record->user_id]) : null),
                Tables\Columns\TextColumn::make('props')
                    ->state(fn (AnalyticsEvent $record) => $record->props ? json_encode($record->props, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '-')
                    ->limit(80),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('name')
                    ->label('Event')
                    ->searchable()
                    ->options(fn () => AnalyticsEvent::distinct()->orderBy('name')->pluck('name', 'name')->all()),
                Tables\Filters\SelectFilter::make('platform')
                    ->options(fn () => AnalyticsEvent::whereNotNull('platform')->distinct()->pluck('platform', 'platform')->all()),
                Tables\Filters\SelectFilter::make('app_version')
                    ->options(fn () => AnalyticsEvent::whereNotNull('app_version')->distinct()->orderByDesc('app_version')->pluck('app_version', 'app_version')->all()),
                Tables\Filters\Filter::make('date')
                    ->form([
                        Forms\Components\DatePicker::make('from'),
                        Forms\Components\DatePicker::make('until'),
                    ])
                    ->query(fn ($query, array $data) => $query
                        ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
                        ->when($data['until'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListAnalyticsEvents::route('/'),
        ];
    }
}
