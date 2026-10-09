<?php

namespace App\Filament\Resources;

use App\Filament\Resources\AndroidWaitlistResource\Pages;
use App\Models\AndroidWaitlistSignup;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only list of thatfridge.com's Android waitlist signups. */
class AndroidWaitlistResource extends Resource
{
    protected static ?string $model = AndroidWaitlistSignup::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $slug = 'android-waitlist';

    protected static ?string $navigationIcon = 'heroicon-o-device-phone-mobile';

    protected static ?string $navigationGroup = 'Users';

    protected static ?string $navigationLabel = 'Android waitlist';

    protected static ?string $modelLabel = 'waitlist signup';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('email')->searchable()->copyable(),
                Tables\Columns\TextColumn::make('country')->sortable()->placeholder('-'),
                Tables\Columns\TextColumn::make('source')->placeholder('-'),
                Tables\Columns\TextColumn::make('created_at')->label('Signed up')->dateTime()->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('country')
                    ->options(fn () => AndroidWaitlistSignup::query()->whereNotNull('country')
                        ->distinct()->orderBy('country')->pluck('country', 'country')->all()),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListAndroidWaitlist::route('/'),
        ];
    }
}
