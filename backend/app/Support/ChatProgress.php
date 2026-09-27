<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * What the crew is doing right now during a Quick Chat turn ("Adding eggs to your list"), so the
 * app can show it while it waits instead of bare typing dots. The app sends a `turn_id` with the
 * message and polls GET /chat/progress/{turn} until the reply arrives; the chat code reports each
 * step here. One instance per request (scoped in AppServiceProvider); without a turn id it's a no-op.
 */
final class ChatProgress
{
    private const TTL = 120;

    private ?string $key = null;

    public function begin(int $userId, mixed $turnId): void
    {
        $this->key = self::key($userId, $turnId);
        $this->step('Thinking');
    }

    public function step(string $text): void
    {
        if ($this->key !== null) {
            Cache::put($this->key, $text, self::TTL);
        }
    }

    public function end(): void
    {
        if ($this->key !== null) {
            Cache::forget($this->key);
            $this->key = null;
        }
    }

    public static function read(int $userId, string $turnId): ?string
    {
        $key = self::key($userId, $turnId);

        return $key === null ? null : Cache::get($key);
    }

    /** Only well-formed ids, scoped to the user, so nobody can read someone else's turn. */
    private static function key(int $userId, mixed $turnId): ?string
    {
        return is_string($turnId) && preg_match('/^[A-Za-z0-9_-]{8,64}$/', $turnId) ? "chat-progress:{$userId}:{$turnId}" : null;
    }

    /** The plain-words status for a tool the model is about to run. */
    public static function label(string $tool, array $args): string
    {
        $name = self::name($args['name'] ?? null);

        return match ($tool) {
            'list_items', 'sum_item_field' => 'Checking your fridge',
            'add_item' => $name ? "Adding {$name}" : 'Adding to your fridge',
            'bulk_add_items' => is_array($args['items'] ?? null) && count($args['items']) > 1
                ? 'Adding '.count($args['items']).' items'
                : 'Adding to your fridge',
            'update_item', 'move_item' => 'Updating your fridge',
            'mark_item_used', 'mark_items_used_matching' => 'Marking things used',
            'remove_item', 'clear_expired_items' => 'Clearing items',
            'list_fridges' => 'Checking your fridges',
            'list_plan' => 'Looking at your meal plan',
            'plan_meals' => 'Planning your meals',
            'remove_meal' => 'Updating your meal plan',
            'list_notes' => 'Reading your notes',
            'add_note', 'update_note', 'remove_note' => 'Updating your notes',
            'list_shopping' => 'Checking your shopping list',
            'add_to_shopping' => $name ? "Adding {$name} to your list" : 'Updating your shopping list',
            'check_off_shopping', 'remove_from_shopping' => 'Updating your shopping list',
            'list_recipes', 'get_recipe' => 'Looking through your recipes',
            'save_recipe' => $name ? "Saving {$name}" : 'Saving the recipe',
            'delete_recipe' => 'Updating your recipes',
            'mark_recipe_made' => 'Marking the recipe made',
            'import_recipe_from_link', 'fetch_url' => 'Reading the link',
            'list_badges', 'get_kitchen_score' => 'Checking your progress',
            'get_credits_balance' => 'Checking your credits',
            'remember_fact' => 'Remembering that',
            'list_facts' => 'Checking what it remembers',
            'forget_fact' => 'Forgetting that',
            'create_machine' => 'Building a Kitchen Lab machine',
            default => 'Working on it',
        };
    }

    /** A short, single-line version of a name from the model's arguments, or null. */
    private static function name(mixed $raw): ?string
    {
        if (! is_string($raw)) {
            return null;
        }
        $clean = trim(preg_replace('/\s+/u', ' ', strip_tags($raw)) ?? '');

        return $clean === '' ? null : Str::lower(Str::limit($clean, 32, '…'));
    }
}
