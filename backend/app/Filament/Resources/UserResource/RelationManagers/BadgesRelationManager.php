<?php

namespace App\Filament\Resources\UserResource\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only - badges are awarded by BadgeService. */
class BadgesRelationManager extends RelationManager
{
    protected static string $relationship = 'badges';

    protected static ?string $title = 'Badges';

    public function isReadOnly(): bool
    {
        return true;
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('badge_key')->label('Badge'),
                Tables\Columns\TextColumn::make('progress')->numeric(),
                Tables\Columns\TextColumn::make('earned_at')->dateTime()->placeholder('In progress'),
            ]);
    }
}
