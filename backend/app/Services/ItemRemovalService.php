<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemOutcome;
use App\Models\User;
use App\Support\AlgoFeedback;
use App\Support\FoodGroupClassifier;
use App\Support\ItemRemovalOutcome;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Owns deletion, outcome correction, and undo so every entry path has the same accounting. */
final class ItemRemovalService
{
    private const SNAPSHOT_FIELDS = [
        'section_id', 'product_id', 'category_id', 'name', 'icon', 'icon_url',
        'nutrition_category', 'location', 'quantity', 'weight', 'weight_unit',
        'expiry_date', 'shelf_life_days', 'opened', 'note', 'source', 'shop_url',
        'calories', 'custom_fields', 'created_at', 'opened_at',
        'opened_shelf_life_days', 'opened_shelf_life_source',
    ];

    public function __construct(private BadgeService $badges) {}

    public function remove(User $user, Item $item, ?string $context = null): ItemOutcome
    {
        return DB::transaction(function () use ($user, $item, $context) {
            $classified = ItemRemovalOutcome::classify($item, $context);
            $snapshot = $item->only(self::SNAPSHOT_FIELDS);
            $outcome = ItemOutcome::create([
                'user_id' => $user->id,
                'original_item_id' => $item->id,
                'name_key' => $classified['outcome'] === 'entry_mistake' ||
                    ! config('app.algo_feedback_enabled') ||
                    ($user->preferences['help_improve'] ?? true) === false
                        ? null : AlgoFeedback::nameKey($item->name),
                'snapshot' => $snapshot,
                'context' => $context,
                ...$classified,
            ]);

            if ($outcome->outcome === 'used') {
                $this->countUsage($user, $outcome);
            }
            $item->delete();

            if ($outcome->outcome !== 'entry_mistake') {
                $this->feedback($user, $outcome, 'removed');
            }

            return $outcome->refresh();
        });
    }

    public function correct(User $user, ItemOutcome $outcome, string $newOutcome): ItemOutcome
    {
        return DB::transaction(function () use ($user, $outcome, $newOutcome) {
            $outcome = ItemOutcome::whereKey($outcome->id)->lockForUpdate()->firstOrFail();
            abort_unless($outcome->user_id === $user->id && ! $outcome->undone_at && $outcome->snapshot, 404);
            abort_unless(in_array($newOutcome, ['used', 'wasted'], true), 422);
            if ($outcome->outcome === $newOutcome) {
                return $outcome;
            }
            $old = $outcome->outcome;
            if ($old === 'used') {
                $this->reverseUsage($user, $outcome);
            }
            $outcome->outcome = $newOutcome;
            $outcome->corrected_from = $old;
            $outcome->save();
            if ($newOutcome === 'used') {
                $this->countUsage($user, $outcome);
            }
            $this->feedback($user, $outcome, 'corrected');

            return $outcome->refresh();
        });
    }

    public function undo(User $user, ItemOutcome $outcome, bool $allowLateMachineUndo = false): Item
    {
        return DB::transaction(function () use ($user, $outcome, $allowLateMachineUndo) {
            $outcome = ItemOutcome::whereKey($outcome->id)->lockForUpdate()->firstOrFail();
            abort_unless($outcome->user_id === $user->id && ! $outcome->undone_at && $outcome->snapshot, 404);
            abort_if(! $allowLateMachineUndo && $outcome->created_at->lessThan(now()->subMinutes(10)), 410, 'Undo is no longer available.');
            abort_if($allowLateMachineUndo && $outcome->context !== 'machine_used', 403);

            $snapshot = $outcome->snapshot;
            $restore = array_intersect_key($snapshot, array_flip(self::SNAPSHOT_FIELDS));
            // An old item may have an invalid opened flag. Restore its saved state without
            // asking today's opening rules to reclassify it during Item::create().
            $item = Item::create(array_diff_key($restore, array_flip([
                'opened', 'opened_at', 'opened_shelf_life_days', 'opened_shelf_life_source',
            ])));
            $item->forceFill($snapshot)->saveQuietly();

            if ($outcome->outcome === 'used') {
                $this->reverseUsage($user, $outcome);
            }
            $outcome->update(['undone_at' => now(), 'snapshot' => null]);
            $this->feedback($user, $outcome, 'undone');

            return $item;
        });
    }

    private function countUsage(User $user, ItemOutcome $outcome): void
    {
        $snapshot = $outcome->snapshot ?? [];
        $name = (string) ($snapshot['name'] ?? '');
        $key = Str::lower(trim($name));
        $days = $outcome->predicted_days;
        $shelfLife = $snapshot['shelf_life_days'] ?? null;
        $fresh = $days !== null && $days >= 0 ? 1 : 0;
        $freshness = $days !== null && $shelfLife > 0
            ? (int) max(0, min(100, round($days / $shelfLife * 100)))
            : null;

        $entry = $user->usageHistory()->firstOrCreate(['key' => $key], [
            'name' => $name, 'icon' => $snapshot['icon'] ?? '',
            'category' => $snapshot['nutrition_category'] ?? null,
            'count' => 0, 'fresh_use_count' => 0,
            'freshness_sum' => 0, 'freshness_sample_count' => 0,
            'last_used_at' => now(),
        ]);
        $entry->update([
            'name' => $name,
            'icon' => $snapshot['icon'] ?? $entry->icon,
            'category' => $snapshot['nutrition_category'] ?? $entry->category,
            'count' => $entry->count + 1,
            'fresh_use_count' => $entry->fresh_use_count + $fresh,
            'freshness_sum' => $entry->freshness_sum + ($freshness ?? 0),
            'freshness_sample_count' => $entry->freshness_sample_count + ($freshness !== null ? 1 : 0),
            'last_used_at' => now(),
        ]);

        $badgeCounted = false;
        if ($outcome->actual_days >= 1 && $days !== null && $days >= 0 && $days <= 3) {
            $badge = $user->badges()->where('badge_key', 'rescued_10')->first();
            $before = $badge?->progress ?? 0;
            $after = $this->badges->awardProgress($user, 'rescued_10', 1);
            $badgeCounted = $after->progress > $before;
        }

        $outcome->update([
            'usage_delta' => ['key' => $key, 'fresh' => $fresh, 'freshness' => $freshness],
            'badge_counted' => $badgeCounted,
        ]);
    }

    private function reverseUsage(User $user, ItemOutcome $outcome): void
    {
        $delta = $outcome->usage_delta;
        if (! $delta) {
            return;
        }
        $entry = $user->usageHistory()->where('key', $delta['key'])->first();
        if ($entry) {
            if ($entry->count <= 1) {
                $entry->delete();
            } else {
                $entry->update([
                    'count' => $entry->count - 1,
                    'fresh_use_count' => max(0, $entry->fresh_use_count - ($delta['fresh'] ?? 0)),
                    'freshness_sum' => max(0, $entry->freshness_sum - ($delta['freshness'] ?? 0)),
                    'freshness_sample_count' => max(0, $entry->freshness_sample_count - ($delta['freshness'] !== null ? 1 : 0)),
                ]);
            }
        }
        if ($outcome->badge_counted) {
            $badge = $user->badges()->where('badge_key', 'rescued_10')->first();
            if ($badge) {
                $badge->progress = max(0, $badge->progress - 1);
                if ($badge->progress < BadgeService::BADGES['rescued_10']) {
                    $badge->earned_at = null;
                }
                $badge->save();
            }
        }
        $outcome->update(['usage_delta' => null, 'badge_counted' => false]);
    }

    private function feedback(User $user, ItemOutcome $outcome, string $kind): void
    {
        $snapshot = $outcome->snapshot ?? [];
        $name = $snapshot['name'] ?? null;
        $class = $name ? FoodGroupClassifier::classify($name, $snapshot['icon'] ?? null) : null;
        AlgoFeedback::record($user, 'removal', [
            'kind' => $kind, 'name' => $name, 'class' => $class,
            'guess' => $outcome->corrected_from ?? $outcome->outcome,
            'final' => $outcome->outcome, 'source' => 'classifier',
            'outcome' => $kind === 'corrected' ? 'corrected' : $outcome->outcome,
            'confidence' => match ($outcome->confidence) {
                'high' => 1.0, 'medium' => 0.7, default => 0.3
            },
        ]);
        if (! empty($snapshot['opened']) && $kind === 'removed') {
            AlgoFeedback::record($user, 'opened', [
                'kind' => 'opened_outcome', 'name' => $name, 'class' => $class,
                'guess_number' => $snapshot['opened_shelf_life_days'] ?? null,
                'final_number' => $outcome->actual_days,
                'source' => $snapshot['opened_shelf_life_source'] ?? 'default',
                'outcome' => $outcome->outcome,
            ]);
        }
    }
}
