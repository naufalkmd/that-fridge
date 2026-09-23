<?php

namespace App\Filament\Resources\UserResource\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only - tokens are registered by the app. */
class PushTokensRelationManager extends RelationManager
{
    protected static string $relationship = 'pushTokens';

    protected static ?string $title = 'Push devices';

    public function isReadOnly(): bool
    {
        return true;
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('platform')->placeholder('-'),
                Tables\Columns\TextColumn::make('token')->limit(24),
                Tables\Columns\TextColumn::make('created_at')->label('Registered')->dateTime(),
            ]);
    }
}
