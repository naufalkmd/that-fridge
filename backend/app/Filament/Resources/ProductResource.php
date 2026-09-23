<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ProductResource\Pages;
use App\Models\AdminAuditLog;
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

    /** Same values the app accepts for an item's location (ItemController). */
    private const LOCATIONS = ['fridge' => 'Fridge', 'freezer' => 'Freezer', 'pantry' => 'Pantry'];

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-qr-code';

    protected static ?string $navigationGroup = 'Content';

    protected static ?int $navigationSort = 2;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')->required()->maxLength(255),
                Forms\Components\TextInput::make('barcode')->maxLength(255)->unique(ignoreRecord: true),
                Forms\Components\TextInput::make('icon')->maxLength(255),
                Forms\Components\TextInput::make('category')->maxLength(255),
                Forms\Components\Select::make('location')->options(self::LOCATIONS),
                Forms\Components\TextInput::make('default_shelf_life_days')->numeric()->minValue(0),
                Forms\Components\TextInput::make('image_url')->url()->maxLength(255)->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\ImageColumn::make('image_url')->label('')->size(36),
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('barcode')->searchable()->placeholder('-'),
                Tables\Columns\TextColumn::make('category')->searchable()->placeholder('-'),
                Tables\Columns\TextColumn::make('location')->badge()->placeholder('-'),
                Tables\Columns\TextColumn::make('default_shelf_life_days')->label('Shelf life (days)')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('items_count')->counts('items')->label('Items')->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable()->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\Filter::make('missing_image')
                    ->query(fn ($query) => $query->whereNull('image_url')),
                Tables\Filters\Filter::make('missing_category')
                    ->query(fn ($query) => $query->where(fn ($q) => $q->whereNull('category')->orWhere('category', ''))),
                Tables\Filters\SelectFilter::make('location')
                    ->options(self::LOCATIONS),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make()
                        ->after(fn ($records) => $records->each(fn ($r) => AdminAuditLog::record('deleted', $r, ['name' => $r->name]))),
                    Tables\Actions\BulkAction::make('setLocation')
                        ->label('Set location')
                        ->icon('heroicon-o-map-pin')
                        ->form([
                            Forms\Components\Select::make('location')->options(self::LOCATIONS)->required(),
                        ])
                        ->deselectRecordsAfterCompletion()
                        ->action(function ($records, array $data) {
                            $records->each(function (Product $product) use ($data) {
                                $before = $product->location;
                                $product->update(['location' => $data['location']]);
                                AdminAuditLog::record('updated', $product, ['before' => ['location' => $before], 'after' => ['location' => $data['location']]]);
                            });
                        }),
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
