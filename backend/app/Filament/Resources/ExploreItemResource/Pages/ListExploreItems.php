<?php

namespace App\Filament\Resources\ExploreItemResource\Pages;

use App\Filament\Resources\ExploreItemResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListExploreItems extends ListRecords
{
    protected static string $resource = ExploreItemResource::class;

    protected function getHeaderActions(): array
    {
        return [Actions\CreateAction::make()];
    }
}
