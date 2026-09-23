<?php

namespace App\Filament\Resources\ProductResource\Pages;

use App\Filament\Concerns\AuditsCreates;
use App\Filament\Resources\ProductResource;
use Filament\Resources\Pages\CreateRecord;

class CreateProduct extends CreateRecord
{
    use AuditsCreates;

    protected static string $resource = ProductResource::class;
}
