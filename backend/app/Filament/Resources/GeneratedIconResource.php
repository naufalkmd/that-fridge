<?php

namespace App\Filament\Resources;

use App\Filament\Resources\GeneratedIconResource\Pages;
use App\Models\AdminAuditLog;
use App\Models\GeneratedIcon;
use App\Services\IconCurator;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Browse what users have AI-generated and hand-pick generic ones into the shared pack.
 * Replaces app:generated-icons --html. Who generated an icon isn't shown - a promoted icon
 * becomes a de-identified asset, so there's no reason to look.
 */
class GeneratedIconResource extends Resource
{
    protected static ?string $model = GeneratedIcon::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-sparkles';

    protected static ?string $navigationGroup = 'Content';

    protected static ?string $navigationLabel = 'AI icons';

    protected static ?string $modelLabel = 'AI icon';

    protected static ?int $navigationSort = 4;

    public static function table(Table $table): Table
    {
        return $table
            // One EXISTS subquery for the whole page instead of two lookups per row.
            ->modifyQueryUsing(fn ($query) => $query->withExists('sharedIcon'))
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\ImageColumn::make('image_url')->label('Icon')->size(56),
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('kind')->badge(),
                Tables\Columns\TextColumn::make('prompt')->limit(50)->searchable(),
                Tables\Columns\IconColumn::make('shared_icon_exists')
                    ->label('In pack')
                    ->boolean(),
                Tables\Columns\TextColumn::make('created_at')->since()->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('kind')->options(['icon' => 'Item icon', 'recipe' => 'Recipe icon']),
                Tables\Filters\Filter::make('not_in_pack')
                    ->label('Not in pack yet')
                    ->query(fn ($query) => $query->whereDoesntHave('sharedIcon')),
                Tables\Filters\SelectFilter::make('age')
                    ->label('Generated')
                    ->options(['7' => 'Last 7 days', '30' => 'Last 30 days', '90' => 'Last 90 days'])
                    ->query(fn ($query, array $data) => $data['value'] ? $query->where('created_at', '>=', now()->subDays((int) $data['value'])) : $query),
            ])
            ->actions([
                Tables\Actions\Action::make('promote')
                    ->label('Add to pack')
                    ->icon('heroicon-o-plus')
                    ->hidden(fn (GeneratedIcon $record) => (bool) $record->shared_icon_exists)
                    ->form([
                        Forms\Components\TextInput::make('label')
                            ->helperText('Short picker label, e.g. "Tomato"')
                            ->default(fn (GeneratedIcon $record) => Str::limit(Str::title(trim((string) $record->prompt)), 40, ''))
                            ->maxLength(40),
                    ])
                    ->action(function (GeneratedIcon $record, array $data, IconCurator $curator) {
                        try {
                            $icon = $curator->promote($record, $data['label'] ?? null);
                        } catch (RuntimeException $e) {
                            Notification::make()->danger()->title($e->getMessage())->send();

                            return;
                        }
                        AdminAuditLog::record('promoted_icon', $icon, ['generated_icon_id' => $record->id, 'label' => $icon->label]);
                        Notification::make()->success()->title('Added to the shared pack.')->send();
                    }),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListGeneratedIcons::route('/'),
        ];
    }
}
