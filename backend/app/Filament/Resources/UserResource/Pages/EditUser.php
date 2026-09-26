<?php

namespace App\Filament\Resources\UserResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\UserResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;

class EditUser extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = UserResource::class;

    /**
     * `is_demo` and `pro_granted` are deliberately not mass-assignable (a user request must
     * never set them), so a plain `update($data)` silently drops them - the reason these
     * toggles used to do nothing. Only this admin-panel save path writes them, explicitly.
     */
    protected function handleRecordUpdate(Model $record, array $data): Model
    {
        $flags = Arr::only($data, ['is_demo', 'pro_granted']);
        $record->update(Arr::except($data, array_keys($flags)));
        $record->forceFill($flags)->save();

        return $record;
    }

    protected function getHeaderActions(): array
    {
        return [
            Actions\ViewAction::make(),
        ];
    }
}
