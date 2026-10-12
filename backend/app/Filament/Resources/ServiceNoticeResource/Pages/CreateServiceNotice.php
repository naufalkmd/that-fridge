<?php

namespace App\Filament\Resources\ServiceNoticeResource\Pages;

use App\Filament\Concerns\AuditsCreates;
use App\Filament\Resources\ServiceNoticeResource;
use Filament\Resources\Pages\CreateRecord;

/** Saves a draft and opens it, where it can be previewed, tested and sent. */
class CreateServiceNotice extends CreateRecord
{
    use AuditsCreates;

    protected static string $resource = ServiceNoticeResource::class;

    protected function getRedirectUrl(): string
    {
        return ServiceNoticeResource::getUrl('edit', ['record' => $this->getRecord()]);
    }
}
