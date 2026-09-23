<?php

namespace App\Filament\Resources\BlockResource\Pages;

use App\Filament\Resources\BlockResource;
use App\Filament\Resources\BlockResource\Widgets\MostBlockedUsers;
use Filament\Resources\Pages\ListRecords;

class ListBlocks extends ListRecords
{
    protected static string $resource = BlockResource::class;

    protected function getHeaderWidgets(): array
    {
        return [MostBlockedUsers::class];
    }
}
