<?php

namespace App\Filament\Resources;

use App\Filament\Resources\AdminAuditLogResource\Pages;
use App\Models\AdminAuditLog;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/** Read-only trail of admin actions. Nothing in the panel can edit or delete it. */
class AdminAuditLogResource extends Resource
{
    protected static ?string $model = AdminAuditLog::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-clipboard-document-list';

    protected static ?string $navigationGroup = 'System';

    protected static ?string $navigationLabel = 'Admin activity';

    protected static ?int $navigationSort = 1;

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('created_at')->label('When')->dateTime()->sortable(),
                Tables\Columns\TextColumn::make('admin_email')->label('Admin')->searchable(),
                Tables\Columns\TextColumn::make('action')->badge()->searchable(),
                Tables\Columns\TextColumn::make('subject')
                    ->state(fn (AdminAuditLog $record) => $record->subject_type ? "{$record->subject_type} #{$record->subject_id}" : '-'),
                Tables\Columns\TextColumn::make('changes')
                    ->state(fn (AdminAuditLog $record) => $record->changes ? json_encode($record->changes, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '-')
                    ->limit(120)
                    ->tooltip(fn (AdminAuditLog $record) => $record->changes ? json_encode($record->changes, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : null)
                    ->wrap(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('action')
                    ->options(fn () => AdminAuditLog::distinct()->orderBy('action')->pluck('action', 'action')->all()),
                Tables\Filters\SelectFilter::make('subject_type')
                    ->label('Subject')
                    ->options(fn () => AdminAuditLog::whereNotNull('subject_type')->distinct()->orderBy('subject_type')->pluck('subject_type', 'subject_type')->all()),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListAdminAuditLogs::route('/'),
        ];
    }
}
