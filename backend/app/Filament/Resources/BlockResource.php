<?php

namespace App\Filament\Resources;

use App\Filament\Resources\BlockResource\Pages;
use App\Models\Block;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only: who blocked whom. Blocks are made and undone from the app. */
class BlockResource extends Resource
{
    protected static ?string $model = Block::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-no-symbol';

    protected static ?string $navigationGroup = 'Users';

    protected static ?int $navigationSort = 3;

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('blocker.email')->label('Blocker')->searchable()
                    ->url(fn (Block $record) => UserResource::getUrl('view', ['record' => $record->blocker_id])),
                Tables\Columns\TextColumn::make('blocked.email')->label('Blocked')->searchable()
                    ->url(fn (Block $record) => UserResource::getUrl('view', ['record' => $record->blocked_id])),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListBlocks::route('/'),
        ];
    }
}
