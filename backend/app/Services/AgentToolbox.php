<?php

namespace App\Services;

use App\Models\Fridge;
use App\Models\FridgeNote;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\ShoppingItem;
use App\Models\User;
use App\Support\ItemFreshness;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * The tools Quick Chat's agents can call to read and act on the user's kitchen. Everything
 * runs server-side AS the authenticated user and is scoped to fridges they're a member of -
 * same authorisation as the REST endpoints. Read tools execute freely; low-stakes writes
 * (add to shopping, add a note, mark an item used, adjust an item) execute directly since
 * they're all easily reversible; the destructive ones (remove_item, clear_expired_items)
 * take a `confirm` flag and return a preview first, so the agent has to check with the user
 * before anything is deleted.
 *
 * See AgentService::runWithTools for the loop that drives these.
 */
class AgentToolbox
{
    /** Set true by a write method only when it actually touched the DB; read back in run(). */
    private bool $mutated = false;

    /**
     * OpenAI function-tool schemas for every tool. `$fridgeId` is the chat's active fridge;
     * writes default to it (or the user's own fridge when chatting across all of them).
     */
    public function schemas(): array
    {
        $fn = fn (string $name, string $description, array $properties, array $required = []) => [
            'type' => 'function',
            'function' => [
                'name' => $name,
                'description' => $description,
                'parameters' => ['type' => 'object', 'properties' => (object) $properties, 'required' => $required],
            ],
        ];

        return [
            $fn('list_items', "List the food items in the user's fridge(s), newest first. Use this instead of guessing what they have - the short inventory summary in your context is truncated and lacks IDs, quantities and locations.", [
                'expired_only' => ['type' => 'boolean', 'description' => 'Only items already past their date.'],
                'expiring_within_days' => ['type' => 'integer', 'description' => 'Only items expiring within this many days (0 = today or overdue).'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
                'search' => ['type' => 'string', 'description' => 'Case-insensitive name substring.'],
            ]),
            $fn('list_notes', 'List the sticky notes on the fridge(s) - free-text reminders household members leave for each other.', []),
            $fn('list_shopping', 'List what is currently on the shopping list.', []),
            $fn('list_recipes', "List the user's saved recipes (name, minutes, ingredient names). Use it to answer \"what can I make\" from real recipes rather than inventing one.", [
                'search' => ['type' => 'string', 'description' => 'Case-insensitive name substring.'],
            ]),
            $fn('add_to_shopping', 'Add one item to the shopping list.', [
                'name' => ['type' => 'string'],
                'section' => ['type' => 'string', 'description' => 'Aisle/section label, e.g. "produce", "dairy". Defaults to "other".'],
            ], ['name']),
            $fn('add_note', 'Leave a sticky note on the fridge for household members.', [
                'text' => ['type' => 'string'],
                'color' => ['type' => 'string', 'enum' => FridgeNote::COLORS, 'description' => 'Optional accent colour; defaults to amber.'],
            ], ['text']),
            $fn('update_item', 'Change one field on an item: quantity, whether it is opened, its expiry date, or its storage location. Get the item_id from list_items first.', [
                'item_id' => ['type' => 'integer'],
                'quantity' => ['type' => 'integer', 'description' => 'New quantity (>= 1). To use an item up entirely, call mark_item_used instead.'],
                'opened' => ['type' => 'boolean'],
                'expiry_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD.'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
            ], ['item_id']),
            $fn('mark_item_used', 'Record that the user used up an item (or some of it) while it was still good. This removes it (or lowers the quantity) AND logs it to their usage history, which feeds their Kitchen Score and the Shopkeeper. Use this for "I used the last of the milk", NOT for throwing something away - that is remove_item.', [
                'item_id' => ['type' => 'integer'],
                'quantity_used' => ['type' => 'integer', 'description' => 'How many units were used. Omit to use up the whole item.'],
            ], ['item_id']),
            $fn('remove_item', 'Delete an item from the fridge - for something thrown away, or added by mistake. Call once with confirm:false to preview, tell the user exactly what will be removed, then call again with confirm:true only after they agree.', [
                'item_id' => ['type' => 'integer'],
                'confirm' => ['type' => 'boolean', 'description' => 'Must be true to actually delete. Never set true without explicit user agreement in the conversation.'],
            ], ['item_id']),
            $fn('clear_expired_items', 'Delete every item that is past its date. Call once with confirm:false to see the list, read it back to the user, then call again with confirm:true only after they agree.', [
                'confirm' => ['type' => 'boolean', 'description' => 'Must be true to actually delete. Never set true without explicit user agreement in the conversation.'],
            ]),
        ];
    }

    /**
     * @return array{content: string, mutated: bool}
     */
    public function run(string $name, array $args, User $user, ?int $fridgeId): array
    {
        $this->mutated = false;

        try {
            $content = match ($name) {
                'list_items' => $this->listItems($user, $args),
                'list_notes' => $this->listNotes($user),
                'list_shopping' => $this->listShopping($user),
                'list_recipes' => $this->listRecipes($user, $args),
                'add_to_shopping' => $this->addToShopping($user, $fridgeId, $args),
                'add_note' => $this->addNote($user, $fridgeId, $args),
                'update_item' => $this->updateItem($user, $args),
                'mark_item_used' => $this->markItemUsed($user, $args),
                'remove_item' => $this->removeItem($user, $args),
                'clear_expired_items' => $this->clearExpired($user, $fridgeId, $args),
                default => "Error: unknown tool \"{$name}\".",
            };
        } catch (\Throwable $e) {
            return ['content' => 'Error running that tool: '.$e->getMessage(), 'mutated' => false];
        }

        return ['content' => $content, 'mutated' => $this->mutated];
    }

    // ---- reads ---------------------------------------------------------------

    /** @return Builder<Item> */
    private function items(User $user)
    {
        return Item::query()
            ->whereHas('section.fridge.members', fn ($q) => $q->where('users.id', $user->id))
            ->with('section.fridge');
    }

    private function listItems(User $user, array $args): string
    {
        $items = $this->items($user)->orderByDesc('created_at')->limit(200)->get();

        if (isset($args['search'])) {
            $items = $items->filter(fn ($i) => str_contains(Str::lower($i->name), Str::lower((string) $args['search'])));
        }
        $items = $items->map(function ($i) {
            $days = ItemFreshness::daysUntilExpiry($i);
            if ($i->opened && $days !== null) {
                $days = min($days, 3);
            }

            return [
                'model' => $i,
                'id' => $i->id,
                'name' => $i->name,
                'quantity' => $i->quantity,
                'location' => $i->location,
                'section' => $i->section?->name,
                'fridge' => $i->section?->fridge?->name,
                'category' => $i->nutrition_category,
                'opened' => (bool) $i->opened,
                'days_to_expiry' => $days,
            ];
        });

        if (! empty($args['expired_only'])) {
            $items = $items->filter(fn ($i) => $i['days_to_expiry'] !== null && $i['days_to_expiry'] < 0);
        }
        if (isset($args['expiring_within_days'])) {
            $n = (int) $args['expiring_within_days'];
            $items = $items->filter(fn ($i) => $i['days_to_expiry'] !== null && $i['days_to_expiry'] <= $n);
        }
        if (isset($args['location'])) {
            $items = $items->filter(fn ($i) => $i['location'] === $args['location']);
        }

        if ($items->isEmpty()) {
            return 'No items match.';
        }

        $lines = $items->map(function ($i) {
            $exp = $i['days_to_expiry'] === null
                ? 'no date'
                : ($i['days_to_expiry'] < 0 ? abs($i['days_to_expiry']).'d overdue' : $i['days_to_expiry'].'d left');

            return "#{$i['id']} {$i['name']} · {$i['quantity']}x · ".
                ($i['location'] ?? '?')." · {$i['section']} · {$exp}".
                ($i['opened'] ? ' · opened' : '').
                ($i['category'] ? " · {$i['category']}" : '');
        });

        return $lines->implode("\n");
    }

    private function listNotes(User $user): string
    {
        $notes = FridgeNote::whereIn('fridge_id', $this->fridgeIds($user))
            ->with('user')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        if ($notes->isEmpty()) {
            return 'No notes on the fridge.';
        }

        return $notes->map(fn ($n) => '#'.$n->id.' "'.$n->text.'" — @'.($n->user?->username ?? 'someone').', '.$n->created_at->diffForHumans())->implode("\n");
    }

    private function listShopping(User $user): string
    {
        $items = ShoppingItem::whereIn('fridge_id', $this->fridgeIds($user))
            ->orderByDesc('created_at')->limit(100)->get();

        if ($items->isEmpty()) {
            return 'The shopping list is empty.';
        }

        return $items->map(fn ($s) => '#'.$s->id.' '.$s->name.' ('.$s->section.')'.($s->checked ? ' — checked off' : ''))->implode("\n");
    }

    private function listRecipes(User $user, array $args): string
    {
        $recipes = Recipe::query()
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id))
            ->when(isset($args['search']), fn ($q) => $q->where('name', 'like', '%'.$args['search'].'%'))
            ->orderBy('name')->limit(60)->get(['id', 'name', 'minutes', 'ingredients']);

        if ($recipes->isEmpty()) {
            return 'No saved recipes match.';
        }

        return $recipes->map(function ($r) {
            $ings = collect($r->ingredients ?? [])->pluck('name')->implode(', ');

            return "#{$r->id} {$r->name} ({$r->minutes}m) — {$ings}";
        })->implode("\n");
    }

    // ---- low-stakes writes ------------------------------------------------------

    private function addToShopping(User $user, ?int $fridgeId, array $args): string
    {
        $fridge = $this->targetFridge($user, $fridgeId);
        $name = trim((string) ($args['name'] ?? ''));
        if ($name === '') {
            return 'Error: a name is required.';
        }

        $fridge->shoppingItems()->create([
            'name' => Str::limit($name, 255, ''),
            'section' => Str::limit(trim((string) ($args['section'] ?? 'other')) ?: 'other', 255, ''),
            'checked' => false,
        ]);
        $this->mutated = true;

        return "Added \"{$name}\" to the shopping list on {$fridge->name}.";
    }

    private function addNote(User $user, ?int $fridgeId, array $args): string
    {
        $fridge = $this->targetFridge($user, $fridgeId);
        $text = trim((string) ($args['text'] ?? ''));
        if ($text === '') {
            return 'Error: note text is required.';
        }
        $color = in_array($args['color'] ?? null, FridgeNote::COLORS, true) ? $args['color'] : 'amber';

        $fridge->notes()->create(['text' => Str::limit($text, 500, ''), 'color' => $color, 'user_id' => $user->id]);
        $this->mutated = true;

        return "Left a note on {$fridge->name}: \"{$text}\".";
    }

    private function updateItem(User $user, array $args): string
    {
        $item = $this->items($user)->find($args['item_id'] ?? null);
        if (! $item) {
            return 'Error: no accessible item with that id. Call list_items to get valid ids.';
        }

        $data = [];
        if (isset($args['quantity']) && (int) $args['quantity'] >= 1) {
            $data['quantity'] = (int) $args['quantity'];
        }
        if (array_key_exists('opened', $args)) {
            $data['opened'] = (bool) $args['opened'];
        }
        if (isset($args['location']) && in_array($args['location'], ['fridge', 'freezer', 'pantry'], true)) {
            $data['location'] = $args['location'];
        }
        if (isset($args['expiry_date'])) {
            try {
                $data['expiry_date'] = Carbon::parse($args['expiry_date'])->toDateString();
            } catch (\Throwable) {
                return 'Error: expiry_date must be a valid date like 2026-09-20.';
            }
        }

        if (! $data) {
            return 'Error: nothing to change - pass at least one of quantity, opened, location, expiry_date.';
        }

        $item->update($data);
        $this->mutated = true;

        return "Updated \"{$item->name}\": ".collect($data)->map(fn ($v, $k) => "{$k}=".(is_bool($v) ? ($v ? 'true' : 'false') : $v))->implode(', ').'.';
    }

    private function markItemUsed(User $user, array $args): string
    {
        $item = $this->items($user)->find($args['item_id'] ?? null);
        if (! $item) {
            return 'Error: no accessible item with that id. Call list_items to get valid ids.';
        }

        $used = isset($args['quantity_used']) ? max(1, (int) $args['quantity_used']) : $item->quantity;
        $usedUp = $used >= $item->quantity;

        $days = ItemFreshness::daysUntilExpiry($item);
        $this->recordUsage($user, $item->name, $item->icon, $days);
        $this->mutated = true;

        if ($usedUp) {
            $item->delete();

            return "Marked \"{$item->name}\" as used up and logged it to your usage history.";
        }

        $item->decrement('quantity', $used);

        return "Used {$used} of \"{$item->name}\" ({$item->quantity} left) and logged it.";
    }

    // ---- destructive writes (confirm-first) ------------------------------------

    private function removeItem(User $user, array $args): string
    {
        $item = $this->items($user)->find($args['item_id'] ?? null);
        if (! $item) {
            return 'Error: no accessible item with that id. Call list_items to get valid ids.';
        }

        if (empty($args['confirm'])) {
            return "Not removed yet. This will permanently delete \"{$item->name}\" ({$item->quantity}x). ".
                'Tell the user exactly what will be removed and ask them to confirm, then call remove_item again with confirm:true.';
        }

        $name = $item->name;
        $item->delete();
        $this->mutated = true;

        return "Removed \"{$name}\".";
    }

    private function clearExpired(User $user, ?int $fridgeId, array $args): string
    {
        $expired = $this->items($user)
            ->when($fridgeId, fn ($q) => $q->whereHas('section', fn ($s) => $s->where('fridge_id', $fridgeId)))
            ->get()
            ->filter(fn ($i) => ($d = ItemFreshness::daysUntilExpiry($i)) !== null && $d < 0);

        if ($expired->isEmpty()) {
            return 'Nothing is past its date - nothing to clear.';
        }

        $list = $expired->map(fn ($i) => "\"{$i->name}\" (".abs(ItemFreshness::daysUntilExpiry($i)).'d overdue)')->implode(', ');

        if (empty($args['confirm'])) {
            return "Not removed yet. {$expired->count()} item(s) are past their date: {$list}. ".
                'Read this list back to the user and ask them to confirm, then call clear_expired_items again with confirm:true.';
        }

        Item::whereIn('id', $expired->pluck('id'))->delete();
        $this->mutated = true;

        return "Removed {$expired->count()} expired item(s): {$list}.";
    }

    // ---- helpers --------------------------------------------------------------

    private function fridgeIds(User $user)
    {
        return $user->memberFridges()->pluck('fridges.id');
    }

    private function targetFridge(User $user, ?int $fridgeId): Fridge
    {
        if ($fridgeId && $this->fridgeIds($user)->contains($fridgeId)) {
            return Fridge::find($fridgeId);
        }

        return $user->fridges()->first()
            ?? $user->memberFridges()->first()
            ?? throw new \RuntimeException('You are not in any fridge yet.');
    }

    /** Mirror of UsageHistoryController::store's upsert, minus the goal-metric extras. */
    private function recordUsage(User $user, string $name, ?string $icon, ?int $daysRemaining): void
    {
        $key = Str::lower(trim($name));
        $freshInc = $daysRemaining !== null && $daysRemaining >= 0 ? 1 : 0;

        $entry = $user->usageHistory()->where('key', $key)->first();

        if ($entry) {
            $entry->update([
                'count' => $entry->count + 1,
                'fresh_use_count' => $entry->fresh_use_count + $freshInc,
                'last_used_at' => now(),
                'name' => $name,
                'icon' => $icon ?: $entry->icon,
            ]);

            return;
        }

        $user->usageHistory()->create([
            'key' => $key,
            'name' => $name,
            'icon' => $icon ?: 'leftovers',
            'count' => 1,
            'fresh_use_count' => $freshInc,
            'freshness_sum' => 0,
            'freshness_sample_count' => 0,
            'last_used_at' => now(),
        ]);
    }
}
