<?php

namespace App\Filament\Resources\ProductResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\ProductResource;
use App\Models\AdminAuditLog;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditProduct extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = ProductResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\DeleteAction::make()
                ->after(fn ($record) => AdminAuditLog::record('deleted', $record, ['name' => $record->name])),
        ];
    }
}
