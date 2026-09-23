<?php

namespace App\Filament\Resources;

use App\Filament\Resources\FridgeJoinRequestResource\Pages;
use App\Models\FridgeJoinRequest;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only, for "my invite didn't work" support questions. */
class FridgeJoinRequestResource extends Resource
{
    protected static ?string $model = FridgeJoinRequest::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-user-plus';

    protected static ?string $navigationGroup = 'Users';

    protected static ?string $navigationLabel = 'Join requests';

    protected static ?int $navigationSort = 4;

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('updated_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('status')->badge()
                    ->color(fn (string $state) => match ($state) {
                        'pending' => 'warning',
                        'accepted' => 'success',
                        default => 'gray',
                    }),
                Tables\Columns\TextColumn::make('fridge.name')->label('Fridge')->searchable()
                    ->url(fn (FridgeJoinRequest $record) => FridgeResource::getUrl('view', ['record' => $record->fridge_id])),
                Tables\Columns\TextColumn::make('requester.email')->label('Requester')->searchable(),
                Tables\Columns\TextColumn::make('initiated_by')->placeholder('-'),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
                Tables\Columns\TextColumn::make('updated_at')->label('Last change')->since()->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options(['pending' => 'Pending', 'accepted' => 'Accepted', 'declined' => 'Declined']),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListFridgeJoinRequests::route('/'),
        ];
    }
}
