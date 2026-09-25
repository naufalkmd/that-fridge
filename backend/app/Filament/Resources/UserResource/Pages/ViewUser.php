<?php

namespace App\Filament\Resources\UserResource\Pages;

use App\Exceptions\InsufficientCreditsException;
use App\Filament\Resources\UserResource;
use App\Models\AdminAuditLog;
use App\Models\AlgoFeedbackEvent;
use App\Models\User;
use App\Services\CreditService;
use App\Support\AdminCacheKeys;
use Filament\Actions;
use Filament\Facades\Filament;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;
use Illuminate\Support\Facades\Cache;

class ViewUser extends ViewRecord
{
    protected static string $resource = UserResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\EditAction::make(),
            Actions\Action::make('improvementFeedback')
                ->label('Improvement feedback')
                ->icon('heroicon-o-chart-bar-square')
                ->mountUsing(fn (User $record) => AdminAuditLog::record('viewed_user_improvement_feedback', $record))
                ->modalHeading('Improvement feedback')
                ->modalDescription('Raw structured events for this account from the last 180 days.')
                ->modalContent(fn (User $record) => view('filament.user-improvement-feedback', [
                    'events' => AlgoFeedbackEvent::where('user_id', $record->id)
                        ->where('occurred_at', '>=', now()->subDays(180))
                        ->latest('occurred_at')->limit(100)->get(),
                ]))
                ->modalSubmitAction(false)
                ->modalCancelActionLabel('Close'),
            $this->adjustCreditsAction(),
            Actions\ActionGroup::make([
                $this->signOutEverywhereAction(),
                $this->deleteAccountAction(),
            ])->icon('heroicon-o-ellipsis-vertical'),
        ];
    }

    /**
     * Goes through CreditService (row lock + ledger row + RevenueCat mirror) - never a raw
     * balance edit. The ledger reason carries the admin's email; the free-text note goes to
     * the audit log.
     */
    private function adjustCreditsAction(): Actions\Action
    {
        return Actions\Action::make('adjustCredits')
            ->label('Adjust credits')
            ->icon('heroicon-o-sparkles')
            ->modalDescription(fn (User $record) => "Current balance: {$record->ai_credits}. Use a negative number to remove credits.")
            ->form([
                Forms\Components\TextInput::make('amount')
                    ->integer()
                    ->required()
                    ->minValue(-10000)
                    ->maxValue(10000)
                    ->notIn(['0'])
                    ->helperText('e.g. 50 to add, -20 to remove'),
                Forms\Components\TextInput::make('note')
                    ->label('Why')
                    ->required()
                    ->maxLength(255),
            ])
            ->requiresConfirmation()
            ->action(function (User $record, array $data, CreditService $credits, Actions\Action $action) {
                $amount = (int) $data['amount'];
                $reason = 'admin_adjust:'.auth()->user()->email;
                $before = (int) $record->ai_credits;

                try {
                    $amount > 0
                        ? $credits->grant($record, $amount, $reason)
                        : $credits->spend($record, -$amount, $reason);
                } catch (InsufficientCreditsException $e) {
                    Notification::make()->danger()
                        ->title("Can't remove {$e->needed} credits - balance is only {$e->balance}.")
                        ->send();
                    $action->halt();
                }

                AdminAuditLog::record('adjusted_credits', $record, [
                    'amount' => $amount,
                    'before' => $before,
                    'after' => (int) $record->ai_credits,
                    'note' => $data['note'],
                ]);

                $this->refreshFormData(['ai_credits']);
                Notification::make()->success()->title("Balance is now {$record->ai_credits}.")->send();
            });
    }

    private function signOutEverywhereAction(): Actions\Action
    {
        return Actions\Action::make('signOutEverywhere')
            ->label('Sign out everywhere')
            ->icon('heroicon-o-arrow-right-start-on-rectangle')
            ->color('warning')
            ->requiresConfirmation()
            ->modalDescription('Revokes every app login token for this user. They will need to sign in again on all devices.')
            ->action(function (User $record) {
                $revoked = $record->tokens()->delete();
                AdminAuditLog::record('signed_out_everywhere', $record, ['tokens_revoked' => $revoked]);
                Notification::make()->success()->title("Revoked {$revoked} login token(s).")->send();
            });
    }

    /**
     * Same as the app's own DELETE /api/me (AuthController::destroy): revoke tokens, delete
     * the row, and let the FK cascades remove their data. Admin accounts can't be deleted
     * here, so nobody can lock themselves or a co-admin out by accident.
     */
    private function deleteAccountAction(): Actions\Action
    {
        return Actions\Action::make('deleteAccount')
            ->label('Delete account')
            ->icon('heroicon-o-trash')
            ->color('danger')
            ->hidden(fn (User $record) => $record->canAccessPanel(Filament::getCurrentPanel()))
            ->modalHeading('Permanently delete this account?')
            ->modalDescription('Deletes the user and all their fridges, items, recipes and history. This cannot be undone.')
            ->form([
                Forms\Components\TextInput::make('confirm_email')
                    ->label(fn (User $record) => "Type {$record->email} to confirm")
                    ->required()
                    ->in(fn (User $record) => [$record->email]),
            ])
            ->action(function (User $record) {
                AlgoFeedbackEvent::where('user_id', $record->id)->delete();
                Cache::forget(AdminCacheKeys::ALGORITHM_GAPS);
                $record->tokens()->delete();
                $record->delete();
                AdminAuditLog::record('deleted_account', $record, ['email' => $record->email, 'name' => $record->name]);

                Notification::make()->success()->title("Deleted {$record->email}.")->send();
                $this->redirect(UserResource::getUrl('index'));
            });
    }
}
