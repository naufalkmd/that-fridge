<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\FeedbackResource;
use App\Models\Feedback;
use Filament\Tables;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

class LatestFeedback extends TableWidget
{
    protected static ?int $sort = 8;

    protected int|string|array $columnSpan = 'full';

    public function table(Table $table): Table
    {
        return $table
            ->heading('Latest feedback')
            ->query(Feedback::query()->latest()->limit(5))
            ->paginated(false)
            ->columns([
                Tables\Columns\TextColumn::make('status')->badge()
                    ->color(fn (string $state) => $state === 'new' ? 'warning' : 'success'),
                Tables\Columns\TextColumn::make('email'),
                Tables\Columns\TextColumn::make('message')->limit(80)->wrap(),
                Tables\Columns\TextColumn::make('created_at')->since(),
            ])
            ->recordUrl(fn (Feedback $record) => FeedbackResource::getUrl('view', ['record' => $record]));
    }
}
