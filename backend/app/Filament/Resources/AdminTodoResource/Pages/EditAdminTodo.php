<?php

namespace App\Filament\Resources\AdminTodoResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\AdminTodoResource;
use App\Models\AdminAuditLog;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditAdminTodo extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = AdminTodoResource::class;

    protected function mutateFormDataBeforeSave(array $data): array
    {
        $data['done_at'] = ($data['status'] ?? 'open') === 'done' ? ($this->getRecord()->done_at ?? now()) : null;

        return $data;
    }

    protected function getHeaderActions(): array
    {
        return [Actions\DeleteAction::make()->after(fn ($record) => AdminAuditLog::record('deleted', $record, ['title' => $record->title]))];
    }
}
