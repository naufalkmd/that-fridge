<?php

namespace App\Filament\Resources\ServiceNoticeResource\Pages;

use App\Filament\Concerns\AuditsEdits;
use App\Filament\Resources\ServiceNoticeResource;
use App\Mail\ServiceNoticeMail;
use App\Models\AdminAuditLog;
use App\Models\ServiceNotice;
use Filament\Actions;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Mail;

class EditServiceNotice extends EditRecord
{
    use AuditsEdits;

    protected static string $resource = ServiceNoticeResource::class;

    /** How many addresses the recipients list shows before it stops. */
    private const LIST_LIMIT = 1000;

    public function getTitle(): string
    {
        return $this->getRecord()->isDraft() ? 'Draft notice' : 'Sent notice';
    }

    protected function getFormActions(): array
    {
        return $this->getRecord()->isDraft() ? parent::getFormActions() : [];
    }

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('preview')->icon('heroicon-o-eye')->color('gray')
                ->mountUsing(fn () => $this->saveDraft())
                ->modalHeading('Preview')->modalWidth('3xl')
                ->modalSubmitAction(false)->modalCancelActionLabel('Close')
                ->modalContent(fn (ServiceNotice $record) => view('filament.service-notices.preview', [
                    'subject' => $record->subject,
                    'html' => (new ServiceNoticeMail($record->subject, $record->body))->render(),
                ])),

            Actions\Action::make('recipients')->icon('heroicon-o-users')->color('gray')
                ->label(fn (ServiceNotice $record) => $record->isDraft() ? 'Who gets it' : 'Who got it')
                ->mountUsing(fn () => $this->saveDraft())
                ->modalHeading(fn (ServiceNotice $record) => $record->isDraft() ? 'Who gets it' : 'Who got it')
                ->modalSubmitAction(false)->modalCancelActionLabel('Close')
                ->modalContent(fn (ServiceNotice $record) => view('filament.service-notices.recipients', $this->recipientList($record))),

            Actions\Action::make('sendTest')->label('Send test to me')->icon('heroicon-o-envelope')->color('gray')
                ->action(function (ServiceNotice $record) {
                    $this->saveDraft();
                    $me = auth()->user()->email;
                    Mail::to($me)->send(new ServiceNoticeMail($record->subject, $record->body));
                    AdminAuditLog::record('notice_test_sent', $record);
                    Notification::make()->success()->title("Test sent to {$me}")->send();
                }),

            Actions\Action::make('send')->label('Send to users')->icon('heroicon-o-paper-airplane')->color('danger')
                ->visible(fn (ServiceNotice $record) => $record->isDraft() && ServiceNoticeResource::canSend())
                ->mountUsing(function (?Form $form) {
                    $this->saveDraft();
                    $form?->fill();
                })
                ->modalHeading('Send this notice?')
                ->modalDescription(fn (ServiceNotice $record) => 'This emails '.$record->recipients()->count().' people from support@thatfridge.com. It cannot be undone, and a notice can only be sent once.')
                ->form(fn (ServiceNotice $record) => [
                    TextInput::make('confirm')->label('Type the number of recipients ('.$record->recipients()->count().') to confirm')->required(),
                ])
                ->modalSubmitActionLabel('Send')
                ->action(function (ServiceNotice $record, array $data) {
                    // Counted again here: the list can change between opening the dialog and confirming.
                    $count = $record->recipients()->count();
                    if ($count === 0 || trim((string) $data['confirm']) !== (string) $count) {
                        Notification::make()->danger()->title('Not sent')
                            ->body($count === 0 ? 'Nobody matches this audience.' : "That number doesn't match. This notice goes to {$count} people.")->send();

                        return;
                    }

                    $queued = $record->send(auth()->user()->email);
                    AdminAuditLog::record('notice_sent', $record, ['subject' => $record->subject, 'audience' => $record->audience, 'recipients' => $queued]);
                    Notification::make()->success()->title("Sending to {$queued} people")->body('They go out in the background, two a second.')->send();

                    $this->redirect(ServiceNoticeResource::getUrl('edit', ['record' => $record]));
                }),

            Actions\Action::make('retryUnsent')->label('Retry unsent')->icon('heroicon-o-arrow-path')->color('warning')
                ->visible(fn (ServiceNotice $record) => ! $record->isDraft() && ServiceNoticeResource::canSend() && $record->hasUnsent())
                ->requiresConfirmation()
                ->modalDescription('Tries again for everyone whose email failed or has been waiting more than half an hour. Nobody who already got it is emailed again.')
                ->action(function (ServiceNotice $record) {
                    $retried = $record->retryUnsent();
                    AdminAuditLog::record('notice_retried', $record, ['recipients' => $retried]);
                    Notification::make()->success()->title("Retrying {$retried}")->send();
                }),

            // Grey, not the usual red: it sits next to Send, and only one button here should look dangerous.
            Actions\DeleteAction::make()->label('Delete draft')->color('gray')
                ->visible(fn (ServiceNotice $record) => $record->isDraft())
                ->after(fn (ServiceNotice $record) => AdminAuditLog::record('deleted', $record, ['subject' => $record->subject])),
        ];
    }

    /** The buttons above act on what is on screen, so save any unsaved edits first. */
    private function saveDraft(): void
    {
        if ($this->getRecord()->isDraft()) {
            $this->save(shouldRedirect: false, shouldSendSavedNotification: false);
        }
    }

    /** @return array{total: int, shown: int, rows: list<array{email: string, status: ?string, error: ?string}>} */
    private function recipientList(ServiceNotice $record): array
    {
        if ($record->isDraft()) {
            $emails = $record->recipients()->orderBy('email')->limit(self::LIST_LIMIT)->pluck('email');

            return [
                'total' => $record->recipients()->count(),
                'shown' => $emails->count(),
                'rows' => $emails->map(fn ($email) => ['email' => $email, 'status' => null, 'error' => null])->all(),
            ];
        }

        // Failures first: they are what needs looking at.
        $deliveries = $record->deliveries()->orderByRaw("case status when 'failed' then 0 when 'queued' then 1 else 2 end")
            ->orderBy('email')->limit(self::LIST_LIMIT)->get(['email', 'status', 'error']);

        return [
            'total' => $record->deliveries()->count(),
            'shown' => $deliveries->count(),
            'rows' => $deliveries->map(fn ($d) => ['email' => $d->email, 'status' => $d->status, 'error' => $d->error])->all(),
        ];
    }
}
