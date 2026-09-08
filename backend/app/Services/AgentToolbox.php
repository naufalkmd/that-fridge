<?php

namespace App\Services;

use App\Models\Fridge;
use App\Models\FridgeNote;
use App\Models\Item;
use App\Models\Recipe;
use App\Models\Section;
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
 * (add/move an item, adjust one, mark it used, shopping-list edits, notes, a remembered fact,
 * saving a recipe) execute directly since they're all easily reversible; the destructive ones
 * (remove_item, clear_expired_items) take a `confirm` flag and return a preview first, so the
 * agent has to check with the user before anything is deleted.
 *
 * See AgentService::runWithTools for the loop that drives these.
 */
class AgentToolbox
{
    /** Set true by a write method only when it actually touched the DB; read back in run(). */
    private bool $mutated = false;

    /**
     * Name-keyword => curated icon key, ported from the 10 curated entries of
     * packages/core/src/food-icons.ts. The full pack's keyword map lives only in the generated
     * TS file, so add_item / save_recipe get a rough curated guess (or 'leftovers') and the
     * user can retap the icon in the app. Longest keyword match wins.
     */
    private const CURATED_ICON_KEYWORDS = [
        'milk' => ['milk'],
        'yogurt' => ['yogurt', 'yoghurt'],
        'cheese' => ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'feta'],
        'eggs' => ['egg'],
        'spinach' => ['spinach', 'kale', 'lettuce', 'greens', 'salad'],
        'carrot' => ['carrot'],
        'apple' => ['apple'],
        'berries' => ['berry', 'berries', 'strawberr', 'blueberr', 'raspberr'],
        'meat' => ['meat', 'pork', 'beef', 'steak', 'mince', 'chicken', 'sausage', 'bacon', 'ham'],
        'leftovers' => ['leftover', 'soup', 'stew', 'casserole'],
    ];

    private const ICON_NUTRITION = [
        'eggs' => 'protein', 'meat' => 'protein',
        'milk' => 'dairy', 'yogurt' => 'dairy', 'cheese' => 'dairy',
        'spinach' => 'vegetables', 'carrot' => 'vegetables',
        'apple' => 'fruit', 'berries' => 'fruit',
        'leftovers' => 'other_extras',
    ];

    private const RECIPE_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'quick'];

    public function __construct(
        protected KitchenScoreService $kitchenScore,
        protected RecipeLinkImportService $recipeImport,
    ) {}

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
            $fn('list_fridges', 'List the fridges the user belongs to (id, name, whether they own it, item and member counts). Use it before add_item / move_item when the user names a specific fridge.', []),
            $fn('get_kitchen_score', "The user's current Kitchen Score - Waste Saver (0-100), Food Balance (0-100), and how many items are overdue right now. Use it when they ask how they're doing.", []),
            $fn('get_recipe', 'The full detail of one saved recipe - every ingredient and every step. list_recipes only gives names, so call this when the user actually wants to cook one.', [
                'recipe_id' => ['type' => 'integer'],
            ], ['recipe_id']),
            $fn('add_item', "Add a food item to the user's inventory. Guesses an icon from the name. Goes to the fridge named in fridge_id, else the chat's active fridge, else their default one.", [
                'name' => ['type' => 'string'],
                'quantity' => ['type' => 'integer', 'description' => 'Defaults to 1.'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry'], 'description' => 'Defaults to fridge.'],
                'expiry_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD. Omit if unknown, or pass shelf_life_days instead.'],
                'shelf_life_days' => ['type' => 'integer', 'description' => 'Days from today until it goes off - use when the user gives a rough guess instead of a date.'],
                'section' => ['type' => 'string', 'description' => 'Shelf / section label, e.g. "Produce", "Door". Created if new.'],
                'fridge_id' => ['type' => 'integer', 'description' => 'From list_fridges. Omit for the active/default fridge.'],
            ], ['name']),
            $fn('move_item', 'Move an item to a different shelf/section, and optionally change its storage location. Get item_id from list_items.', [
                'item_id' => ['type' => 'integer'],
                'section' => ['type' => 'string', 'description' => 'Target section label; created if new.'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
            ], ['item_id']),
            $fn('check_off_shopping', 'Mark a shopping-list item as bought (checked off). Get the id from list_shopping, or pass its name.', [
                'shopping_id' => ['type' => 'integer'],
                'name' => ['type' => 'string', 'description' => 'Used only when shopping_id is omitted - first unchecked item whose name contains this.'],
            ]),
            $fn('remove_from_shopping', 'Delete an item from the shopping list. Get the id from list_shopping, or pass its name.', [
                'shopping_id' => ['type' => 'integer'],
                'name' => ['type' => 'string', 'description' => 'Used only when shopping_id is omitted - first item whose name contains this.'],
            ]),
            $fn('remember_fact', 'Save one durable fact about the user for future chats - a dietary restriction, allergy, strong preference, or household habit. Not for one-off requests or anything about a single item. Keep it under 10 words.', [
                'fact' => ['type' => 'string'],
            ], ['fact']),
            $fn('save_recipe', "Save a new recipe to the user's recipe book - use it when they ask you to keep a dish you described, or they dictate one. Ingredients and steps are plain strings.", [
                'name' => ['type' => 'string'],
                'minutes' => ['type' => 'integer', 'description' => 'Total time in minutes.'],
                'ingredients' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Ingredient lines, e.g. "2 eggs", "100g spinach".'],
                'steps' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Ordered steps.'],
                'category' => ['type' => 'string', 'enum' => self::RECIPE_CATEGORIES],
            ], ['name', 'minutes', 'ingredients', 'steps']),
            $fn('mark_recipe_made', 'Record that the user cooked a recipe - bumps its made count (feeds "something new" suggestions). Get recipe_id from list_recipes. Does NOT change inventory; use mark_item_used for ingredients they finished.', [
                'recipe_id' => ['type' => 'integer'],
            ], ['recipe_id']),
            $fn('import_recipe_from_link', 'Read a recipe from a URL the user shared and return its name, ingredients and steps. Follow up with save_recipe if they want it kept. Only use a URL the user actually provided.', [
                'url' => ['type' => 'string'],
            ], ['url']),
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
                'list_fridges' => $this->listFridges($user),
                'get_kitchen_score' => $this->getKitchenScore($user),
                'get_recipe' => $this->getRecipe($user, $args),
                'add_item' => $this->addItem($user, $fridgeId, $args),
                'move_item' => $this->moveItem($user, $args),
                'check_off_shopping' => $this->checkOffShopping($user, $args),
                'remove_from_shopping' => $this->removeFromShopping($user, $args),
                'remember_fact' => $this->rememberFact($user, $args),
                'save_recipe' => $this->saveRecipe($user, $args),
                'mark_recipe_made' => $this->markRecipeMade($user, $args),
                'import_recipe_from_link' => $this->importRecipeFromLink($args),
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

    // ---- fridges / score / recipes (reads) -----------------------------------

    private function listFridges(User $user): string
    {
        $fridges = $user->memberFridges()->withCount('members')->orderBy('fridges.id')->get();

        if ($fridges->isEmpty()) {
            return 'You are not in any fridge yet.';
        }

        return $fridges->map(function ($f) use ($user) {
            $items = Item::whereHas('section', fn ($q) => $q->where('fridge_id', $f->id))->count();
            $role = $f->user_id === $user->id ? 'owner' : 'member';

            return "#{$f->id} {$f->name} · {$role} · {$items} item(s) · {$f->members_count} member(s)";
        })->implode("\n");
    }

    private function getKitchenScore(User $user): string
    {
        $s = $this->kitchenScore->scoreFor($user);

        $waste = $s['wasteScore'] === null ? 'not enough data yet' : "{$s['wasteScore']}/100";
        $balance = $s['balanceScore'] === null ? 'not enough data yet' : "{$s['balanceScore']}/100";

        return "Waste Saver: {$waste}\nFood Balance: {$balance}\nOverdue items right now: {$s['overdueCount']}";
    }

    /** @return Builder<Recipe> */
    private function recipesFor(User $user)
    {
        return Recipe::query()->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $user->id));
    }

    private function getRecipe(User $user, array $args): string
    {
        $recipe = $this->recipesFor($user)->find($args['recipe_id'] ?? null);
        if (! $recipe) {
            return 'Error: no recipe with that id. Call list_recipes for valid ids.';
        }

        $ings = collect($recipe->ingredients ?? [])->map(fn ($i) => '- '.($i['name'] ?? ''))->implode("\n");
        $steps = collect($recipe->steps ?? [])->values()
            ->map(fn ($s, $n) => ($n + 1).'. '.$s)->implode("\n");

        return "{$recipe->name} ({$recipe->minutes}m)\n\nIngredients:\n{$ings}\n\nSteps:\n{$steps}";
    }

    // ---- inventory / shopping / memory / recipe writes ----------------------

    private function addItem(User $user, ?int $fridgeId, array $args): string
    {
        $name = trim((string) ($args['name'] ?? ''));
        if ($name === '') {
            return 'Error: a name is required.';
        }

        $wanted = isset($args['fridge_id']) && $this->fridgeIds($user)->contains((int) $args['fridge_id'])
            ? (int) $args['fridge_id']
            : $fridgeId;
        $fridge = $this->targetFridge($user, $wanted);

        $location = in_array($args['location'] ?? null, ['fridge', 'freezer', 'pantry'], true)
            ? $args['location'] : 'fridge';

        $expiry = null;
        if (isset($args['expiry_date'])) {
            try {
                $expiry = Carbon::parse($args['expiry_date'])->toDateString();
            } catch (\Throwable) {
                return 'Error: expiry_date must be a valid date like 2026-09-20.';
            }
        } elseif (isset($args['shelf_life_days']) && (int) $args['shelf_life_days'] >= 1) {
            $expiry = Carbon::now()->addDays((int) $args['shelf_life_days'])->toDateString();
        }

        $section = $this->sectionFor($fridge, $args['section'] ?? null, $location);
        $icon = $this->guessIcon($name) ?? 'leftovers';

        $item = $section->items()->create([
            'name' => Str::limit($name, 255, ''),
            'icon' => $icon,
            'nutrition_category' => self::ICON_NUTRITION[$icon] ?? null,
            'location' => $location,
            'quantity' => isset($args['quantity']) ? max(1, (int) $args['quantity']) : 1,
            'expiry_date' => $expiry,
            'source' => 'manual',
        ]);
        $this->mutated = true;

        return "Added \"{$item->name}\" ({$item->quantity}x) to {$section->name} in {$fridge->name}".
            ($expiry ? " · expires {$expiry}" : '').'.';
    }

    private function moveItem(User $user, array $args): string
    {
        $item = $this->items($user)->find($args['item_id'] ?? null);
        if (! $item) {
            return 'Error: no accessible item with that id. Call list_items to get valid ids.';
        }
        $fridge = $item->section?->fridge;
        if (! $fridge) {
            return 'Error: that item is not in a fridge I can reach.';
        }

        $changes = [];
        if (isset($args['section']) && trim((string) $args['section']) !== '') {
            $section = $this->sectionFor($fridge, $args['section'], $item->location ?? 'fridge');
            $item->section_id = $section->id;
            $changes[] = "section={$section->name}";
        }
        if (isset($args['location']) && in_array($args['location'], ['fridge', 'freezer', 'pantry'], true)) {
            $item->location = $args['location'];
            $changes[] = "location={$args['location']}";
        }
        if (! $changes) {
            return 'Error: pass a section and/or a location to move it to.';
        }

        $item->save();
        $this->mutated = true;

        return "Moved \"{$item->name}\": ".implode(', ', $changes).'.';
    }

    private function shoppingMatch(User $user, array $args, bool $uncheckedOnly = false): ?ShoppingItem
    {
        $q = ShoppingItem::whereIn('fridge_id', $this->fridgeIds($user));

        if (isset($args['shopping_id'])) {
            return $q->find((int) $args['shopping_id']);
        }

        $name = trim((string) ($args['name'] ?? ''));
        if ($name === '') {
            return null;
        }

        return $q->when($uncheckedOnly, fn ($x) => $x->where('checked', false))
            ->whereRaw('lower(name) like ?', ['%'.Str::lower($name).'%'])
            ->orderBy('created_at')
            ->first();
    }

    private function checkOffShopping(User $user, array $args): string
    {
        $item = $this->shoppingMatch($user, $args, uncheckedOnly: true);
        if (! $item) {
            return 'Error: no matching unchecked shopping-list item. Call list_shopping for ids.';
        }

        $item->update(['checked' => true]);
        $this->mutated = true;

        return "Checked \"{$item->name}\" off the shopping list.";
    }

    private function removeFromShopping(User $user, array $args): string
    {
        $item = $this->shoppingMatch($user, $args);
        if (! $item) {
            return 'Error: no matching shopping-list item. Call list_shopping for ids.';
        }

        $name = $item->name;
        $item->delete();
        $this->mutated = true;

        return "Removed \"{$name}\" from the shopping list.";
    }

    private function rememberFact(User $user, array $args): string
    {
        $fact = trim((string) ($args['fact'] ?? ''));
        if ($fact === '') {
            return 'Error: a fact is required.';
        }
        if (Str::length($fact) > 80) {
            $fact = Str::limit($fact, 77);
        }

        $memory = $user->userMemory()->firstOrCreate([], ['facts' => []]);
        $facts = $memory->facts ?? [];

        foreach ($facts as $existing) {
            if (Str::lower(trim((string) $existing)) === Str::lower($fact)) {
                return "Already remembered: \"{$fact}\".";
            }
        }

        $facts[] = $fact;
        $memory->update(['facts' => array_values(array_slice($facts, -8))]);
        $this->mutated = true;

        return "Got it - I'll remember: \"{$fact}\".";
    }

    /**
     * Saved without the meal_type/vibes/food_focus "what to eat" tags - those come from an
     * extra model call (RecipeController::store) that would make AgentToolbox depend on
     * AgentService circularly. Tags are advisory only; the user can re-save from the app to
     * get them.
     */
    private function saveRecipe(User $user, array $args): string
    {
        $name = trim((string) ($args['name'] ?? ''));
        $minutes = (int) ($args['minutes'] ?? 0);

        $clean = fn ($v, int $max) => array_values(array_filter(
            array_map(fn ($x) => Str::limit(trim((string) $x), $max, ''), is_array($v) ? $v : []),
            fn ($x) => $x !== ''
        ));
        $ingredients = $clean($args['ingredients'] ?? null, 255);
        $steps = $clean($args['steps'] ?? null, 1000);

        if ($name === '' || $minutes < 1 || ! $ingredients || ! $steps) {
            return 'Error: need a name, minutes (>= 1), at least one ingredient, and at least one step.';
        }

        $category = in_array($args['category'] ?? null, self::RECIPE_CATEGORIES, true) ? $args['category'] : null;

        $recipe = $user->recipes()->create([
            'name' => Str::limit($name, 255, ''),
            'minutes' => min(1440, $minutes),
            'category' => $category,
            'ingredients' => array_map(fn ($i) => ['name' => $i, 'icon' => $this->guessIcon($i) ?? 'leftovers'], $ingredients),
            'steps' => $steps,
            'made_count' => 0,
        ]);
        $this->mutated = true;

        return "Saved \"{$recipe->name}\" to your recipe book (#{$recipe->id}, {$recipe->minutes}m, ".count($ingredients).' ingredients).';
    }

    private function markRecipeMade(User $user, array $args): string
    {
        $recipe = $this->recipesFor($user)->find($args['recipe_id'] ?? null);
        if (! $recipe) {
            return 'Error: no recipe with that id. Call list_recipes for valid ids.';
        }

        $recipe->increment('made_count');
        $this->mutated = true;

        return "Logged that you made \"{$recipe->name}\" ({$recipe->made_count}x now). ".
            "I didn't touch your inventory - tell me which ingredients you used up if you want those logged.";
    }

    private function importRecipeFromLink(array $args): string
    {
        $url = trim((string) ($args['url'] ?? ''));
        if ($url === '' || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return 'Error: a valid http(s) URL is required.';
        }

        $result = $this->recipeImport->importFromUrl($url);

        if (! ($result['found'] ?? false)) {
            return "Couldn't get a recipe from that link (".($result['reason'] ?? 'unknown').'). '.
                'Ask the user to paste the recipe text instead.';
        }

        $r = $result['recipe'];
        $ings = collect($r['ingredients'] ?? [])->pluck('name')->implode(', ');
        $steps = collect($r['steps'] ?? [])->values()->map(fn ($s, $n) => ($n + 1).'. '.$s)->implode("\n");

        return "Found: {$r['name']} ({$r['minutes']}m)\nIngredients: {$ings}\n\nSteps:\n{$steps}\n\n".
            'To keep it, call save_recipe with these values.';
    }

    // ---- helpers --------------------------------------------------------------

    private function fridgeIds(User $user)
    {
        return $user->memberFridges()->pluck('fridges.id');
    }

    /** Find a section by (case-insensitive) name in the fridge, creating it - or the fridge's
     *  first section, or a new one named after the location - when no name is given. */
    private function sectionFor(Fridge $fridge, ?string $name, string $location): Section
    {
        $name = trim((string) ($name ?? ''));

        if ($name !== '') {
            return $fridge->sections()->whereRaw('lower(name) = ?', [Str::lower($name)])->first()
                ?? $fridge->sections()->create(['name' => Str::limit($name, 255, '')]);
        }

        return $fridge->sections()->orderBy('position')->orderBy('id')->first()
            ?? $fridge->sections()->create(['name' => ucfirst($location)]);
    }

    /** Rough curated-icon guess for a food name; null when nothing matches. */
    private function guessIcon(string $name): ?string
    {
        $q = Str::lower(trim($name));
        if ($q === '') {
            return null;
        }

        $best = null;
        $bestLen = 0;
        foreach (self::CURATED_ICON_KEYWORDS as $key => $keywords) {
            foreach ($keywords as $kw) {
                if (strlen($kw) > $bestLen && str_contains($q, $kw)) {
                    $best = $key;
                    $bestLen = strlen($kw);
                }
            }
        }

        return $best;
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
