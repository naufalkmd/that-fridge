<?php

namespace App\Filament\Resources\UserResource\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only - blocks are made from the app. */
class BlockingRelationManager extends RelationManager
{
    protected static string $relationship = 'blocking';

    protected static ?string $title = 'Has blocked';

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
