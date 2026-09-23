<?php

namespace App\Filament\Resources\RecipeResource\Pages;

use App\Filament\Concerns\AuditsCreates;
use App\Filament\Resources\RecipeResource;
use Filament\Resources\Pages\CreateRecord;

class CreateRecipe extends CreateRecord
{
    use AuditsCreates;

    protected static string $resource = RecipeResource::class;
}
