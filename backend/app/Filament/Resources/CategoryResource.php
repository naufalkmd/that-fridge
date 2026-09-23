<?php

namespace App\Filament\Resources;

use App\Filament\Resources\CategoryResource\Pages;
use App\Models\Category;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Categories belong to each user (their own item groupings), so this is read-only. */
class CategoryResource extends Resource
{
    protected static ?string $model = Category::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-tag';

    protected static ?string $navigationGroup = 'Fridge data';

    protected static ?int $navigationSort = 3;

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\ColorColumn::make('color'),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('user.email')->label('Owner')->searchable(),
                Tables\Columns\TextColumn::make('items_count')->counts('items')->label('Items')->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable()->toggleable(isToggledHiddenByDefault: true),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListCategories::route('/'),
        ];
    }
}
