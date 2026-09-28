<?php

namespace App\Filament\Resources\RecipeResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\RecipeResource;
use App\Models\AdminAuditLog;
use App\Services\IconGenerationService;
use App\Support\RecipeIconGeneration;
use Filament\Actions;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Auth;

class EditRecipe extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = RecipeResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('generateIcon')
                ->label(fn () => $this->record->icon_url ? 'Regenerate AI icon' : 'Generate AI icon')
                ->icon('heroicon-m-sparkles')
                ->color('gray')
                ->requiresConfirmation()
                ->modalDescription('Draws a pixel icon for this dish in the background (10-20 seconds, about $'.number_format(RecipeIconGeneration::COST_USD, 3).'). It replaces any AI icon it has now.')
                ->action(function () {
                    if (! app(IconGenerationService::class)->available()) {
                        Notification::make()->danger()->title('fal.ai is not configured on this server.')->send();

                        return;
                    }
                    RecipeIconGeneration::queue([$this->record->id], (int) Auth::id(), true);
                    AdminAuditLog::record('queued_recipe_icons', $this->record, ['count' => 1]);
                    Notification::make()->success()->title('Drawing the icon')->body('Refresh in about 20 seconds.')->send();
                }),
            Actions\Action::make('removeAiIcon')
                ->label('Remove AI icon')
                ->color('danger')
                ->visible(fn () => (bool) $this->record->icon_url)
                ->requiresConfirmation()
                ->modalDescription('The recipe goes back to its pixel icon (or its first ingredient\'s).')
                ->action(function () {
                    $before = $this->record->icon_url;
                    $this->record->update(['icon_url' => null]);
                    AdminAuditLog::record('updated', $this->record, ['before' => ['icon_url' => $before], 'after' => ['icon_url' => null]]);
                    $this->refreshFormData(['icon_url']);
                    Notification::make()->success()->title('AI icon removed')->send();
                }),
            Actions\DeleteAction::make()
                ->after(fn ($record) => AdminAuditLog::record('deleted', $record, ['name' => $record->name])),
        ];
    }
}
