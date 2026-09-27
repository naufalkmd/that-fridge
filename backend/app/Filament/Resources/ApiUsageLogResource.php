<?php

namespace App\Filament\Resources;

use App\Filament\Concerns\CachedOptions;
use App\Filament\Resources\ApiUsageLogResource\Pages;
use App\Models\ApiUsageLog;
use App\Support\Money;
use Filament\Forms;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Columns\Summarizers\Sum;
use Filament\Tables\Table;

/** Read-only: every paid AI call with who made it, what for, and what it cost. Filter by user or feature to see where money goes. */
class ApiUsageLogResource extends Resource
{
    protected static ?string $model = ApiUsageLog::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-receipt-percent';

    protected static ?string $navigationGroup = 'Insights';

    protected static ?string $navigationLabel = 'AI call log';

    protected static ?string $modelLabel = 'AI call';

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->paginated([25, 50, 100])
            ->modifyQueryUsing(fn ($query) => $query->with('user:id,name,email'))
            ->columns([
                Tables\Columns\TextColumn::make('created_at')->label('When')->dateTime()->sortable(),
                Tables\Columns\TextColumn::make('feature')->badge()->searchable(),
                Tables\Columns\TextColumn::make('user.email')->label('User')->placeholder('system')
                    ->url(fn (ApiUsageLog $record) => $record->user_id ? UserResource::getUrl('view', ['record' => $record->user_id]) : null),
                Tables\Columns\TextColumn::make('model')->placeholder('-')->toggleable(),
                Tables\Columns\TextColumn::make('prompt_tokens')->label('In')->numeric()->toggleable(),
                Tables\Columns\TextColumn::make('completion_tokens')->label('Out')->numeric()->toggleable(),
                Tables\Columns\TextColumn::make('cost_usd')->label('Cost')->sortable()
                    ->formatStateUsing(fn ($state, ApiUsageLog $record) => $state === null ? '-' : ($record->cost_estimated ? '≈ ' : '').Money::usd((float) $state))
                    ->summarize(Sum::make()->label('Total')->formatStateUsing(fn ($state) => Money::usd((float) $state))),
                Tables\Columns\TextColumn::make('latency_ms')->label('Time')->formatStateUsing(fn ($state) => round($state / 1000, 1).'s')->toggleable(),
                Tables\Columns\IconColumn::make('ok')->boolean(),
                Tables\Columns\TextColumn::make('reason')->placeholder('-')->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('feature')
                    ->searchable()
                    ->options(fn () => CachedOptions::distinct(ApiUsageLog::class, 'feature')),
                Tables\Filters\SelectFilter::make('user_id')
                    ->label('User')
                    ->relationship('user', 'email')
                    ->searchable(),
                Tables\Filters\SelectFilter::make('provider')
                    ->options(['openrouter' => 'OpenRouter', 'fal' => 'fal.ai']),
                Tables\Filters\SelectFilter::make('model')
                    ->options(fn () => CachedOptions::distinct(ApiUsageLog::class, 'model')),
                Tables\Filters\TernaryFilter::make('ok')->label('Succeeded'),
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

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListApiUsageLogs::route('/'),
        ];
    }
}
