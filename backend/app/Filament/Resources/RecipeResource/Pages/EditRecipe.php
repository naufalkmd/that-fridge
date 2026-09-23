<?php

namespace App\Filament\Resources\RecipeResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\RecipeResource;
use App\Models\AdminAuditLog;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditRecipe extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = RecipeResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make()
                ->after(fn ($record) => AdminAuditLog::record('deleted', $record, ['name' => $record->name])),
        ];
    }
}
