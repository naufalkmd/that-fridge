<?php

namespace App\Filament\Resources\FeedbackResource\Pages;

use App\Filament\Resources\FeedbackResource;
use App\Models\Feedback;
use Filament\Actions;
use Filament\Resources\Pages\ViewRecord;

class ViewFeedback extends ViewRecord
{
    protected static string $resource = FeedbackResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('reply')
                ->label('Reply by email')
                ->icon('heroicon-o-envelope')
                ->url(fn (Feedback $record) => 'mailto:'.$record->email.'?subject='.rawurlencode('Re: your ThatFridge feedback')),
            FeedbackResource::toggleStatusAction(Actions\Action::class),
            Actions\EditAction::make()->label('Edit note'),
        ];
    }
}
