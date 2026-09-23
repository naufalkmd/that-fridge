<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ItemResource\Pages;
use App\Models\Item;
use Filament\Infolists;
use Filament\Infolists\Infolist;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only: items belong to users' fridges and are edited in the app. */
class ItemResource extends Resource
{
    protected static ?string $model = Item::class;

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-shopping-bag';

    protected static ?string $navigationGroup = 'Fridge data';

    protected static ?int $navigationSort = 2;

    public static function infolist(Infolist $infolist): Infolist
    {
        return $infolist
            ->columns(2)
            ->schema([
                Infolists\Components\TextEntry::make('name'),
                Infolists\Components\TextEntry::make('icon'),
                Infolists\Components\TextEntry::make('section.fridge.name')->label('Fridge'),
                Infolists\Components\TextEntry::make('section.name')->label('Section'),
                Infolists\Components\TextEntry::make('product.name')->label('Product')->placeholder('-'),
                Infolists\Components\TextEntry::make('category.name')->label('Category')->placeholder('-'),
                Infolists\Components\TextEntry::make('quantity')->numeric(),
                Infolists\Components\TextEntry::make('expiry_date')->date()->placeholder('-'),
                Infolists\Components\IconEntry::make('opened')->boolean(),
                Infolists\Components\TextEntry::make('source')->placeholder('-'),
                Infolists\Components\TextEntry::make('note')->placeholder('-')->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('section.fridge.name')->label('Fridge'),
                Tables\Columns\TextColumn::make('section.name')->label('Section')->toggleable(),
                Tables\Columns\TextColumn::make('quantity')->numeric(),
                Tables\Columns\TextColumn::make('expiry_date')->date()->sortable()->placeholder('-'),
                Tables\Columns\IconColumn::make('opened')->boolean()->toggleable(),
                Tables\Columns\TextColumn::make('source')->toggleable(isToggledHiddenByDefault: true),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->filters([
                Tables\Filters\TernaryFilter::make('opened'),
                Tables\Filters\Filter::make('expired')
                    ->query(fn ($query) => $query->whereDate('expiry_date', '<', today())),
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListItems::route('/'),
            'view' => Pages\ViewItem::route('/{record}'),
        ];
    }
}
