<?php

namespace App\Jobs;

use App\Mail\ServiceNoticeMail;
use App\Models\ServiceNoticeDelivery;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/** Sends one recipient their copy of a service notice. Running it twice sends once. */
class SendServiceNoticeEmail implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(public int $deliveryId) {}

    public function handle(): void
    {
        $delivery = ServiceNoticeDelivery::with('notice')->find($this->deliveryId);
        if (! $delivery || ! $delivery->notice || $delivery->status !== 'queued') {
            return;
        }

        Mail::to($delivery->email)->send(new ServiceNoticeMail($delivery->notice->subject, $delivery->notice->body));

        $delivery->update(['status' => 'sent', 'sent_at' => now(), 'error' => null]);
        $delivery->notice->refreshStatus();
    }

    /** Out of retries: record why, so the admin page can show it and offer a retry. */
    public function failed(?\Throwable $e): void
    {
        $delivery = ServiceNoticeDelivery::with('notice')->find($this->deliveryId);
        if (! $delivery || $delivery->status === 'sent') {
            return;
        }

        $delivery->update(['status' => 'failed', 'error' => Str::limit($e?->getMessage() ?? 'Unknown error', 250)]);
        $delivery->notice?->refreshStatus();
    }
}
