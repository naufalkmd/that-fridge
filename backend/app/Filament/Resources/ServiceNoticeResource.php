<?php

namespace App\Filament\Resources;

use App\Filament\Resources\ServiceNoticeResource\Pages;
use App\Models\ServiceNotice;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/**
 * Emails from the operator to users: "the AI was down, it's fixed". Write a draft, preview it,
 * check who gets it, send a test, then send. A sent notice is frozen and shows who received it.
 */
class ServiceNoticeResource extends Resource
{
    protected static ?string $model = ServiceNotice::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-megaphone';

    protected static ?string $navigationGroup = 'Users';

    protected static ?string $navigationLabel = 'Service notices';

    protected static ?string $modelLabel = 'service notice';

    /** Whether the signed-in admin may send (config app.notice_sender_emails; empty means every admin). */
    public static function canSend(): bool
    {
        $allowed = config('app.notice_sender_emails');

        return $allowed === [] || in_array(strtolower((string) auth()->user()?->email), $allowed, true);
    }

    public static function form(Form $form): Form
    {
        return $form
            ->disabled(fn (?ServiceNotice $record) => $record !== null && ! $record->isDraft())
            ->schema([
                Forms\Components\Placeholder::make('progress')->label('Delivery')->columnSpanFull()
                    ->visible(fn (?ServiceNotice $record) => $record !== null && ! $record->isDraft())
                    ->content(function (ServiceNotice $record) {
                        $progress = $record->progress();

                        return "Sent {$progress['sent']} of {$record->recipient_count}"
                            .($progress['queued'] > 0 ? " · {$progress['queued']} waiting" : '')
                            .($progress['failed'] > 0 ? " · {$progress['failed']} failed" : '')
                            .' · started '.$record->sent_at?->diffForHumans().' by '.$record->sent_by_email;
                    }),
                Forms\Components\TextInput::make('subject')->required()->maxLength(150)->columnSpanFull(),
                Forms\Components\Textarea::make('body')->label('Message')->required()->rows(14)->columnSpanFull()
                    ->helperText('Plain text. Leave a blank line between paragraphs. It is sent from support@thatfridge.com, so replies reach you.'),
                Forms\Components\Select::make('audience')->options(ServiceNotice::AUDIENCES)->default('all')->required()->live()
                    ->helperText('Demo accounts are never included.'),
                Forms\Components\DateTimePicker::make('audience_from')->label('Failed calls from')
                    ->visible(fn (Forms\Get $get) => $get('audience') === 'ai_failed'),
                Forms\Components\DateTimePicker::make('audience_until')->label('Failed calls until')
                    ->visible(fn (Forms\Get $get) => $get('audience') === 'ai_failed')
                    ->helperText('Leave both empty to include every user who has ever had a failed AI call.'),
            ])->columns(3);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('id', 'desc')
            ->modifyQueryUsing(fn ($query) => $query->withCount(['deliveries as failed_count' => fn ($q) => $q->where('status', 'failed')]))
            ->columns([
                Tables\Columns\TextColumn::make('subject')->searchable()->wrap()->weight('medium'),
                Tables\Columns\TextColumn::make('audience')->badge()->color('gray')->formatStateUsing(fn ($state) => ServiceNotice::AUDIENCES[$state] ?? $state),
                Tables\Columns\TextColumn::make('status')->badge()->formatStateUsing(fn ($state) => ucfirst($state))
                    ->color(fn ($state) => match ($state) {
                        'sent' => 'success', 'sending' => 'warning', default => 'gray',
                    }),
                Tables\Columns\TextColumn::make('recipient_count')->label('Recipients')->numeric()->placeholder('-')
                    ->description(fn (ServiceNotice $record) => $record->failed_count > 0 ? "{$record->failed_count} failed" : null),
                Tables\Columns\TextColumn::make('sent_at')->label('Sent')->dateTime()->placeholder('Not sent')->sortable(),
            ])
            ->actions([Tables\Actions\EditAction::make()->label('Open')]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListServiceNotices::route('/'),
            'create' => Pages\CreateServiceNotice::route('/create'),
            'edit' => Pages\EditServiceNotice::route('/{record}/edit'),
        ];
    }
}
