<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SharedIconResource\Pages;
use App\Models\AdminAuditLog;
use App\Models\SharedIcon;
use App\Services\IconCurator;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** The app-wide shared icon pack. Icons get in via the AI icons page's "Add to pack". */
class SharedIconResource extends Resource
{
    protected static ?string $model = SharedIcon::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-photo';

    protected static ?string $navigationGroup = 'Content';

    protected static ?string $navigationLabel = 'Shared icon pack';

    protected static ?int $navigationSort = 3;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('label')->maxLength(40),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\ImageColumn::make('image_url')->label('Icon')->size(56),
                Tables\Columns\TextColumn::make('label')->searchable()->placeholder('-'),
                Tables\Columns\TextColumn::make('source_generated_icon_id')->label('From AI icon #')->placeholder('-'),
                Tables\Columns\TextColumn::make('created_at')->label('Added')->dateTime()->sortable(),
            ])
            ->actions([
                Tables\Actions\EditAction::make()
                    ->label('Rename')
                    ->after(fn (SharedIcon $record) => AdminAuditLog::record('updated', $record, ['after' => ['label' => $record->label]])),
                Tables\Actions\Action::make('remove')
                    ->label('Remove from pack')
                    ->icon('heroicon-o-trash')
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalDescription('Removes it for every user and deletes the copied image file.')
                    ->action(function (SharedIcon $record, IconCurator $curator) {
                        $curator->demote($record);
                        AdminAuditLog::record('demoted_icon', $record, ['label' => $record->label]);
                    }),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListSharedIcons::route('/'),
        ];
    }
}
