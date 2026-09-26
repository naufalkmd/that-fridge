<?php

namespace App\Filament\Pages;

use App\Models\AdminAuditLog;
use App\Models\AiBalanceCheckpoint;
use App\Services\AiProviderBalance;
use Filament\Facades\Filament;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/**
 * Where the operator tells the dashboard what fal.ai says the balance is (fal.ai has no balance API for a normal key). The dashboard
 * then shows that figure minus the estimated spend logged since.
 */
class AiBalances extends Page implements HasForms
{
    use InteractsWithForms;

    protected static ?string $navigationIcon = 'heroicon-o-banknotes';

    protected static ?string $navigationGroup = 'Insights';

    protected static ?string $navigationLabel = 'AI balances';

    protected static ?string $title = 'AI balances';

    protected static string $view = 'filament.pages.ai-balances';

    /** @var array<string, mixed> */
    public array $data = [];

    public static function canAccess(): bool
    {
        $user = Filament::auth()->user();

        return $user !== null && $user->canAccessPanel(Filament::getCurrentPanel());
    }

    public function mount(): void
    {
        $this->form->fill(['fal' => app(AiProviderBalance::class)->fal()['balance'] ?? null]);
    }

    public function form(Form $form): Form
    {
        return $form->statePath('data')->schema([
            TextInput::make('fal')
                ->label('fal.ai balance now (USD)')
                ->helperText('Read it off fal.ai/dashboard/billing. The dashboard shows this minus the estimated fal.ai spend since you saved it.')
                ->numeric()->minValue(0)->maxValue(100000)->prefix('$')->required(),
        ]);
    }

    public function save(): void
    {
        $amount = round((float) $this->form->getState()['fal'], 2);
        $checkpoint = AiBalanceCheckpoint::create(['provider' => 'fal', 'balance_usd' => $amount, 'recorded_at' => now()]);
        AdminAuditLog::record('created', $checkpoint, ['after' => ['provider' => 'fal', 'balance_usd' => $amount]]);

        Notification::make()->title('fal.ai balance saved')->success()->send();
    }

    /** @return list<AiBalanceCheckpoint> */
    public function history(): array
    {
        return AiBalanceCheckpoint::where('provider', 'fal')->orderByDesc('recorded_at')->orderByDesc('id')->limit(10)->get()->all();
    }
}
