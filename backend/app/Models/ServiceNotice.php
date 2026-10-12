<?php

namespace App\Models;

use App\Jobs\SendServiceNoticeEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * An email the operator writes in Admin → Service notices and sends to users: "the AI was down,
 * it's fixed". A draft can be edited freely; once sent it is frozen, and the deliveries table
 * records who got it.
 */
#[Fillable(['subject', 'body', 'audience', 'audience_from', 'audience_until', 'status', 'recipient_count', 'sent_by_email', 'sent_at'])]
class ServiceNotice extends Model
{
    public const AUDIENCES = [
        'all' => 'All users',
        'ai_failed' => 'Users who had a failed AI call',
    ];

    protected $attributes = ['audience' => 'all', 'status' => 'draft'];

    protected function casts(): array
    {
        return ['audience_from' => 'datetime', 'audience_until' => 'datetime', 'sent_at' => 'datetime'];
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(ServiceNoticeDelivery::class);
    }

    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    /**
     * Who this notice goes to: real users with an email address, narrowed by the audience.
     * Demo accounts never get one.
     *
     * @return Builder<User>
     */
    public function recipients(): Builder
    {
        $users = User::query()->where('is_demo', false)->whereNotNull('email');

        if ($this->audience === 'ai_failed') {
            $users->whereIn('id', ApiUsageLog::query()->where('ok', false)->whereNotNull('user_id')
                ->when($this->audience_from, fn ($q, $from) => $q->where('created_at', '>=', $from))
                ->when($this->audience_until, fn ($q, $until) => $q->where('created_at', '<=', $until))
                ->select('user_id'));
        }

        return $users;
    }

    /**
     * Freeze the notice and queue one email per recipient. Returns how many were queued.
     * Safe to call once only: a notice that is no longer a draft queues nothing.
     */
    public function send(?string $sentByEmail = null): int
    {
        $queued = DB::transaction(function () use ($sentByEmail) {
            $notice = self::lockForUpdate()->find($this->id);
            if (! $notice || ! $notice->isDraft()) {
                return null;
            }

            $recipients = $this->recipients()->orderBy('id')->get(['id', 'email']);
            $now = now();
            foreach ($recipients->chunk(500) as $chunk) {
                ServiceNoticeDelivery::insertOrIgnore($chunk->map(fn (User $user) => [
                    'service_notice_id' => $this->id, 'user_id' => $user->id, 'email' => $user->email,
                    'status' => 'queued', 'created_at' => $now, 'updated_at' => $now,
                ])->all());
            }

            $count = $this->deliveries()->count();
            $this->forceFill([
                'status' => $count > 0 ? 'sending' : 'sent',
                'recipient_count' => $count,
                'sent_by_email' => $sentByEmail,
                'sent_at' => $now,
            ])->save();

            return $count;
        });

        if ($queued === null) {
            return 0;
        }

        $this->dispatchQueued();

        return $queued;
    }

    /** How long a delivery may sit waiting before it counts as lost by the queue. */
    private const STALLED_AFTER_MINUTES = 30;

    /** Whether anything needs another try: a failed delivery, or one the queue seems to have lost. */
    public function hasUnsent(): bool
    {
        return $this->deliveries()->where('status', 'failed')->exists()
            || $this->deliveries()->where('status', 'queued')->where('updated_at', '<', now()->subMinutes(self::STALLED_AFTER_MINUTES))->exists();
    }

    /**
     * Queue every delivery that has not gone out again: the failed ones, and any still waiting
     * (the job checks the status first, so queueing one twice still sends it once). Returns how many.
     */
    public function retryUnsent(): int
    {
        $this->deliveries()->where('status', 'failed')->update(['status' => 'queued', 'error' => null, 'updated_at' => now()]);
        $waiting = $this->deliveries()->where('status', 'queued')->count();

        if ($waiting > 0) {
            $this->update(['status' => 'sending']);
            $this->deliveries()->where('status', 'queued')->update(['updated_at' => now()]);
            $this->dispatchQueued();
        }

        return $waiting;
    }

    /** Mark the notice sent once nothing is left waiting. */
    public function refreshStatus(): void
    {
        if ($this->status === 'sending' && ! $this->deliveries()->where('status', 'queued')->exists()) {
            $this->update(['status' => 'sent']);
        }
    }

    /** @return array{sent: int, failed: int, queued: int} */
    public function progress(): array
    {
        $counts = $this->deliveries()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return ['sent' => (int) ($counts['sent'] ?? 0), 'failed' => (int) ($counts['failed'] ?? 0), 'queued' => (int) ($counts['queued'] ?? 0)];
    }

    private function dispatchQueued(): void
    {
        // Two a second: the mail provider's rate limit. (A sync queue ignores the delay.)
        $this->deliveries()->where('status', 'queued')->orderBy('id')->pluck('id')->values()
            ->each(fn (int $id, int $i) => SendServiceNoticeEmail::dispatch($id)->delay(now()->addSeconds(intdiv($i, 2))));
    }
}
