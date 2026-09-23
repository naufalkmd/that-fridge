<?php

namespace App\Filament\Resources\BlockResource\Widgets;

use App\Filament\Resources\UserResource;
use App\Models\User;
use Filament\Tables;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

/** Users blocked by the most people - where abuse tends to show up first. */
class MostBlockedUsers extends TableWidget
{
    protected int|string|array $columnSpan = 'full';

    public function table(Table $table): Table
    {
        return $table
            ->heading('Most blocked users')
            ->query(User::query()->whereHas('blockedBy')->withCount('blockedBy')->orderByDesc('blocked_by_count')->limit(10))
            ->paginated(false)
            ->columns([
                Tables\Columns\TextColumn::make('email'),
                Tables\Columns\TextColumn::make('username')->placeholder('-'),
                Tables\Columns\TextColumn::make('blocked_by_count')->label('Blocked by')->numeric(),
            ])
            ->recordUrl(fn (User $record) => UserResource::getUrl('view', ['record' => $record]));
    }
}
