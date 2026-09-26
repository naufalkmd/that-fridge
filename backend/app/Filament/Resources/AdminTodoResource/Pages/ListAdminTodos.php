<?php

namespace App\Filament\Resources\AdminTodoResource\Pages;

use App\Filament\Resources\AdminTodoResource;
use Filament\Actions;
use Filament\Resources\Pages\ListRecords;

class ListAdminTodos extends ListRecords
{
    protected static string $resource = AdminTodoResource::class;

    protected function getHeaderActions(): array
    {
        return [Actions\CreateAction::make()];
    }
}
