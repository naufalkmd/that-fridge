<?php

namespace App\Filament\Pages;

use App\Filament\Resources\ExploreItemResource;
use App\Jobs\ImportRecipes;
use App\Models\AdminAuditLog;
use App\Models\ExploreItem;
use App\Services\RecipeImport\RecipeImportSettings;
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Forms;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/**
 * Control the automatic recipe import (TheMealDB → Explore drafts): switch the daily run on or
 * off, pick its time and batch size, or run it now. New recipes always wait as drafts in Explore
 * until an admin publishes them.
 */
class RecipeImport extends Page implements HasForms
{
    use InteractsWithForms;

    protected static ?string $navigationIcon = 'heroicon-o-arrow-down-tray';

    protected static ?string $navigationGroup = 'Recipes & Explore';

    protected static ?string $navigationLabel = 'Recipe import';

    protected static ?string $title = 'Recipe import';

    protected static ?int $navigationSort = 4;

    protected static string $view = 'filament.pages.recipe-import';

    /** @var array<string, mixed> */
    public array $data = [];

    public static function canAccess(): bool
    {
        $user = Filament::auth()->user();

        return $user !== null && $user->canAccessPanel(Filament::getCurrentPanel());
    }

    public function mount(): void
    {
        $this->form->fill([
            'enabled' => RecipeImportSettings::enabled(),
            'time' => RecipeImportSettings::time(),
            'limit' => RecipeImportSettings::limit(),
        ]);
    }

    public function form(Form $form): Form
    {
        return $form->statePath('data')->schema([
            Forms\Components\Toggle::make('enabled')
                ->label('Import automatically every day'),
            Forms\Components\TextInput::make('time')
                ->label('Time of day')
                ->helperText('24-hour, server time ('.config('app.timezone').'). The import runs once a day at this minute.')
                ->required()
                ->regex('/^([01]\d|2[0-3]):[0-5]\d$/')
                ->placeholder('03:40')
                ->maxLength(5),
            Forms\Components\TextInput::make('limit')
                ->label('New recipes per run')
                ->numeric()->integer()->minValue(1)->maxValue(RecipeImportSettings::MAX_LIMIT)->required(),
        ]);
    }

    public function save(): void
    {
        $state = $this->form->getState();
        RecipeImportSettings::save((bool) $state['enabled'], (string) $state['time'], (int) $state['limit']);
        AdminAuditLog::record('updated_recipe_import', null, ['after' => $state]);

        Notification::make()->title('Import schedule saved')->success()->send();
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('runNow')
                ->label('Run now')
                ->icon('heroicon-m-play')
                ->form([
                    Forms\Components\TextInput::make('limit')
                        ->label('New recipes to add')
                        ->numeric()->integer()->minValue(1)->maxValue(RecipeImportSettings::MAX_LIMIT)
                        ->default(fn () => RecipeImportSettings::limit())->required(),
                ])
                ->modalDescription('Runs in the background and adds recipes to Explore as drafts. Refresh this page in a minute to see the result.')
                ->modalSubmitActionLabel('Start import')
                ->action(function (array $data) {
                    ImportRecipes::dispatch((int) $data['limit']);
                    AdminAuditLog::record('ran_recipe_import', null, ['limit' => (int) $data['limit']]);
                    Notification::make()->title('Import started')->body('New recipes will appear in Explore as drafts.')->success()->send();
                }),
        ];
    }

    /** @return array{imported: int, exists: int, duplicate: int, low_quality: int, trigger: string, at: string}|null */
    public function lastRun(): ?array
    {
        return RecipeImportSettings::lastRun();
    }

    public function draftsWaiting(): int
    {
        return ExploreItem::query()->where('type', 'recipe')->where('status', 'draft')->count();
    }

    public function draftsUrl(): string
    {
        return ExploreItemResource::getUrl('index', ['tableFilters' => ['status' => ['value' => 'draft']]]);
    }

    /** The public test key "1" is for development only. */
    public function usingTestKey(): bool
    {
        return (string) config('services.themealdb.key', '1') === '1';
    }
}
