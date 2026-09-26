<?php

namespace App\Filament\Resources;

use App\Filament\Resources\UserResource\Pages;
use App\Filament\Resources\UserResource\RelationManagers;
use App\Models\User;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Infolists;
use Filament\Infolists\Infolist;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/**
 * Users sign up through the app, so there's no create page. Subscription Pro is shown but never
 * editable - RevenueCat webhooks own it. The two admin flags (demo, admin-granted Pro) are set on
 * the edit page and saved past mass-assignment protection (see EditUser). AI credits change only through the view page's
 * "Adjust credits" button, which goes through CreditService so the ledger stays in step.
 * Account deletion (view page) mirrors DELETE /api/me and is audit-logged.
 */
class UserResource extends Resource
{
    protected static ?string $model = User::class;

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-users';

    protected static ?string $navigationGroup = 'Users';

    protected static ?int $navigationSort = 1;

    public static function form(Form $form): Form
    {
        return $form
            ->schema([
                Forms\Components\TextInput::make('name')
                    ->required()
                    ->maxLength(255),
                Forms\Components\TextInput::make('username')
                    ->maxLength(255)
                    ->unique(ignoreRecord: true),
                Forms\Components\TextInput::make('email')
                    ->email()
                    ->required()
                    ->maxLength(255)
                    ->unique(ignoreRecord: true),
                Forms\Components\Toggle::make('is_demo')
                    ->label('Demo / App Review account')
                    ->helperText('Isolates the account: it can only find and be found by other demo accounts, its name and username are locked, and it is left out of stats and monthly credits. Does not grant Pro.'),
                Forms\Components\Toggle::make('pro_granted')
                    ->label('Pro (granted by admin)')
                    ->helperText('Gives a real user Pro without a subscription. Separate from a paid RevenueCat subscription, which stays in force either way.'),
            ]);
    }

    public static function infolist(Infolist $infolist): Infolist
    {
        return $infolist
            ->schema([
                Infolists\Components\Section::make('Account')
                    ->columns(2)
                    ->schema([
                        Infolists\Components\TextEntry::make('name'),
                        Infolists\Components\TextEntry::make('username')->placeholder('-'),
                        Infolists\Components\TextEntry::make('email')->copyable(),
                        Infolists\Components\TextEntry::make('oauth_provider')->placeholder('password'),
                        Infolists\Components\TextEntry::make('created_at')->dateTime(),
                        Infolists\Components\TextEntry::make('email_verified_at')->dateTime()->placeholder('-'),
                    ]),
                Infolists\Components\Section::make('Subscription')
                    ->columns(2)
                    ->schema([
                        Infolists\Components\IconEntry::make('pro')
                            ->label('Pro (effective)')
                            ->state(fn (User $record): bool => $record->isPro())
                            ->boolean(),
                        Infolists\Components\IconEntry::make('pro_granted')->label('Pro granted by admin')->boolean(),
                        Infolists\Components\IconEntry::make('is_demo')->label('Demo account')->boolean(),
                        Infolists\Components\TextEntry::make('pro_expires_at')->dateTime()->placeholder('-'),
                        Infolists\Components\TextEntry::make('pro_trial_until')->dateTime()->placeholder('-'),
                        Infolists\Components\TextEntry::make('ai_credits')->numeric(),
                    ]),
                Infolists\Components\Section::make('Activity')
                    ->columns(3)
                    ->schema([
                        Infolists\Components\TextEntry::make('current_streak')->label('Daily streak')->numeric(),
                        Infolists\Components\TextEntry::make('last_active_on')->label('Last opened the app')->date()->placeholder('Never'),
                        // Counts only - chat content and AI memory are private and never shown here.
                        Infolists\Components\TextEntry::make('chat_messages')
                            ->state(fn (User $record): int => $record->chatHistory()->count())
                            ->numeric(),
                        Infolists\Components\TextEntry::make('goal')
                            ->state(fn (User $record): ?string => $record->goal
                                ? "{$record->goal->metric_type}: {$record->goal->target_value} / {$record->goal->period}".($record->goal->is_active ? '' : ' (inactive)')
                                : null)
                            ->placeholder('No goal set'),
                        Infolists\Components\IconEntry::make('has_ai_memory')
                            ->label('Has AI memory')
                            ->state(fn (User $record): bool => $record->userMemory()->exists())
                            ->boolean(),
                    ]),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('id')->sortable(),
                Tables\Columns\TextColumn::make('name')->searchable(),
                Tables\Columns\TextColumn::make('username')->searchable()->placeholder('-'),
                Tables\Columns\TextColumn::make('email')->searchable(),
                Tables\Columns\TextColumn::make('oauth_provider')->placeholder('password')->toggleable(),
                Tables\Columns\TextColumn::make('pro_expires_at')->label('Pro until')->dateTime()->sortable()->placeholder('-'),
                Tables\Columns\IconColumn::make('pro_granted')->label('Pro (admin)')->boolean()->toggleable(),
                Tables\Columns\IconColumn::make('is_demo')->boolean()->toggleable(),
                Tables\Columns\TextColumn::make('ai_credits')->numeric()->sortable()->toggleable(),
                Tables\Columns\TextColumn::make('fridges_count')->counts('fridges')->label('Fridges')->sortable(),
                Tables\Columns\TextColumn::make('current_streak')->label('Streak')->numeric()->sortable()->toggleable(),
                Tables\Columns\TextColumn::make('last_active_on')->label('Last active')->date()->sortable()->placeholder('-')->toggleable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->filters([
                Tables\Filters\Filter::make('pro')
                    ->query(fn ($query) => $query->where('pro_expires_at', '>', now())),
                Tables\Filters\TernaryFilter::make('pro_granted')->label('Pro granted by admin'),
                Tables\Filters\TernaryFilter::make('is_demo'),
                Tables\Filters\SelectFilter::make('sign_in')
                    ->label('Sign-in method')
                    ->options(['apple' => 'Apple', 'google' => 'Google', 'password' => 'Email + password'])
                    ->query(fn ($query, array $data) => match ($data['value'] ?? null) {
                        'password' => $query->whereNull('oauth_provider'),
                        null, '' => $query,
                        default => $query->where('oauth_provider', $data['value']),
                    }),
                Tables\Filters\Filter::make('inactive')
                    ->label('Inactive 30+ days')
                    ->query(fn ($query) => $query->where(fn ($q) => $q
                        ->whereNull('last_active_on')
                        ->orWhere('last_active_on', '<', now()->subDays(30)->toDateString()))),
                Tables\Filters\Filter::make('signed_up')
                    ->form([
                        Forms\Components\DatePicker::make('from')->label('Signed up from'),
                        Forms\Components\DatePicker::make('until')->label('Signed up until'),
                    ])
                    ->query(fn ($query, array $data) => $query
                        ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
                        ->when($data['until'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))),
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
                Tables\Actions\EditAction::make(),
            ]);
    }

    public static function getRelations(): array
    {
        return [
            RelationManagers\CreditLedgerRelationManager::class,
            RelationManagers\FridgesRelationManager::class,
            RelationManagers\BadgesRelationManager::class,
            RelationManagers\BlockingRelationManager::class,
            RelationManagers\BlockedByRelationManager::class,
            RelationManagers\PushTokensRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListUsers::route('/'),
            'view' => Pages\ViewUser::route('/{record}'),
            'edit' => Pages\EditUser::route('/{record}/edit'),
        ];
    }
}
