<?php

namespace App\Filament\Resources\UserResource\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only - change balances with the "Adjust credits" button, which writes the ledger row. */
class CreditLedgerRelationManager extends RelationManager
{
    protected static string $relationship = 'aiCreditLedger';

    protected static ?string $title = 'Credit history';

    public function isReadOnly(): bool
    {
        return true;
    }

    public function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('created_at')->dateTime(),
                Tables\Columns\TextColumn::make('delta')->numeric()
                    ->color(fn (int $state) => $state < 0 ? 'danger' : 'success'),
                Tables\Columns\TextColumn::make('balance_after')->numeric(),
                Tables\Columns\TextColumn::make('reason')->searchable(),
                Tables\Columns\TextColumn::make('ref')->placeholder('-')->toggleable(isToggledHiddenByDefault: true),
            ]);
    }
}
