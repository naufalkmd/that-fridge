<?php

namespace App\Console\Commands;

use App\Mail\AiOutageNoticeMail;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;

/**
 * One-off: email every real user the October 2026 AI outage notice, from support@thatfridge.com.
 *
 * Without --send it only reports who would get it. --to sends a single test copy. A user who
 * has been sent the notice is remembered for 30 days, so a re-run (after hitting the mail
 * provider's daily limit, say) carries on where it stopped instead of emailing people twice.
 */
#[Signature('app:email-ai-outage-notice
    {--send : Actually send to every real user (asks first)}
    {--to= : Send one test copy to this address only}
    {--pause=600 : Milliseconds to wait between emails, to stay under the mail provider\'s rate limit}')]
#[Description('Email users the AI outage notice (dry run unless --send or --to)')]
class EmailAiOutageNotice extends Command
{
    private const SENT_KEY = 'ai-outage-notice-2026-10:sent:';

    public function handle(): int
    {
        if ($to = $this->option('to')) {
            Mail::to($to)->send(new AiOutageNoticeMail);
            $this->info("Sent one test copy to {$to}.");

            return self::SUCCESS;
        }

        $recipients = User::query()->where('is_demo', false)->whereNotNull('email');
        $total = (clone $recipients)->count();
        $relay = (clone $recipients)->where('email', 'like', '%@privaterelay.appleid.com')->count();

        $this->line("{$total} real user(s) with an email address.");
        if ($relay > 0) {
            $this->warn("{$relay} use an Apple private-relay address: Apple only delivers to those if support@thatfridge.com is registered for Sign in with Apple email.");
        }

        if (! $this->option('send')) {
            $this->line('Dry run, nothing sent. Test with --to=you@example.com, then run again with --send.');

            return self::SUCCESS;
        }

        if (! $this->confirm("Email the notice to {$total} user(s) from support@thatfridge.com?")) {
            $this->line('Cancelled, nothing sent.');

            return self::SUCCESS;
        }

        $sent = $skipped = $failed = 0;
        $pause = max(0, (int) $this->option('pause')) * 1000;

        $recipients->chunkById(200, function ($users) use (&$sent, &$skipped, &$failed, $pause) {
            foreach ($users as $user) {
                // add() is false when the key already exists: this user got it on an earlier run.
                if (! Cache::add(self::SENT_KEY.$user->id, true, now()->addDays(30))) {
                    $skipped++;

                    continue;
                }

                try {
                    Mail::to($user->email)->send(new AiOutageNoticeMail);
                    $sent++;
                } catch (\Throwable $e) {
                    Cache::forget(self::SENT_KEY.$user->id);
                    $failed++;
                    $this->error("Failed for user {$user->id}: {$e->getMessage()}");
                }

                usleep($pause);
            }
        });

        $this->info("Sent {$sent}, already sent earlier {$skipped}, failed {$failed}.");
        if ($failed > 0) {
            $this->line('Run the same command again to retry the failed ones; nobody is emailed twice.');
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
