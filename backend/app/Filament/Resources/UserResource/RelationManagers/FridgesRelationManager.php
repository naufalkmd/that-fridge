<?php

namespace App\Filament\Resources\UserResource\RelationManagers;

use App\Filament\Resources\FridgeResource;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only - fridge membership is managed from the app. */
class FridgesRelationManager extends RelationManager
{
    protected static string $relationship = 'memberFridges';

    protected static ?string $title = 'Fridges';

    public function isReadOnly(): bool
    {
        return true;
    }

    public function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('name'),
                Tables\Columns\TextColumn::make('role')->badge(),
                Tables\Columns\TextColumn::make('members_count')->counts('members')->label('Members'),
                Tables\Columns\TextColumn::make('created_at')->label('Fridge created')->dateTime(),
            ])
            ->recordUrl(fn ($record) => FridgeResource::getUrl('view', ['record' => $record]));
    }
}
