<?php

namespace App\Filament\Resources;

use App\Filament\Resources\FeedbackResource\Pages;
use App\Models\AdminAuditLog;
use App\Models\Feedback;
use App\Support\AdminCacheKeys;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Infolists;
use Filament\Infolists\Infolist;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Cache;

/** The in-app "Send feedback" inbox. Messages are read-only; admins triage status + a note. */
class FeedbackResource extends Resource
{
    protected static ?string $model = Feedback::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-chat-bubble-left-ellipsis';

    protected static ?string $navigationGroup = 'Users';

    protected static ?string $pluralModelLabel = 'feedback';

    protected static ?int $navigationSort = 2;

    public static function getNavigationBadge(): ?string
    {
        // Cached; FeedbackObserver clears it on every feedback write.
        $new = Cache::remember(AdminCacheKeys::FEEDBACK_BADGE, AdminCacheKeys::BADGE_TTL, fn () => Feedback::where('status', 'new')->count());

        return $new > 0 ? (string) $new : null;
    }

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\Select::make('status')
                    ->options(['new' => 'New', 'resolved' => 'Resolved'])
                    ->required(),
                Forms\Components\Textarea::make('admin_note')
                    ->label('Internal note')
                    ->helperText('Only visible here, never sent to the user.')
                    ->rows(4)
                    ->columnSpanFull(),
            ]);
    }

    public static function infolist(Infolist $infolist): Infolist
    {
        return $infolist
            ->schema([
                Infolists\Components\Section::make()
                    ->columns(2)
                    ->schema([
                        Infolists\Components\TextEntry::make('email')->label('Reply to')->copyable(),
                        Infolists\Components\TextEntry::make('user.email')
                            ->label('Account')
                            ->placeholder('Account deleted')
                            ->url(fn (Feedback $record) => $record->user_id ? UserResource::getUrl('view', ['record' => $record->user_id]) : null),
                        Infolists\Components\TextEntry::make('status')->badge()
                            ->color(fn (string $state) => $state === 'new' ? 'warning' : 'success'),
                        Infolists\Components\TextEntry::make('created_at')->dateTime(),
                        Infolists\Components\TextEntry::make('message')->columnSpanFull()->prose(),
                        Infolists\Components\TextEntry::make('admin_note')->label('Internal note')->placeholder('-')->columnSpanFull(),
                    ]),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('status')->badge()
                    ->color(fn (string $state) => $state === 'new' ? 'warning' : 'success'),
                Tables\Columns\TextColumn::make('email')->searchable(),
                Tables\Columns\TextColumn::make('message')->limit(80)->wrap()->searchable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')
                    ->options(['new' => 'New', 'resolved' => 'Resolved'])
                    ->default('new'),
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
                self::toggleStatusAction(Tables\Actions\Action::class),
            ]);
    }

    /**
     * Mark resolved / reopen. Built from the given Action class so the same button works in
     * the table (Tables\Actions\Action) and on the view page header (Filament\Actions\Action).
     *
     * @param  class-string  $actionClass
     */
    public static function toggleStatusAction(string $actionClass)
    {
        return $actionClass::make('toggleStatus')
            ->label(fn (Feedback $record) => $record->status === 'new' ? 'Mark resolved' : 'Reopen')
            ->icon(fn (Feedback $record) => $record->status === 'new' ? 'heroicon-o-check' : 'heroicon-o-arrow-uturn-left')
            ->color(fn (Feedback $record) => $record->status === 'new' ? 'success' : 'gray')
            ->action(function (Feedback $record) {
                $before = $record->status;
                $record->update(['status' => $before === 'new' ? 'resolved' : 'new']);
                AdminAuditLog::record('updated', $record, ['before' => ['status' => $before], 'after' => ['status' => $record->status]]);
            });
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListFeedback::route('/'),
            'view' => Pages\ViewFeedback::route('/{record}'),
            'edit' => Pages\EditFeedback::route('/{record}/edit'),
        ];
    }
}
