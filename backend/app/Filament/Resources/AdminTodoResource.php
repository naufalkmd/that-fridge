<?php

namespace App\Filament\Resources;

use App\Filament\Resources\AdminTodoResource\Pages;
use App\Models\AdminAuditLog;
use App\Models\AdminTodo;
use Filament\Forms;
use Filament\Forms\Form;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Str;

/** The operator's to-do list: launch blockers first, tick things off here. The top open items also show on the dashboard. */
class AdminTodoResource extends Resource
{
    protected static ?string $model = AdminTodo::class;

    protected static bool $shouldSkipAuthorization = true;

    protected static ?string $navigationIcon = 'heroicon-o-clipboard-document-check';

    protected static ?string $navigationGroup = 'Insights';

    protected static ?string $navigationLabel = 'To-do';

    protected static ?string $modelLabel = 'to-do';

    protected static ?int $navigationSort = 0;

    public static function getNavigationBadge(): ?string
    {
        $blockers = AdminTodo::open()->where('priority', 'blocker')->count();

        return $blockers > 0 ? (string) $blockers : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'danger';
    }

    public static function form(Form $form): Form
    {
        return $form->schema([
            Forms\Components\TextInput::make('title')->required()->maxLength(160)->columnSpanFull(),
            Forms\Components\Textarea::make('details')->rows(4)->columnSpanFull()->helperText('What needs doing, and anything you will need to remember.'),
            Forms\Components\Select::make('category')->options(AdminTodo::CATEGORIES)->required(),
            Forms\Components\Select::make('priority')->options(AdminTodo::PRIORITIES)->default('normal')->required()
                ->helperText('Launch blockers show at the top of the dashboard.'),
            Forms\Components\DatePicker::make('due_on')->label('Due'),
            Forms\Components\TextInput::make('link')->url()->maxLength(255)->helperText('Where to do it, if there is a page for it.'),
            Forms\Components\Select::make('status')->options(['open' => 'Open', 'done' => 'Done'])->default('open')->required(),
        ])->columns(2);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn ($query) => $query->byUrgency())
            ->columns([
                Tables\Columns\IconColumn::make('status')->label('')->icon(fn ($state) => $state === 'done' ? 'heroicon-o-check-circle' : 'heroicon-o-circle-stack')
                    ->color(fn ($state) => $state === 'done' ? 'success' : 'gray')->size('lg'),
                Tables\Columns\TextColumn::make('priority')->badge()
                    ->formatStateUsing(fn ($state) => AdminTodo::PRIORITIES[$state] ?? $state)
                    ->color(fn ($state) => match ($state) {
                        'blocker' => 'danger', 'high' => 'warning', 'normal' => 'info', default => 'gray',
                    }),
                Tables\Columns\TextColumn::make('title')->searchable()->wrap()->weight('medium')
                    ->description(fn (AdminTodo $record) => $record->details ? Str::limit($record->details, 140) : null)
                    ->extraAttributes(fn (AdminTodo $record) => $record->status === 'done' ? ['style' => 'text-decoration: line-through; opacity: .6'] : []),
                Tables\Columns\TextColumn::make('category')->badge()->color('gray')->formatStateUsing(fn ($state) => AdminTodo::CATEGORIES[$state] ?? $state),
                Tables\Columns\TextColumn::make('due_on')->label('Due')->date('M j')->placeholder('-')
                    ->color(fn (AdminTodo $record) => $record->status === 'open' && $record->due_on?->isPast() ? 'danger' : null),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')->options(['open' => 'Open', 'done' => 'Done'])->default('open'),
                Tables\Filters\SelectFilter::make('category')->options(AdminTodo::CATEGORIES),
                Tables\Filters\SelectFilter::make('priority')->options(AdminTodo::PRIORITIES),
            ])
            ->actions([
                Tables\Actions\Action::make('toggle')
                    ->label(fn (AdminTodo $record) => $record->status === 'done' ? 'Reopen' : 'Mark done')
                    ->icon(fn (AdminTodo $record) => $record->status === 'done' ? 'heroicon-o-arrow-uturn-left' : 'heroicon-o-check')
                    ->color(fn (AdminTodo $record) => $record->status === 'done' ? 'gray' : 'success')
                    ->action(function (AdminTodo $record) {
                        $done = $record->status !== 'done';
                        $record->update(['status' => $done ? 'done' : 'open', 'done_at' => $done ? now() : null]);
                        AdminAuditLog::record('updated', $record, ['after' => ['status' => $record->status]]);
                    }),
                Tables\Actions\Action::make('open')->label('Open link')->icon('heroicon-o-arrow-top-right-on-square')->color('gray')
                    ->url(fn (AdminTodo $record) => $record->link, shouldOpenInNewTab: true)->visible(fn (AdminTodo $record) => (bool) $record->link),
                Tables\Actions\EditAction::make(),
            ])
            ->bulkActions([Tables\Actions\BulkActionGroup::make([Tables\Actions\DeleteBulkAction::make()])])
            ->paginated(false);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListAdminTodos::route('/'),
            'create' => Pages\CreateAdminTodo::route('/create'),
            'edit' => Pages\EditAdminTodo::route('/{record}/edit'),
        ];
    }
}
