<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ExploreItemResource\Pages;
use App\Models\AdminAuditLog;
use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Models\SharedIcon;
use App\Models\User;
use App\Services\MachineDraftValidator;
use Closure;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;

/**
 * The Explore page's catalogue: what is shown, what is featured, in which order, and what is hidden.
 * Recipes and icons point at their own rows (`ref_id`); Machine and meal-plan templates carry their
 * content as JSON, checked on save so a broken template can never reach users.
 */
class ExploreItemResource extends Resource
{
    protected static ?string $model = ExploreItem::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-magnifying-glass';

    protected static ?string $navigationGroup = 'Content';

    protected static ?string $navigationLabel = 'Explore';

    protected static ?int $navigationSort = 2;

    public static function form(Form $form): Form
    {
        return $form->schema([
            Forms\Components\Select::make('type')
                ->options(self::typeOptions())->required()->live()
                ->disabled(fn (?ExploreItem $record) => $record !== null), // a row's library is fixed once made
            Forms\Components\TextInput::make('title')->required()->maxLength(120),
            Forms\Components\TextInput::make('blurb')->maxLength(255)->helperText('One line shown under the title.'),
            Forms\Components\TagsInput::make('tags')->helperText('Extra words people might search for.')->columnSpanFull(),
            Forms\Components\Select::make('ref_id')
                ->label(fn (Forms\Get $get) => $get('type') === 'icon' ? 'Shared icon' : 'Curated recipe')
                ->visible(fn (Forms\Get $get) => in_array($get('type'), ['recipe', 'icon'], true))
                ->required(fn (Forms\Get $get) => in_array($get('type'), ['recipe', 'icon'], true))
                ->searchable()
                ->getSearchResultsUsing(fn (string $search, Forms\Get $get) => self::refOptions($get('type'), $search))
                ->getOptionLabelUsing(fn ($value, Forms\Get $get) => self::refLabel($get('type'), $value)),
            Forms\Components\Textarea::make('payload')
                ->label(fn (Forms\Get $get) => $get('type') === 'machine' ? 'Machine draft (JSON: name, trigger, steps)' : 'Meal plan (JSON: {"days":[{"day":0,"slot":"Dinner","title":"..."}]})')
                ->visible(fn (Forms\Get $get) => in_array($get('type'), ['machine', 'meal_plan'], true))
                ->required(fn (Forms\Get $get) => in_array($get('type'), ['machine', 'meal_plan'], true))
                ->rows(14)->columnSpanFull()
                ->formatStateUsing(fn ($state) => is_array($state) ? json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : $state)
                ->dehydrateStateUsing(fn ($state) => is_string($state) ? json_decode($state, true) : $state)
                ->rules([fn (Forms\Get $get): Closure => self::payloadRule((string) $get('type'), (string) $get('title'))]),
            Forms\Components\Toggle::make('featured')->helperText('Shown at the top of Explore.'),
            Forms\Components\TextInput::make('position')->numeric()->default(0)->minValue(0)->helperText('Lower comes first.'),
            Forms\Components\Select::make('status')->options(self::statusOptions())->default('published')->required(),
        ])->columns(2);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('position')
            ->columns([
                Tables\Columns\TextColumn::make('title')->searchable()->limit(50),
                Tables\Columns\TextColumn::make('type')->badge()->formatStateUsing(fn ($state) => self::typeOptions()[$state] ?? $state)->sortable(),
                Tables\Columns\IconColumn::make('featured')->boolean(),
                Tables\Columns\TextColumn::make('status')->badge()->color(fn ($state) => match ($state) {
                    'published' => 'success',
                    'hidden' => 'danger',
                    default => 'gray',
                })->sortable(),
                Tables\Columns\TextInputColumn::make('position')->type('number')->sortable(),
                Tables\Columns\TextColumn::make('tags')->badge()->limitList(3)->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('type')->options(self::typeOptions()),
                Tables\Filters\SelectFilter::make('status')->options(self::statusOptions()),
                Tables\Filters\TernaryFilter::make('featured'),
            ])
            ->actions([
                Tables\Actions\EditAction::make(),
                Tables\Actions\Action::make('toggleFeatured')
                    ->label(fn (ExploreItem $record) => $record->featured ? 'Unfeature' : 'Feature')
                    ->icon('heroicon-o-star')
                    ->action(function (ExploreItem $record) {
                        $record->update(['featured' => ! $record->featured]);
                        AdminAuditLog::record('updated', $record, ['after' => ['featured' => $record->featured]]);
                    }),
            ])
            ->bulkActions([
                Tables\Actions\BulkActionGroup::make([
                    self::bulkStatus('publish', 'Publish', 'published'),
                    self::bulkStatus('hide', 'Hide', 'hidden'),
                    Tables\Actions\BulkAction::make('feature')->label('Feature')->icon('heroicon-o-star')
                        ->action(fn ($records) => $records->each(function (ExploreItem $r) {
                            $r->update(['featured' => true]);
                            AdminAuditLog::record('updated', $r, ['after' => ['featured' => true]]);
                        }))->deselectRecordsAfterCompletion(),
                    Tables\Actions\DeleteBulkAction::make()
                        ->after(fn ($records) => $records->each(fn ($r) => AdminAuditLog::record('deleted', $r, ['title' => $r->title]))),
                ]),
            ])
            ->headerActions([
                Tables\Actions\Action::make('sync')
                    ->label('Sync from libraries')
                    ->icon('heroicon-o-arrow-path')
                    ->requiresConfirmation()
                    ->modalDescription('Adds any curated recipes and shared icons that are not in Explore yet. Nothing you have edited, featured, reordered or hidden is changed.')
                    ->action(function () {
                        Artisan::call('app:seed-explore');
                        $summary = trim(Artisan::output()) ?: 'Synced.';
                        AdminAuditLog::record('synced_explore', null, ['output' => $summary]);
                        Notification::make()->success()->title($summary)->send();
                    }),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListExploreItems::route('/'),
            'create' => Pages\CreateExploreItem::route('/create'),
            'edit' => Pages\EditExploreItem::route('/{record}/edit'),
        ];
    }

    /** Publish / hide a selection in one go. */
    private static function bulkStatus(string $name, string $label, string $status): Tables\Actions\BulkAction
    {
        return Tables\Actions\BulkAction::make($name)->label($label)
            ->action(fn ($records) => $records->each(function (ExploreItem $r) use ($status) {
                $r->update(['status' => $status]);
                AdminAuditLog::record('updated', $r, ['after' => ['status' => $status]]);
            }))->deselectRecordsAfterCompletion();
    }

    /** @return array<string, string> */
    private static function typeOptions(): array
    {
        return ['icon' => 'Food icon', 'recipe' => 'Recipe', 'machine' => 'Machine', 'meal_plan' => 'Meal plan'];
    }

    /** @return array<string, string> */
    private static function statusOptions(): array
    {
        return collect(ExploreItem::STATUSES)->mapWithKeys(fn ($s) => [$s => ucfirst($s)])->all();
    }

    /** @return array<int|string, string> */
    private static function refOptions(?string $type, string $search): array
    {
        if ($type === 'icon') {
            return SharedIcon::query()->where('label', 'like', "%{$search}%")->limit(30)->pluck('label', 'id')->all();
        }

        return Recipe::query()->whereNull('user_id')->where('name', 'like', "%{$search}%")->limit(30)->pluck('name', 'id')->all();
    }

    private static function refLabel(?string $type, mixed $value): ?string
    {
        return $type === 'icon' ? SharedIcon::find($value)?->label : Recipe::find($value)?->name;
    }

    /**
     * A Machine draft has to be a valid Machine (same validator the app uses before saving one); a meal plan
     * has to be a list of {day 0-41, slot, title}. Anything else is refused with the reason.
     */
    private static function payloadRule(string $type, string $title): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($type, $title) {
            $data = is_string($value) ? json_decode($value, true) : $value;
            if (! is_array($data)) {
                $fail('That is not valid JSON.');

                return;
            }

            if ($type === 'machine') {
                $admin = Auth::user() ?? new User;
                $result = app(MachineDraftValidator::class)->validate($data + ['name' => $title], $admin);
                if (! $result['valid']) {
                    $fail('Not a valid Machine: '.implode(' ', $result['errors']));
                }

                return;
            }

            $days = $data['days'] ?? null;
            $ok = is_array($days) && $days !== [] && collect($days)->every(fn ($d) => is_array($d)
                && isset($d['day'], $d['slot'], $d['title'])
                && is_int($d['day']) && $d['day'] >= 0 && $d['day'] <= 41
                && is_string($d['slot']) && $d['slot'] !== '' && mb_strlen($d['slot']) <= 40
                && is_string($d['title']) && $d['title'] !== '' && mb_strlen($d['title']) <= 120);
            if (! $ok) {
                $fail('Needs {"days":[{"day":0-41,"slot":"…","title":"…"}, …]}.');
            }
        };
    }
}
