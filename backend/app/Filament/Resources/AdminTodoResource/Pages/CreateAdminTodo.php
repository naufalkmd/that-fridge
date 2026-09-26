<?php

namespace App\Filament\Resources\AdminTodoResource\Pages;

use App\Filament\Concerns\AuditsCreates;
use App\Filament\Resources\AdminTodoResource;
use Filament\Resources\Pages\CreateRecord;

class CreateAdminTodo extends CreateRecord
{
    use AuditsCreates;

    protected static string $resource = AdminTodoResource::class;
}
