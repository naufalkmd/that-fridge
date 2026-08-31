<?php

namespace App\Jobs;

use App\Models\PushToken;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Fan a single notification out to all of one user's registered devices via Expo's push
 * service. Expo relays to APNs/FCM for us, so there are no Apple/Google keys in the app -
 * only an APNs key uploaded to EAS (see apps/mobile/RELEASE.md).
 */
class SendPushNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    /**
     * @param  array<string, string>  $data
     */
    public function __construct(
        public int $userId,
        public string $title,
        public string $body,
        public array $data = [],
    ) {}

    public function handle(): void
    {
        $tokens = PushToken::where('user_id', $this->userId)->pluck('token')->all();

        if (empty($tokens)) {
            return;
        }

        $messages = array_map(fn (string $token) => [
            'to' => $token,
            'title' => $this->title,
            'body' => $this->body,
            'data' => $this->data,
            'sound' => 'default',
            'channelId' => 'default',
        ], $tokens);

        $response = Http::acceptJson()
            ->asJson()
            ->post('https://exp.host/--/api/v2/push/send', $messages);

        if ($response->failed()) {
            Log::warning('Expo push send failed', ['status' => $response->status(), 'body' => $response->body()]);
            $response->throw();
        }

        // Prune tokens Expo says are dead so the next send is cheaper and we don't grow junk.
        foreach ($response->json('data', []) as $i => $receipt) {
            if (($receipt['status'] ?? null) === 'error'
                && ($receipt['details']['error'] ?? null) === 'DeviceNotRegistered'
                && isset($tokens[$i])) {
                PushToken::where('token', $tokens[$i])->delete();
            }
        }
    }
}
