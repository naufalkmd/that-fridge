<?php

namespace App\Console\Commands;

use App\Models\ChatHistory;
use App\Models\Fridge;
use App\Models\GeneratedIcon;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * A one-glance operational pulse for a solo operator - "is anyone using this, and is
 * anything on fire". No auth, no attack surface, no dashboard to maintain: SSH in and run
 * it. `--json` for piping into anything else.
 */
#[Signature('app:stats {--json : Emit a JSON object instead of a table}')]
#[Description('Print user / usage / content / cost counters at a glance')]
class Stats extends Command
{
    public function handle(): int
    {
        $now = Carbon::now();
        $day = $now->copy()->subDay();
        $week = $now->copy()->subDays(7);
        $month = $now->copy()->subDays(30);

        // Real users only - the 4 seeded demo / reviewer accounts aren't customers.
        $real = User::where('is_demo', false);

        $stats = [
            'users' => [
                'total' => (clone $real)->count(),
                'verified' => (clone $real)->whereNotNull('email_verified_at')->count(),
                'pro' => (clone $real)->where('pro_expires_at', '>', $now)->count(),
                'via_apple' => (clone $real)->where('oauth_provider', 'apple')->count(),
                'via_google' => (clone $real)->where('oauth_provider', 'google')->count(),
                'via_email' => (clone $real)->whereNull('oauth_provider')->count(),
            ],
            'signups' => [
                'last_24h' => (clone $real)->where('created_at', '>=', $day)->count(),
                'last_7d' => (clone $real)->where('created_at', '>=', $week)->count(),
                'last_30d' => (clone $real)->where('created_at', '>=', $month)->count(),
            ],
            'ai_last_7d' => [
                'image_generations' => GeneratedIcon::where('created_at', '>=', $week)->count(),
                'credits_spent' => (int) GeneratedIcon::where('created_at', '>=', $week)->sum('credits'),
                'chat_messages' => ChatHistory::where('created_at', '>=', $week)->count(),
            ],
            'content' => [
                'fridges' => Fridge::count(),
                'shared_fridges' => Fridge::has('members', '>', 1)->count(),
                'items' => Item::count(),
                'custom_recipes' => Recipe::whereNotNull('user_id')->count(),
            ],
        ];

        // Conversion rate, guarded against div-by-zero.
        $stats['users']['conversion_pct'] = $stats['users']['total'] > 0
            ? round($stats['users']['pro'] / $stats['users']['total'] * 100, 1)
            : 0.0;

        if ($this->option('json')) {
            $this->line(json_encode($stats, JSON_PRETTY_PRINT));

            return self::SUCCESS;
        }

        foreach ($stats as $section => $rows) {
            $this->newLine();
            $this->components->info(str_replace('_', ' ', ucfirst($section)));
            foreach ($rows as $label => $value) {
                $this->components->twoColumnDetail(
                    str_replace('_', ' ', $label),
                    (string) $value.($label === 'conversion_pct' ? '%' : ''),
                );
            }
        }
        $this->newLine();

        return self::SUCCESS;
    }
}
