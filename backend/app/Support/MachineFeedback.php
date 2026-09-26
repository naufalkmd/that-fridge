<?php

namespace App\Support;

use App\Models\Machine;
use App\Models\User;
use App\Services\MachineDraftValidator;
use Illuminate\Support\Facades\Cache;

/**
 * Kitchen Lab authoring signals: structured only (trigger type, step counts, what changed) -
 * never the prompt or step arguments. A draft that is never saved has no request of its own,
 * so "discarded" = drafted - saved - redrafted.
 */
final class MachineFeedback
{
    private static function draftKey(User $user): string
    {
        return "machine-draft:{$user->id}";
    }

    /** @param  array{name: string, trigger: array{type: string, config: array}, steps: array}  $draft */
    public static function drafted(User $user, array $draft): void
    {
        if (Cache::has(self::draftKey($user))) {
            AlgoFeedback::record($user, 'kitchen_lab', ['kind' => 'redrafted', 'source' => 'draft']);
        }
        Cache::put(self::draftKey($user), $draft, now()->addHour());

        AlgoFeedback::record($user, 'kitchen_lab', [
            'kind' => 'drafted', 'source' => $draft['trigger']['type'],
            'guess_number' => count($draft['steps']), 'outcome' => 'ok',
        ]);
    }

    public static function draftFailed(User $user): void
    {
        AlgoFeedback::record($user, 'kitchen_lab', ['kind' => 'draft_failed', 'source' => 'draft', 'outcome' => 'invalid']);
    }

    /** @param  array  $saved  the validator-normalized draft that was persisted */
    public static function saved(User $user, MachineDraftValidator $validator, array $saved): void
    {
        $cached = Cache::pull(self::draftKey($user));
        $original = is_array($cached) ? $validator->validate($cached, $user) : null;

        $outcome = 'hand_built';
        $guessSteps = null;
        if ($original && $original['valid']) {
            $guessSteps = count($original['draft']['steps']);
            $same = $original['draft']['trigger_type'] === $saved['trigger_type']
                && $original['draft']['trigger_config'] === $saved['trigger_config']
                && $original['draft']['steps'] === $saved['steps'];
            $outcome = $same ? 'as_is' : 'edited';
        }

        AlgoFeedback::record($user, 'kitchen_lab', [
            'kind' => 'saved', 'source' => $saved['trigger_type'],
            'guess_number' => $guessSteps, 'final_number' => count($saved['steps']),
            'outcome' => $outcome,
        ]);
    }

    public static function saveRejected(User $user, int $errorCount): void
    {
        AlgoFeedback::record($user, 'kitchen_lab', [
            'kind' => 'save_rejected', 'source' => 'validator',
            'guess_number' => $errorCount, 'outcome' => 'invalid',
        ]);
    }

    public static function dryRan(Machine $machine): void
    {
        Cache::put("machine-dryrun:{$machine->id}", true, now()->addDays(14));
    }

    public static function enabled(User $user, Machine $machine): void
    {
        AlgoFeedback::record($user, 'kitchen_lab', [
            'kind' => 'enabled', 'source' => $machine->trigger_type,
            'outcome' => Cache::has("machine-dryrun:{$machine->id}") ? 'dry_run_first' : 'no_dry_run',
        ]);
    }

    public static function runUndone(User $user, Machine $machine): void
    {
        AlgoFeedback::record($user, 'kitchen_lab', ['kind' => 'run_undone', 'source' => $machine->trigger_type]);
    }
}
