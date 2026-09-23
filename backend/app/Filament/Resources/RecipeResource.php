<?php

namespace App\Filament\Resources;

use App\Filament\Resources\RecipeResource\Pages;
use App\Http\Controllers\RecipeController;
use App\Models\AdminAuditLog;
use App\Models\Recipe;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
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

    protected static ?string $navigationGroup = 'Content';

    protected static ?int $navigationSort = 1;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')->required()->maxLength(255),
                Forms\Components\TextInput::make('minutes')->required()->numeric()->minValue(0),
                Forms\Components\TextInput::make('category')->maxLength(255),
                Forms\Components\Select::make('meal_type')->options(self::mealTypeOptions()),
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
                Tables\Columns\ImageColumn::make('icon_url')->label('')->size(36),
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('meal_type')->badge()->placeholder('-')->toggleable(),
                Tables\Columns\TextColumn::make('user.email')->label('Owner')->placeholder('Curated')->searchable(),
                Tables\Columns\TextColumn::make('category')->placeholder('-'),
                Tables\Columns\TextColumn::make('minutes')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('made_count')->numeric()->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable()->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\TernaryFilter::make('curated')
                    ->label('Source')
                    ->trueLabel('Curated')
                    ->falseLabel('User-created')
                    ->queries(
                        true: fn ($query) => $query->whereNull('user_id'),
                        false: fn ($query) => $query->whereNotNull('user_id'),
                        blank: fn ($query) => $query,
                    ),
                Tables\Filters\SelectFilter::make('meal_type')
                    ->options(self::mealTypeOptions()),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
                Tables\Actions\Action::make('copyToCurated')
                    ->label('Copy to curated')
                    ->icon('heroicon-o-document-duplicate')
                    ->visible(fn (Recipe $record) => $record->user_id !== null)
                    ->requiresConfirmation()
                    ->modalDescription('Makes a copy every user can see. The original stays with its owner. Photos and the AI icon are not copied, since they belong to the owner\'s uploads.')
                    ->action(function (Recipe $record) {
                        $copy = $record->replicate(['user_id', 'made_count', 'attachments', 'icon_url']);
                        $copy->user_id = null;
                        $copy->made_count = 0;
                        $copy->save();
                        AdminAuditLog::record('copied_to_curated', $copy, ['from_recipe_id' => $record->id]);
                        Notification::make()->success()->title("Curated copy #{$copy->id} created.")->send();
                    }),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    Tables\Actions\DeleteBulkAction::make()
                        ->after(fn ($records) => $records->each(fn ($r) => AdminAuditLog::record('deleted', $r, ['name' => $r->name]))),
                ]),
            ]);
    }

    /** The fixed set the API accepts (RecipeController::MEAL_TYPES) - no DB lookup needed. */
    private static function mealTypeOptions(): array
    {
        return collect(RecipeController::MEAL_TYPES)->mapWithKeys(fn ($t) => [$t => ucfirst($t)])->all();
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
