<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ProductResource\Pages;
use App\Models\Product;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** The shared barcode catalog - editable, since it isn't owned by any one user. */
class ProductResource extends Resource
{
    protected static ?string $model = Product::class;

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-qr-code';

    protected static ?int $navigationSort = 4;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')->required()->maxLength(255),
                Forms\Components\TextInput::make('barcode')->maxLength(255)->unique(ignoreRecord: true),
                Forms\Components\TextInput::make('icon')->maxLength(255),
                Forms\Components\TextInput::make('category')->maxLength(255),
                Forms\Components\TextInput::make('location')->maxLength(255),
                Forms\Components\TextInput::make('default_shelf_life_days')->numeric()->minValue(0),
                Forms\Components\TextInput::make('image_url')->url()->maxLength(255)->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('barcode')->searchable()->placeholder('-'),
                Tables\Columns\TextColumn::make('category')->searchable()->placeholder('-'),
                Tables\Columns\TextColumn::make('default_shelf_life_days')->label('Shelf life (days)')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('items_count')->counts('items')->label('Items')->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable()->toggleable(isToggledHiddenByDefault: true),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListProducts::route('/'),
            'create' => Pages\CreateProduct::route('/create'),
            'edit' => Pages\EditProduct::route('/{record}/edit'),
        ];
    }
}
