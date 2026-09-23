<?php

namespace App\Filament\Resources;

use App\Filament\Resources\UserResource\Pages;
use App\Models\User;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Infolists;
use Filament\Infolists\Infolist;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

/**
 * Users sign up through the app, so there's no create page and no delete: account deletion
 * goes through the app's own flow, which also cleans up tokens and uploads. Pro status and
 * AI credits are shown but not editable here - they're owned by RevenueCat webhooks and the
 * credit ledger respectively, and hand-editing them would drift from those sources.
 */
class UserResource extends Resource
{
    protected static ?string $model = User::class;

    // App policies scope records to their owner/members for the mobile API; panel access is
    // already gated by User::canAccessPanel, so admins see every record here.
    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-users';

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
                    ->helperText('Demo accounts are always treated as Pro.'),
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
                            ->label('Pro')
                            ->state(fn (User $record): bool => $record->isPro())
                            ->boolean(),
                        Infolists\Components\IconEntry::make('is_demo')->boolean(),
                        Infolists\Components\TextEntry::make('pro_expires_at')->dateTime()->placeholder('-'),
                        Infolists\Components\TextEntry::make('pro_trial_until')->dateTime()->placeholder('-'),
                        Infolists\Components\TextEntry::make('ai_credits')->numeric(),
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
                Tables\Columns\IconColumn::make('is_demo')->boolean()->toggleable(),
                Tables\Columns\TextColumn::make('ai_credits')->numeric()->sortable()->toggleable(),
                Tables\Columns\TextColumn::make('fridges_count')->counts('fridges')->label('Fridges')->sortable(),
                Tables\Columns\TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->filters([
                Tables\Filters\Filter::make('pro')
                    ->query(fn ($query) => $query->where('pro_expires_at', '>', now())),
                Tables\Filters\TernaryFilter::make('is_demo'),
            ])
            ->actions([
                Tables\Actions\ViewAction::make(),
                Tables\Actions\EditAction::make(),
            ]);
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
