<?php

namespace App\Filament\Resources\RecipeResource\Pages;

use App\Filament\Resources\RecipeResource;
use App\Models\AdminAuditLog;
use App\Services\IconGenerationService;
use App\Support\RecipeIconGeneration;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Support\Facades\Auth;

class ListRecipes extends ListRecords
{
    protected static string $resource = RecipeResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('generateMissingIcons')
                ->label('Generate missing icons')
                ->icon('heroicon-m-sparkles')
                ->color('gray')
                ->modalHeading('Generate icons for recipes that have none')
                ->modalDescription(function () {
                    $n = RecipeIconGeneration::missing()->count();

                    return $n === 0
                        ? 'Every curated recipe has an icon.'
                        : "{$n} curated recipes have no icon of their own (imported ones usually). Each icon takes 10-20 seconds and costs about $"
                            .number_format(RecipeIconGeneration::COST_USD, 3).'; they run in the background, newest recipes first.';
                })
                ->form([
                    Forms\Components\TextInput::make('limit')
                        ->label('How many to do now')
                        ->numeric()->integer()->minValue(1)->maxValue(RecipeIconGeneration::MAX_BATCH)
                        ->default(fn () => max(1, min(RecipeIconGeneration::missing()->count(), 50)))
                        ->required(),
                ])
                ->modalSubmitActionLabel('Start')
                ->action(function (array $data) {
                    if (! app(IconGenerationService::class)->available()) {
                        Notification::make()->danger()->title('fal.ai is not configured on this server.')->send();

                        return;
                    }
                    $ids = RecipeIconGeneration::missing()->latest('id')->limit((int) $data['limit'])->pluck('id');
                    $n = RecipeIconGeneration::queue($ids, (int) Auth::id(), false);
                    AdminAuditLog::record('queued_recipe_icons', null, ['count' => $n, 'scope' => 'missing']);
                    Notification::make()->success()->title("Generating {$n} icons")->body('They appear as each one finishes. Refresh in a few minutes.')->send();
                }),
            Actions\CreateAction::make(),
        ];
    }
}
