<?php

namespace App\Filament\Resources\ExploreItemResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\ExploreItemResource;
use App\Models\AdminAuditLog;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditExploreItem extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = ExploreItemResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make()
                ->after(fn ($record) => AdminAuditLog::record('deleted', $record, ['title' => $record->title])),
        ];
    }
}
