<?php

namespace App\Filament\Resources;

use App\Filament\Resources\FridgeResource\Pages;
use App\Models\Fridge;
use Filament\Infolists;
use Filament\Infolists\Infolist;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only: fridge contents belong to users and are edited in the app. */
class FridgeResource extends Resource
{
    protected static ?string $model = Fridge::class;

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-archive-box';

    protected static ?int $navigationSort = 2;

    public static function infolist(Infolist $infolist): Infolist
    {
        return $infolist
            ->columns(2)
            ->schema([
                Infolists\Components\TextEntry::make('name'),
                Infolists\Components\TextEntry::make('user.email')->label('Owner'),
                Infolists\Components\TextEntry::make('style')->placeholder('-'),
                Infolists\Components\TextEntry::make('created_at')->dateTime(),
                Infolists\Components\TextEntry::make('members.email')->label('Members')->badge(),
                Infolists\Components\TextEntry::make('sections.name')->label('Sections')->badge(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('user.email')->label('Owner')->searchable(),
                Tables\Columns\TextColumn::make('members_count')->counts('members')->label('Members')->sortable(),
                Tables\Columns\TextColumn::make('sections_count')->counts('sections')->label('Sections')->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListFridges::route('/'),
            'view' => Pages\ViewFridge::route('/{record}'),
        ];
    }
}
