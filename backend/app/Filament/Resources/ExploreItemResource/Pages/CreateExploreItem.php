<?php

namespace App\Filament\Resources\ExploreItemResource\Pages;

use App\Filament\Concerns\AuditsCreates;
use App\Filament\Resources\ExploreItemResource;
use Filament\Resources\Pages\CreateRecord;

class CreateExploreItem extends CreateRecord
{
    use AuditsCreates;

    protected static string $resource = ExploreItemResource::class;
}
