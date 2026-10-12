<?php

namespace App\Filament\Resources\ServiceNoticeResource\Pages;

use App\Filament\Resources\ServiceNoticeResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListServiceNotices extends ListRecords
{
    protected static string $resource = ServiceNoticeResource::class;

    protected function getHeaderActions(): array
    {
        return [Actions\CreateAction::make()->label('Write a notice')];
    }
}
