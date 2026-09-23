<?php

namespace App\Filament\Resources\UserResource\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only - blocks are made from the app. */
class BlockedByRelationManager extends RelationManager
{
    protected static string $relationship = 'blockedBy';

    protected static ?string $title = 'Blocked by';

    public function isReadOnly(): bool
    {
        return true;
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('email'),
                Tables\Columns\TextColumn::make('username')->placeholder('-'),
            ]);
    }
}
