<?php

namespace App\Filament\Resources\FeedbackResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\FeedbackResource;
use Filament\Resources\Pages\EditRecord;

class EditFeedback extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = FeedbackResource::class;
}
