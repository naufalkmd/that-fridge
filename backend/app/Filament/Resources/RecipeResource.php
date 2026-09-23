<?php

namespace App\Filament\Resources;

use App\Filament\Resources\RecipeResource\Pages;
use App\Models\Recipe;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/**
 * Curated recipes have no user_id and are shown to everyone; the rest are users' own.
 * Ingredients are [{icon, name}] and steps are a list of strings (see DatabaseSeeder).
 */
class RecipeResource extends Resource
{
    protected static ?string $model = Recipe::class;

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-book-open';

    protected static ?int $navigationSort = 5;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')->required()->maxLength(255),
                Forms\Components\TextInput::make('minutes')->required()->numeric()->minValue(0),
                Forms\Components\TextInput::make('category')->maxLength(255),
                Forms\Components\TextInput::make('meal_type')->maxLength(255),
                Forms\Components\TextInput::make('icon')->maxLength(255),
                Forms\Components\Select::make('user_id')
                    ->relationship('user', 'email')
                    ->searchable()
                    ->placeholder('Curated (everyone)'),
                Forms\Components\Repeater::make('ingredients')
                    ->schema([
                        Forms\Components\TextInput::make('icon')->required(),
                        Forms\Components\TextInput::make('name')->required(),
                    ])
                    ->columns(2)
                    ->defaultItems(1)
                    ->columnSpanFull(),
                Forms\Components\Repeater::make('steps')
                    ->simple(Forms\Components\Textarea::make('step')->required()->rows(2))
                    ->defaultItems(1)
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('user.email')->label('Owner')->placeholder('Curated')->searchable(),
                Tables\Columns\TextColumn::make('category')->placeholder('-'),
                Tables\Columns\TextColumn::make('minutes')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('made_count')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable()->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\Filter::make('curated')
                    ->query(fn ($query) => $query->whereNull('user_id')),
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
            'index' => Pages\ListRecipes::route('/'),
            'create' => Pages\CreateRecipe::route('/create'),
            'edit' => Pages\EditRecipe::route('/{record}/edit'),
        ];
    }
}
