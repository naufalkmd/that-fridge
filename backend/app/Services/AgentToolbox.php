<?php

namespace App\Services;

use App\Models\Fridge;
use App\Models\FridgeNote;
use App\Models\Item;
use App\Models\Machine;
use App\Models\Recipe;
use App\Models\Section;
use App\Models\ShoppingItem;
use App\Models\User;
use App\Models\UserBadge;
use App\Support\FoodIconMatcher;
use App\Support\ItemFreshness;
use App\Support\ItemPayload;
use App\Support\MachineSchedule;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * The tools Quick Chat's agents can call to read and act on the user's kitchen. Everything
 * runs server-side AS the authenticated user and is scoped to fridges they're a member of -
 * same authorisation as the REST endpoints. Read tools execute freely; low-stakes writes
 * (add/move an item, adjust one, mark it used, shopping-list edits, remembered facts,
 * saving a recipe) execute directly since they're all easily reversible; every delete
 * (remove_item, clear_expired_items, delete_recipe, remove_note) takes a `confirm` flag and
 * returns a preview first, so the agent has to check with the user before anything is deleted.
 *
 * The same tool vocabulary also backs Kitchen Lab "Machines" - a saved, named, triggerable
 * sequence of these same calls, replayed on a schedule/event with no model in the loop.
 * `$surface` ('chat' or 'machine') controls which tools are even offered/dispatchable - see
 * MACHINE_TOOLS below. A Machine runs unattended, so its tool set deliberately excludes:
 * (a) every confirm-gated or ungated delete (remove_item, remove_note, clear_expired_items,
 * delete_recipe, remove_from_shopping, forget_fact) - confirm-then-wait is enforced only by
 * instruction to the model in getSystemPrompt, which means nothing when replayed with nobody
 * watching; (b) every tool that targets one saved item_id (update_item, move_item,
 * mark_item_used, check_off_shopping, update_note) - a resolved id goes stale the moment
 * that stock item is used up and replaced (mark_recipe_made is exempt from this bucket
 * despite once being grouped here - it only ever resolves recipe_id, never an item_id, and
 * hasn't touched inventory at all since the recipe consumption-plan feature was removed);
 * (c) fetch_url/
 * import_recipe_from_link - an outbound request on a schedule is a fresh SSRF surface and a
 * result that differs run to run, the opposite of what a Machine promises; (d) everything
 * else with no automation value at replay time - pure-chat bookkeeping (remember_fact,
 * list_facts, save_recipe) and reads nobody would want as a scheduled step's output
 * (list_fridges, list_recipes, get_recipe, list_notes, list_badges,
 * get_credits_balance). notify_user is the mirror image - Machine-only, never offered in chat,
 * since the chat reply already IS the user-facing output there, and offering it in chat would
 * let a page read via fetch_url potentially prompt-inject push-notification spam through a
 * tool call. create_machine is chat-only for a sharper reason than (d) above: letting a
 * Machine's own step create ANOTHER Machine is a runaway-automation risk (a chain of Machines
 * each spawning the next), not just a low-value replay - excluded outright, not just
 * uninteresting to replay.
 *
 * See AgentService::runWithTools for the loop that drives these.
 */
class AgentToolbox
{
    /** Set true by a write method only when it actually touched the DB; read back in run(). */
    private bool $mutated = false;

    /** Set by a tool that produces a clean value worth inserting into a later Machine step
     *  (e.g. sum_item_field's total) - read back in run(); null for everything else. */
    private ?string $value = null;

    /**
     * Set by a write tool that knows how to reverse itself - read back in run() and, for a
     * Machine step, persisted into that step's MachineRun row so MachineRunner::undo() can
     * replay it later. Shape is {"tool": <same tool name>, ...whatever that tool's own
     * undoStep() branch expects}; null for anything not undoable (reads, notify_user,
     * mark_recipe_made - see MachineRunner::undo's docblock for why those are out of scope).
     * Only ever meaningful on the 'machine' surface - undo is a Kitchen Lab concept, chat has
     * no equivalent "undo my last message" affordance to wire it into.
     */
    private ?array $undo = null;

    /**
     * Tools a Machine may call unattended - see the class docblock for the exclusion
     * reasoning. Anything not listed here is refused on the 'machine' surface even if a
     * Machine's saved steps somehow name it (enforced in run(), not just schemas()).
     */
    private const MACHINE_TOOLS = [
        'list_items', 'list_shopping', 'get_kitchen_score',
        'sum_item_field', 'notify_user',
        'add_to_shopping', 'add_note', 'add_item', 'bulk_add_items', 'mark_recipe_made',
        'mark_items_used_matching',
    ];

    /** Offered ONLY on the 'machine' surface, never in chat - see the class docblock. */
    private const MACHINE_ONLY_TOOLS = ['notify_user'];

    private const RECIPE_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'quick'];

    /**
     * Display metadata for list_badges - keys/thresholds are BadgeService::BADGES; label/
     * description mirror apps/web/lib/thatfridge/badges.ts's BADGE_CATALOG (a third copy of the
     * same catalog, following that file's own precedent of duplicating BadgeService's keys
     * rather than this toolbox depending on frontend copy). Keep all three in sync.
     */
    private const BADGE_CATALOG = [
        'rescued_10' => ['label' => 'Item Rescuer', 'description' => 'Marked 10 items used via a recipe while they still had 3 days or less left.'],
        'first_link_recipe' => ['label' => 'Link Master', 'description' => 'Imported your first recipe straight from a link.'],
        'full_week_variety' => ['label' => 'Balanced Plate', 'description' => 'Hit all 5 food groups in your Food Balance score.'],
        'zero_waste_week' => ['label' => 'Zero Waste Week', 'description' => 'Had nothing overdue at a weekly check-in.'],
    ];

    public function __construct(
        protected KitchenScoreService $kitchenScore,
        protected RecipeLinkImportService $recipeImport,
        protected CreditService $credits,
    ) {}

    /**
     * OpenAI function-tool schemas, filtered to what's usable on `$surface` ('chat' or
     * 'machine' - see the class docblock and MACHINE_TOOLS/MACHINE_ONLY_TOOLS). `$fridgeId`
     * is the chat's active fridge; writes default to it (or the user's own fridge when
     * chatting across all of them).
     */
    public function schemas(string $surface = 'chat'): array
    {
        $fn = fn (string $name, string $description, array $properties, array $required = []) => [
            'type' => 'function',
            'function' => [
                'name' => $name,
                'description' => $description,
                'parameters' => ['type' => 'object', 'properties' => (object) $properties, 'required' => $required],
            ],
        ];

        $all = [
            $fn('list_items', "List the food items in the user's fridge(s), newest first. Use this instead of guessing what they have - the short inventory summary in your context is truncated and lacks IDs, quantities and locations. Each row also shows weight and calories when set - these are PER SINGLE UNIT, not multiplied by quantity, so '3x · 500g each' means 500g per unit with 3 in stock, 1500g total - and any custom fields (label/value pairs like a batch code or supplier), capped at 5 shown per item.", [
                'expired_only' => ['type' => 'boolean', 'description' => 'Only items already past their date.'],
                'expiring_within_days' => ['type' => 'integer', 'description' => 'Only items expiring within this many days (0 = today or overdue).'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
                'search' => ['type' => 'string', 'description' => 'Case-insensitive name substring.'],
                'fridge_id' => ['type' => 'integer', 'description' => 'From list_fridges. Omit to include every fridge the user belongs to.'],
            ]),
            $fn('list_notes', 'List the sticky notes on the fridge(s) - free-text reminders household members leave for each other.', []),
            $fn('list_shopping', 'List what is currently on the shopping list, with any buy links.', []),
            $fn('list_recipes', "List the user's saved recipes (name, minutes, ingredient names). Use it to answer \"what can I make\" from real recipes rather than inventing one.", [
                'search' => ['type' => 'string', 'description' => 'Case-insensitive name substring.'],
            ]),
            $fn('add_to_shopping', 'Add one item to the shopping list.', [
                'name' => ['type' => 'string'],
                'section' => ['type' => 'string', 'description' => 'Aisle/section label, e.g. "produce", "dairy". Defaults to "other".'],
                'shop_url' => ['type' => 'string', 'description' => 'Optional http(s) link to buy it - e.g. a product page you found while browsing.'],
            ], ['name']),
            $fn('add_note', 'Leave a sticky note on the fridge for household members.', [
                'text' => ['type' => 'string'],
                'color' => ['type' => 'string', 'enum' => FridgeNote::COLORS, 'description' => 'Optional accent colour; defaults to amber.'],
            ], ['text']),
            $fn('remove_note', 'Delete a sticky note. Pass note_id from list_notes, or a text fragment to match - if the fragment matches more than one note it will not guess, so read them back and ask which. Call once with confirm:false to preview, then again with confirm:true only after the user agrees.', [
                'note_id' => ['type' => 'integer'],
                'text' => ['type' => 'string', 'description' => 'Case-insensitive fragment of the note text. Only used when note_id is omitted.'],
                'confirm' => ['type' => 'boolean', 'description' => 'Must be true to actually delete. Never set true without explicit user agreement in the conversation.'],
            ]),
            $fn('update_item', 'Change one or more fields on an item: name, quantity, whether it is opened, its expiry date, its storage location, its food group, its weight/calories, custom fields, a personal note, or a buy-again link. Get the item_id from list_items first. NOTE here means a short text field on the item itself (e.g. "2 loaves", "for Sunday") - it is NOT the same thing as add_note/list_notes/update_note/remove_note, which are separate sticky notes shared on the whole fridge for the household to see. If the user says "leave a note on this item" or similar, they mean THIS note field via update_item, not a fridge-wide sticky note.', [
                'item_id' => ['type' => 'integer'],
                'name' => ['type' => 'string', 'description' => 'Rename the item.'],
                'quantity' => ['type' => 'integer', 'description' => 'New quantity (>= 1). To use an item up entirely, call mark_item_used instead.'],
                'opened' => ['type' => 'boolean'],
                'expiry_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD.'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
                'category' => ['type' => 'string', 'enum' => ['protein', 'vegetables', 'fruit', 'grains', 'dairy', 'other_extras'], 'description' => 'Food group (feeds the Food Balance score).'],
                'note' => ['type' => 'string', 'description' => 'A short personal note on this specific item, e.g. "2 loaves" or "for Sunday\'s dinner". Empty string clears it. Not a fridge-wide sticky note.'],
                'shop_url' => ['type' => 'string', 'description' => 'An http(s) link to buy this item again. Empty string clears it.'],
                'weight' => ['type' => ['number', 'null'], 'description' => 'Weight/volume of ONE unit (not the total across quantity). Always pass weight_unit in the SAME call. Pass null to clear both.'],
                'weight_unit' => ['type' => 'string', 'enum' => ItemPayload::WEIGHT_UNITS, 'description' => 'Required whenever weight is set.'],
                'calories' => ['type' => ['integer', 'null'], 'description' => 'Total kcal for ONE unit (0-100000, not multiplied by quantity). Pass null to clear.'],
                'set_custom_fields' => [
                    'type' => 'array',
                    'description' => 'Add or edit named custom fields (e.g. "Batch code", "Supplier") without touching any other existing field. Matches by label, case-insensitive. An empty value removes that field. To read the current fields first, use list_items.',
                    'items' => [
                        'type' => 'object',
                        'properties' => (object) [
                            'label' => ['type' => 'string'],
                            'value' => ['type' => 'string', 'description' => 'Empty string removes this field.'],
                        ],
                        'required' => ['label'],
                    ],
                ],
            ], ['item_id']),
            $fn('bulk_add_items', 'Add several food items to the fridge in one call - use this for a grocery haul instead of calling add_item many times.', [
                'items' => [
                    'type' => 'array',
                    'description' => 'Up to 30 items. Each needs a name; location/expiry_date/section are optional, but set shelf_life_days per item using ordinary food knowledge (milk ~7, bread ~5-7, fresh produce ~5-10, canned/dry goods ~180-365) unless the user gave an exact date - never leave every item dateless or default to today.',
                    'items' => [
                        'type' => 'object',
                        'properties' => (object) [
                            'name' => ['type' => 'string'],
                            'quantity' => ['type' => 'integer'],
                            'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
                            'expiry_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD. Only for a specific calendar date the user gave - otherwise use shelf_life_days.'],
                            'shelf_life_days' => ['type' => 'integer', 'description' => 'Your own estimate of typical days until it goes off - prefer this over expiry_date whenever there is no exact date.'],
                            'section' => ['type' => 'string'],
                            'weight' => ['type' => 'number', 'description' => 'Weight/volume of ONE unit. Needs weight_unit alongside it.'],
                            'weight_unit' => ['type' => 'string', 'enum' => ItemPayload::WEIGHT_UNITS],
                            'calories' => ['type' => 'integer', 'description' => 'kcal for ONE unit (0-100000).'],
                        ],
                        'required' => ['name'],
                    ],
                ],
                'fridge_id' => ['type' => 'integer', 'description' => 'From list_fridges. Omit for the active/default fridge.'],
            ], ['items']),
            $fn('update_note', 'Edit an existing sticky note - its text and/or colour. Get note_id from list_notes.', [
                'note_id' => ['type' => 'integer'],
                'text' => ['type' => 'string'],
                'color' => ['type' => 'string', 'enum' => FridgeNote::COLORS],
            ], ['note_id']),
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
            $fn('list_badges', "List every badge - which ones the user has earned (and when), and progress toward the ones they haven't. Use it when they ask what badges they have, or how close they are to one.", []),
            $fn('get_credits_balance', 'The user\'s current AI-credit balance - how many actions they have left before Pro/top-up is needed. Use it when they ask how many credits they have.', []),
            $fn('get_kitchen_score', "The user's current Kitchen Score - all four sub-scores (Waste Saver, Food Balance, Tidiness, Shopping List, each 0-100 or \"not enough data yet\") and how many items are overdue right now. Use it when they ask how they're doing.", []),
            $fn('get_recipe', 'The full detail of one saved recipe - every ingredient and every step. list_recipes only gives names, so call this when the user actually wants to cook one.', [
                'recipe_id' => ['type' => 'integer'],
            ], ['recipe_id']),
            $fn('add_item', "Add a food item to the user's inventory. Guesses an icon from the name. Goes to the fridge named in fridge_id, else the chat's active fridge, else their default one. Always set shelf_life_days unless the user gave an exact date or truly said nothing datable (e.g. a non-perishable with no sensible shelf life) - estimate it yourself from ordinary food knowledge (milk ~7, bread ~5-7, fresh leafy greens ~5, canned/dry goods ~180-365) rather than defaulting to today or leaving it blank; expiry alerts are useless without a real estimate.", [
                'name' => ['type' => 'string'],
                'quantity' => ['type' => 'integer', 'description' => 'Defaults to 1.'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry'], 'description' => 'Defaults to fridge.'],
                'expiry_date' => ['type' => 'string', 'description' => 'YYYY-MM-DD. Only when the user gave (or clearly implied) a specific calendar date - otherwise use shelf_life_days instead, never guess an absolute date yourself.'],
                'shelf_life_days' => ['type' => 'integer', 'description' => 'Days from today until it typically goes off. Your own best estimate for this food, not only for when the user mentions a rough timeframe - prefer this over expiry_date whenever there is no exact date.'],
                'section' => ['type' => 'string', 'description' => 'Shelf / section label, e.g. "Produce", "Door". Created if new.'],
                'fridge_id' => ['type' => 'integer', 'description' => 'From list_fridges. Omit for the active/default fridge.'],
                'weight' => ['type' => 'number', 'description' => 'Weight/volume of ONE unit, e.g. from a package label. Needs weight_unit alongside it.'],
                'weight_unit' => ['type' => 'string', 'enum' => ItemPayload::WEIGHT_UNITS],
                'calories' => ['type' => 'integer', 'description' => 'kcal for ONE unit (0-100000).'],
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
            $fn('list_facts', 'List everything you currently remember about this user (from remember_fact). Use it when they ask what you know / remember about them.', []),
            $fn('forget_fact', 'Delete one remembered fact. Pass its index from list_facts, or a text fragment to match.', [
                'index' => ['type' => 'integer'],
                'text' => ['type' => 'string', 'description' => 'Fragment of the fact. Only used when index is omitted.'],
            ]),
            $fn('delete_recipe', "Permanently delete one of the user's OWN saved recipes (not curated ones). Call once with confirm:false to preview, then again with confirm:true only after they agree.", [
                'recipe_id' => ['type' => 'integer'],
                'confirm' => ['type' => 'boolean', 'description' => 'Must be true to actually delete. Never set true without explicit user agreement.'],
            ], ['recipe_id']),
            $fn('save_recipe', "Save a new recipe to the user's recipe book - use it when they ask you to keep a dish you described, or they dictate one. Ingredients and steps are plain strings.", [
                'name' => ['type' => 'string'],
                'minutes' => ['type' => 'integer', 'description' => 'Total time in minutes.'],
                'ingredients' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Ingredient lines, e.g. "2 eggs", "100g spinach".'],
                'steps' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Ordered steps.'],
                'category' => ['type' => 'string', 'enum' => self::RECIPE_CATEGORIES],
            ], ['name', 'minutes', 'ingredients', 'steps']),
            $fn('mark_recipe_made', 'Record that the user cooked a recipe - bumps its made count (feeds "something new" suggestions). Get recipe_id from list_recipes. Does not touch inventory - use mark_item_used/update_item for ingredients they finished.', [
                'recipe_id' => ['type' => 'integer'],
            ], ['recipe_id']),
            $fn('import_recipe_from_link', 'Read a recipe from a URL the user shared and return its name, ingredients and steps. Follow up with save_recipe if they want it kept. Only use a URL the user actually provided.', [
                'url' => ['type' => 'string'],
            ], ['url']),
            $fn('sum_item_field', "Compute a precise total across matching items - use this instead of adding up list_items' rows yourself. It exists because a Machine replaying this later has no model to eyeball a total with, so it needs deterministic math computed by the server, not by you reading numbers off a list. 'quantity' sums the plain unit count. 'weight', 'calories', and 'custom' are MULTIPLIED BY QUANTITY - i.e. the total amount in stock, not per-unit (the opposite convention from list_items' per-unit display). 'custom' sums a user-defined custom field by label (custom_field_label, case-insensitive) - only items with that label set to a numeric value count, the rest are skipped. A weight sum never mixes mass and volume: the target unit you pass decides which system it sums (g/kg/mg/oz/lb are mass, ml/l are volume) - items measured in the other system, or with no weight set, are excluded and reported as skipped, never estimated.", [
                'field' => ['type' => 'string', 'enum' => self::FIELDS],
                'custom_field_label' => ['type' => 'string', 'description' => 'The custom field label to sum, case-insensitive (e.g. "Cost"). Required when field is custom.'],
                'unit' => ['type' => 'string', 'enum' => ItemPayload::WEIGHT_UNITS, 'description' => 'Required when field is weight - the unit to sum into, e.g. "kg" totals every mass-measured matching item converted to kg. Ignored otherwise.'],
                'expired_only' => ['type' => 'boolean', 'description' => 'Only items already past their date.'],
                'expiring_within_days' => ['type' => 'integer', 'description' => 'Only items expiring within this many days (0 = today or overdue).'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
                'search' => ['type' => 'string', 'description' => 'Case-insensitive name substring.'],
                'fridge_id' => ['type' => 'integer', 'description' => 'From list_fridges. Omit to include every fridge the user belongs to.'],
            ], ['field']),
            $fn('mark_items_used_matching', "Mark EVERY item matching a filter as used, logging each to usage history - the filter (same args as sum_item_field/list_items) is re-evaluated fresh every time this runs, so unlike mark_item_used it never references a stale saved item_id and is safe for unattended Kitchen Lab automation. Fully consumes each match (no partial quantities). You MUST pass at least one filter - this refuses to run with none, so 'mark everything used' can never happen by an empty filter falling through.", [
                'expired_only' => ['type' => 'boolean', 'description' => 'Only items already past their date.'],
                'expiring_within_days' => ['type' => 'integer', 'description' => 'Only items expiring within this many days (0 = today or overdue).'],
                'location' => ['type' => 'string', 'enum' => ['fridge', 'freezer', 'pantry']],
                'search' => ['type' => 'string', 'description' => 'Case-insensitive name substring.'],
                'fridge_id' => ['type' => 'integer', 'description' => 'From list_fridges. Omit to include every fridge the user belongs to.'],
            ]),
            $fn('create_machine', "Set up a Kitchen Lab \"Machine\" - a recurring automation with a trigger (a schedule, an item being added, a value crossing a threshold, or a recipe being marked made) and a fixed list of steps that run on their own after that, no chat involved. Use this whenever the user describes something they want to happen automatically or repeatedly (\"every morning tell me...\", \"whenever milk is added...\", \"when stock drops below...\", \"whenever I mark a recipe made...\") rather than something they want done right now. Pass their own description straight through in prompt - the trigger and steps are worked out automatically from it, same as Kitchen Lab's own \"AI draft\". The Machine is created OFF by default (same as building one in Kitchen Lab) - tell the user to review it and turn it on from Kitchen Lab when they're ready; it will not run until they do.", [
                'prompt' => ['type' => 'string', 'description' => 'The automation described in the user\'s own words, e.g. "every Sunday at 9am, tell me total calories expiring this week".'],
            ], ['prompt']),
            $fn('notify_user', "Send the user a push/in-app notification right now. This is the ONLY way for a Machine step to surface something to them outside of a live chat reply - never call it in chat itself, since the chat reply you're about to send already IS the output there.", [
                'message' => ['type' => 'string', 'description' => 'Up to 240 characters. Can reference an earlier step\'s result, e.g. "Expiring soon: {step1}".'],
                'title' => ['type' => 'string', 'description' => 'Up to 60 characters. Optional - defaults to a generic title.'],
            ], ['message']),
        ];

        return array_values(array_filter(
            $all,
            fn ($tool) => self::toolAllowedOn($tool['function']['name'], $surface)
        ));
    }

    /** Whether `$name` may run on `$surface` ('chat' or 'machine') - see MACHINE_TOOLS/
     *  MACHINE_ONLY_TOOLS and the class docblock. Filters schemas() (what the model sees)
     *  AND is re-checked in run() (what actually dispatches), since schema filtering alone
     *  only controls the model's menu, not a hand-edited or tampered Machine step list. */
    public static function toolAllowedOn(string $name, string $surface): bool
    {
        if ($surface === 'machine') {
            return in_array($name, self::MACHINE_TOOLS, true);
        }

        return ! in_array($name, self::MACHINE_ONLY_TOOLS, true);
    }

    /**
     * @return array{content: string, mutated: bool, ok: bool, value: ?string}
     */
    public function run(string $name, array $args, User $user, ?int $fridgeId, string $surface = 'chat'): array
    {
        $this->mutated = false;
        $this->value = null;
        $this->undo = null;

        if (! self::toolAllowedOn($name, $surface)) {
            return ['content' => "Error: \"{$name}\" isn't available on the {$surface} surface.", 'mutated' => false, 'ok' => false, 'value' => null, 'undo' => null];
        }

        try {
            $content = match ($name) {
                'list_items' => $this->listItems($user, $args),
                'list_notes' => $this->listNotes($user),
                'list_shopping' => $this->listShopping($user),
                'list_recipes' => $this->listRecipes($user, $args),
                'add_to_shopping' => $this->addToShopping($user, $fridgeId, $args),
                'add_note' => $this->addNote($user, $fridgeId, $args),
                'remove_note' => $this->removeNote($user, $args),
                'update_note' => $this->updateNote($user, $args),
                'update_item' => $this->updateItem($user, $args),
                'bulk_add_items' => $this->bulkAddItems($user, $fridgeId, $args),
                'mark_item_used' => $this->markItemUsed($user, $args),
                'mark_items_used_matching' => $this->markItemsUsedMatching($user, $args),
                'remove_item' => $this->removeItem($user, $args),
                'clear_expired_items' => $this->clearExpired($user, $fridgeId, $args),
                'list_fridges' => $this->listFridges($user),
                'list_badges' => $this->listBadges($user),
                'get_credits_balance' => $this->getCreditsBalance($user),
                'get_kitchen_score' => $this->getKitchenScore($user),
                'get_recipe' => $this->getRecipe($user, $args),
                'add_item' => $this->addItem($user, $fridgeId, $args),
                'move_item' => $this->moveItem($user, $args),
                'check_off_shopping' => $this->checkOffShopping($user, $args),
                'remove_from_shopping' => $this->removeFromShopping($user, $args),
                'remember_fact' => $this->rememberFact($user, $args),
                'list_facts' => $this->listFacts($user),
                'forget_fact' => $this->forgetFact($user, $args),
                'save_recipe' => $this->saveRecipe($user, $args),
                'mark_recipe_made' => $this->markRecipeMade($user, $args),
                'delete_recipe' => $this->deleteRecipe($user, $args),
                'import_recipe_from_link' => $this->importRecipeFromLink($args),
                'sum_item_field' => $this->sumItemField($user, $args),
                'notify_user' => $this->notifyUser($user, $fridgeId, $args),
                'create_machine' => $this->createMachine($user, $fridgeId, $args),
                default => "Error: unknown tool \"{$name}\".",
            };
        } catch (\Throwable $e) {
            return ['content' => 'Error running that tool: '.$e->getMessage(), 'mutated' => false, 'ok' => false, 'value' => null, 'undo' => null];
        }

        return [
            'content' => $content,
            'mutated' => $this->mutated,
            'ok' => ! str_starts_with($content, 'Error'),
            'value' => $this->value,
            'undo' => $this->undo,
        ];
    }

    /** Tools preview() never mutates for, even though run() would - the write half of
     *  MACHINE_TOOLS. Reads (list_items/list_shopping/get_kitchen_score/sum_item_field)
     *  aren't listed here: they already never write, so preview() just runs them for real
     *  via run() rather than duplicating their logic. */
    private const DRY_RUN_PREVIEWABLE = [
        'notify_user', 'add_to_shopping', 'add_note', 'add_item', 'bulk_add_items',
        'mark_recipe_made', 'mark_items_used_matching',
    ];

    /**
     * MachineRunner's dry-run mode: evaluates one step the same way run() would - same
     * validation, same filters, same lookups - but a write tool reports what it *would* do
     * instead of doing it. Never touches the database for a write tool, never sends a real
     * notification (see previewNotifyUser), and never mutates $this->mutated/$this->value,
     * so a caller can't mistake a preview for a real result. Machine-only, same as run()'s
     * 'machine' surface - a dry run only ever makes sense for a Machine's own steps.
     */
    public function preview(string $name, array $args, User $user, ?int $fridgeId): array
    {
        if (! self::toolAllowedOn($name, 'machine')) {
            return ['content' => "Error: \"{$name}\" isn't available on the machine surface.", 'ok' => false, 'value' => null];
        }

        // Read-only tools never write, regardless of surface - run them for real (more
        // accurate, and keeps their `value` correct for a later step's condition/placeholder
        // to preview against) rather than duplicating their logic into a second, hand-kept
        // "preview" implementation.
        if (! in_array($name, self::DRY_RUN_PREVIEWABLE, true)) {
            $result = $this->run($name, $args, $user, $fridgeId, 'machine');

            return ['content' => $result['content'], 'ok' => $result['ok'], 'value' => $result['value']];
        }

        $this->value = null;

        try {
            $content = match ($name) {
                'notify_user' => $this->previewNotifyUser($args),
                'add_to_shopping' => $this->previewAddToShopping($args),
                'add_note' => $this->previewAddNote($args),
                'add_item' => $this->previewAddItem($args),
                'bulk_add_items' => $this->previewBulkAddItems($args),
                'mark_recipe_made' => $this->previewMarkRecipeMade($user, $args),
                // The one previewable tool a later step's condition can reference (see
                // MachineDraftValidator::VALUE_PRODUCING_TOOLS) - sets $this->value itself,
                // same convention run()'s own mark_items_used_matching handler uses.
                'mark_items_used_matching' => $this->previewMarkItemsUsedMatching($user, $args),
            };
        } catch (\Throwable $e) {
            return ['content' => 'Error previewing that step: '.$e->getMessage(), 'ok' => false, 'value' => null];
        }

        return ['content' => $content, 'ok' => ! str_starts_with($content, 'Error'), 'value' => $this->value];
    }

    private function previewNotifyUser(array $args): string
    {
        $message = trim((string) ($args['message'] ?? ''));
        if ($message === '') {
            return 'Error: message is required.';
        }

        return 'Would notify: "'.Str::limit($message, 240, '').'".';
    }

    private function previewAddToShopping(array $args): string
    {
        $name = trim((string) ($args['name'] ?? ''));
        if ($name === '') {
            return 'Error: a name is required.';
        }

        return "Would add \"{$name}\" to the shopping list.";
    }

    private function previewAddNote(array $args): string
    {
        $text = trim((string) ($args['text'] ?? ''));
        if ($text === '') {
            return 'Error: note text is required.';
        }

        return 'Would leave a note: "'.Str::limit($text, 500, '').'".';
    }

    private function previewAddItem(array $args): string
    {
        $name = trim((string) ($args['name'] ?? ''));
        if ($name === '') {
            return 'Error: a name is required.';
        }

        $qty = max(1, (int) ($args['quantity'] ?? 1));
        $location = in_array($args['location'] ?? null, ['fridge', 'freezer', 'pantry'], true)
            ? $args['location'] : 'fridge';
        $shelfLife = is_numeric($args['shelf_life_days'] ?? null) ? (int) $args['shelf_life_days'] : null;

        return "Would add \"{$name}\" ({$qty}x) to the {$location}".
            ($shelfLife !== null ? ", ~{$shelfLife}d shelf life" : '').'.';
    }

    private function previewBulkAddItems(array $args): string
    {
        $specs = is_array($args['items'] ?? null) ? $args['items'] : [];
        $names = [];
        foreach (array_slice($specs, 0, 30) as $spec) {
            if (is_array($spec) && trim((string) ($spec['name'] ?? '')) !== '') {
                $names[] = trim($spec['name']);
            }
        }

        if ($names === []) {
            return 'Error: pass an "items" array, each entry with at least a name.';
        }

        return 'Would add: '.implode(', ', $names).'.';
    }

    private function previewMarkRecipeMade(User $user, array $args): string
    {
        $recipe = $this->recipesFor($user)->find($args['recipe_id'] ?? null);
        if (! $recipe) {
            return 'Error: no recipe with that id. Call list_recipes for valid ids.';
        }

        return "Would log \"{$recipe->name}\" as made ({$recipe->made_count}x \u{2192} ".($recipe->made_count + 1).'x).';
    }

    /** Mirrors markItemsUsedMatching's own filter-and-guard logic exactly, but stops right
     *  before the delete()/recordUsage() loop - the one MACHINE_TOOLS entry a dry run most
     *  needs to protect against, since it's an unattended-automation-safe bulk delete. */
    private function previewMarkItemsUsedMatching(User $user, array $args): string
    {
        if (! $this->hasItemFilter($args)) {
            return 'Error: pass at least one filter (search, location, expired_only, expiring_within_days, or fridge_id) - this cannot run against every item.';
        }

        $items = $this->filteredItems($user, $args, null);
        if ($items->isEmpty()) {
            $this->value = '0';

            return 'Would mark 0 items as used - nothing currently matches this filter.';
        }

        $names = $items->map(fn ($row) => $row['model']->name)->all();
        $this->value = (string) count($names);
        $shown = array_slice($names, 0, 10);
        $rest = count($names) - count($shown);

        return 'Would mark '.count($names).' item'.(count($names) === 1 ? '' : 's').' as used: '.
            implode(', ', $shown).($rest > 0 ? " (+{$rest} more)" : '').'.';
    }

    /**
     * Reverses one step's recorded undo payload - the shape each tool writes into $this->undo
     * (see that property's docblock). Called by MachineRunner::undo() for each undoable step
     * in a saved run, most-recent-first. Best-effort throughout: something already gone
     * (deleted since, moved to a fridge the user no longer belongs to) is skipped rather than
     * failing the whole undo - a partial rollback still beats none.
     */
    public function undoStep(array $undo, User $user): string
    {
        return match ($undo['tool'] ?? null) {
            'add_item', 'bulk_add_items' => $this->undoAddItem($undo, $user),
            'add_to_shopping' => $this->undoAddToShopping($undo, $user),
            'add_note' => $this->undoAddNote($undo, $user),
            'mark_items_used_matching' => $this->undoMarkItemsUsedMatching($undo, $user),
            default => 'Nothing to undo for this step.',
        };
    }

    private function undoAddItem(array $undo, User $user): string
    {
        $ids = is_array($undo['item_ids'] ?? null) ? $undo['item_ids'] : [];
        $removed = 0;
        foreach ($ids as $id) {
            $item = $this->items($user)->find($id);
            if ($item) {
                $item->delete();
                $removed++;
            }
        }

        return $removed > 0
            ? 'Removed '.$removed.' item'.($removed === 1 ? '' : 's').' this run added.'
            : 'Nothing to undo - already gone.';
    }

    private function undoAddToShopping(array $undo, User $user): string
    {
        $id = $undo['shopping_id'] ?? null;
        $item = $id ? ShoppingItem::whereIn('fridge_id', $this->fridgeIds($user))->find($id) : null;
        if (! $item) {
            return 'Nothing to undo - already gone.';
        }

        $name = $item->name;
        $item->delete();

        return "Removed \"{$name}\" from the shopping list.";
    }

    private function undoAddNote(array $undo, User $user): string
    {
        $id = $undo['note_id'] ?? null;
        $note = $id ? FridgeNote::whereIn('fridge_id', $this->fridgeIds($user))->find($id) : null;
        if (! $note) {
            return 'Nothing to undo - already gone.';
        }

        $note->delete();

        return 'Removed the note this run left.';
    }

    /**
     * Recreates each deleted item from its saved snapshot (a fresh row - a hard-deleted
     * primary key can't be reused) and decrements usage_history by exactly the delta this run
     * added, floored at zero and the row dropped entirely once its count reaches zero - so an
     * undo can't leave a usage entry showing a use that never really counted, but also can't
     * push it negative if the same food was genuinely used again for real since this run.
     */
    private function undoMarkItemsUsedMatching(array $undo, User $user): string
    {
        $snapshots = is_array($undo['items'] ?? null) ? $undo['items'] : [];
        $userSectionIds = Section::whereHas('fridge.members', fn ($q) => $q->where('users.id', $user->id))->pluck('id');

        $restored = 0;
        foreach ($snapshots as $snapshot) {
            if (! is_array($snapshot) || ! $userSectionIds->contains((int) ($snapshot['section_id'] ?? null))) {
                continue;
            }
            try {
                Item::create($snapshot);
                $restored++;
            } catch (\Throwable) {
                // Best-effort - the section/category/product it referenced may be gone.
            }
        }

        $deltas = is_array($undo['usage_deltas'] ?? null) ? $undo['usage_deltas'] : [];
        foreach ($deltas as $key => $delta) {
            $entry = $user->usageHistory()->where('key', $key)->first();
            if (! $entry) {
                continue;
            }
            $newCount = max(0, $entry->count - (int) ($delta['count'] ?? 0));
            if ($newCount === 0) {
                $entry->delete();

                continue;
            }
            $entry->update([
                'count' => $newCount,
                'fresh_use_count' => max(0, $entry->fresh_use_count - (int) ($delta['fresh'] ?? 0)),
            ]);
        }

        return $restored > 0
            ? "Restored {$restored} item".($restored === 1 ? '' : 's').' this run marked used.'
            : 'Nothing to undo - already gone.';
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
        $items = $this->filteredItems($user, $args, 200);

        if ($items->isEmpty()) {
            return 'No items match.';
        }

        $lines = $items->map(function ($i) {
            $exp = $i['days_to_expiry'] === null
                ? 'no date'
                : ($i['days_to_expiry'] < 0 ? abs($i['days_to_expiry']).'d overdue' : $i['days_to_expiry'].'d left');
            $each = $i['quantity'] > 1 ? ' each' : '';

            return "#{$i['id']} {$i['name']} · {$i['quantity']}x · ".
                ($i['location'] ?? '?')." · {$i['section']} · {$exp}".
                ($i['opened'] ? ' · opened' : '').
                ($i['category'] ? " · {$i['category']}" : '').
                ($i['weight'] !== null ? ' · '.$this->formatWeight($i['weight'], $i['weight_unit']).$each : '').
                ($i['calories'] !== null ? " · {$i['calories']} kcal{$each}" : '').
                ($i['shop_url'] ? " · buy: {$i['shop_url']}" : '').
                $this->formatCustomFields($i['custom_fields']);
        });

        return $lines->implode("\n");
    }

    /**
     * Shared query + filter logic for list_items and (later) aggregation tools. A null
     * $limit means "no cap" - list_items still passes 200 itself; only a caller doing math
     * across the whole matching set should pass null, since list_items' 200-row cap is
     * applied before these filters and an aggregation must not silently inherit that.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function filteredItems(User $user, array $args, ?int $limit): Collection
    {
        $query = $this->items($user)->orderByDesc('created_at');
        if ($limit !== null) {
            $query->limit($limit);
        }
        $items = $query->get();

        if (isset($args['fridge_id']) && $this->fridgeIds($user)->contains((int) $args['fridge_id'])) {
            $fridgeId = (int) $args['fridge_id'];
            $items = $items->filter(fn ($i) => $i->section?->fridge?->id === $fridgeId);
        }
        if (isset($args['search'])) {
            $items = $items->filter(fn ($i) => str_contains(Str::lower($i->name), Str::lower((string) $args['search'])));
        }

        $rows = $items->map(function ($i) {
            $days = ItemFreshness::effectiveDaysUntilExpiry($i);

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
                'shop_url' => $i->shop_url,
                'weight' => $i->weight,
                'weight_unit' => $i->weight_unit,
                'calories' => $i->calories,
                'custom_fields' => $i->custom_fields ?? [],
            ];
        });

        if (! empty($args['expired_only'])) {
            $rows = $rows->filter(fn ($i) => $i['days_to_expiry'] !== null && $i['days_to_expiry'] < 0);
        }
        if (isset($args['expiring_within_days'])) {
            $n = (int) $args['expiring_within_days'];
            $rows = $rows->filter(fn ($i) => $i['days_to_expiry'] !== null && $i['days_to_expiry'] <= $n);
        }
        if (isset($args['location'])) {
            $rows = $rows->filter(fn ($i) => $i['location'] === $args['location']);
        }

        return $rows->values();
    }

    /** Trims trailing zeros so 500.000 reads as "500g" and 0.750 as "0.75kg". */
    private function formatWeight(float $weight, ?string $unit): string
    {
        return self::formatNumber($weight).($unit ?? '');
    }

    /** Trims trailing zeros so 500.000 reads as "500" and 0.750 as "0.75". */
    private static function formatNumber(float $n): string
    {
        return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.');
    }

    /** Compact "label=value; label=value (+N more)" rendering, capped so one item with many
     *  fields can't dominate a list_items reply. */
    private function formatCustomFields(array $fields): string
    {
        if ($fields === []) {
            return '';
        }

        $shown = array_slice($fields, 0, 5);
        $rest = count($fields) - count($shown);
        $parts = array_map(
            fn ($f) => ($f['label'] ?? '?').'='.Str::limit((string) ($f['value'] ?? ''), 40, '…'),
            $shown
        );

        return ' · fields: '.implode('; ', $parts).($rest > 0 ? " (+{$rest} more)" : '');
    }

    // Base units for weight conversion - mass and volume never mix (see computeFieldTotal).
    private const GRAMS_PER_UNIT = ['g' => 1, 'kg' => 1000, 'mg' => 0.001, 'oz' => 28.3495, 'lb' => 453.592];

    private const ML_PER_UNIT = ['ml' => 1, 'l' => 1000];

    /** The whole set of summable fields - one source of truth for sum_item_field's schema,
     *  this class's own runtime check, MachineDraftValidator's threshold field, and
     *  AgentService's draft system prompt. */
    public const FIELDS = ['quantity', 'weight', 'calories', 'custom'];

    private function sumItemField(User $user, array $args): string
    {
        $field = $args['field'] ?? null;
        if (! in_array($field, self::FIELDS, true)) {
            return 'Error: field must be one of '.implode(', ', self::FIELDS).'.';
        }
        if ($field === 'custom' && trim((string) ($args['custom_field_label'] ?? '')) === '') {
            return 'Error: custom_field_label is required when field is custom.';
        }
        if ($field === 'weight' && ! in_array($args['unit'] ?? 'g', ItemPayload::WEIGHT_UNITS, true)) {
            return 'Error: unit must be one of '.implode(', ', ItemPayload::WEIGHT_UNITS).' (required when field is weight).';
        }

        $computed = $this->computeFieldTotal($user, $args);

        if ($field === 'quantity') {
            $total = (int) $computed['total'];
            $this->value = (string) $total;

            return "Total quantity: {$total} across {$computed['matched']} item".($computed['matched'] === 1 ? '' : 's').'.';
        }

        if ($field === 'calories') {
            $total = (int) $computed['total'];
            $this->value = "{$total} kcal";

            return "Total calories: {$total} kcal across {$computed['matched']} item".($computed['matched'] === 1 ? '' : 's').
                ($computed['skipped'] > 0 ? " ({$computed['skipped']} skipped: no calories set)" : '').'.';
        }

        if ($field === 'custom') {
            $label = trim((string) $args['custom_field_label']);
            $rendered = self::formatNumber($computed['total']);
            $this->value = $rendered;

            return "Total \"{$label}\": {$rendered} across {$computed['matched']} item".($computed['matched'] === 1 ? '' : 's').
                ($computed['skipped'] > 0 ? " ({$computed['skipped']} skipped: no numeric \"{$label}\" set)" : '').'.';
        }

        // weight
        $rendered = $this->formatWeight($computed['total'], $computed['unit']);
        $this->value = $rendered;

        return "Total weight: {$rendered} across {$computed['matched']} item".($computed['matched'] === 1 ? '' : 's').
            ($computed['skipped'] > 0 ? " ({$computed['skipped']} skipped: no weight set, or measured in the other system - mass vs volume)" : '').'.';
    }

    /**
     * Raw math shared by sumItemField() (formats this into a display string) and
     * MachineTriggerService's threshold checker (only needs the float). Assumes $args is
     * already valid - callers are responsible (sumItemField's own checks above, or a
     * Machine's already-validated trigger_config).
     *
     * @return array{total: float, matched: int, skipped: int, unit: ?string}
     */
    private function computeFieldTotal(User $user, array $args): array
    {
        $field = $args['field'];
        // No row cap, unlike list_items (200) - an aggregation must see every matching item
        // or it silently under-counts.
        $items = $this->filteredItems($user, $args, null);

        if ($field === 'quantity') {
            return ['total' => (float) $items->sum('quantity'), 'matched' => $items->count(), 'skipped' => 0, 'unit' => null];
        }

        if ($field === 'calories') {
            $matched = $items->filter(fn ($i) => $i['calories'] !== null);

            // Total in stock (per-unit x quantity) - the opposite of list_items' per-unit
            // display, since "how much is in stock" is what a Machine summing calories wants.
            return [
                'total' => (float) $matched->sum(fn ($i) => $i['calories'] * $i['quantity']),
                'matched' => $matched->count(),
                'skipped' => $items->count() - $matched->count(),
                'unit' => null,
            ];
        }

        if ($field === 'custom') {
            $label = Str::lower(trim((string) $args['custom_field_label']));
            $values = $items->map(function ($i) use ($label) {
                $match = collect($i['custom_fields'])->first(fn ($f) => Str::lower(trim((string) ($f['label'] ?? ''))) === $label);
                $value = $match['value'] ?? null;

                return $value !== null && is_numeric($value) ? (float) $value * $i['quantity'] : null;
            });
            $matched = $values->filter(fn ($v) => $v !== null);

            return ['total' => (float) $matched->sum(), 'matched' => $matched->count(), 'skipped' => $items->count() - $matched->count(), 'unit' => null];
        }

        // weight
        $unit = $args['unit'] ?? 'g';
        $unitIsMass = array_key_exists($unit, self::GRAMS_PER_UNIT);

        $matched = $items->filter(function ($i) use ($unitIsMass) {
            if ($i['weight'] === null || $i['weight_unit'] === null) {
                return false;
            }

            return array_key_exists($i['weight_unit'], self::GRAMS_PER_UNIT) === $unitIsMass;
        });

        $baseTable = $unitIsMass ? self::GRAMS_PER_UNIT : self::ML_PER_UNIT;
        $totalBase = $matched->sum(fn ($i) => $baseTable[$i['weight_unit']] * $i['weight'] * $i['quantity']);

        return [
            'total' => $totalBase / $baseTable[$unit],
            'matched' => $matched->count(),
            'skipped' => $items->count() - $matched->count(),
            'unit' => $unit,
        ];
    }

    /** The raw total only - for MachineTriggerService's threshold comparison, which needs a
     *  float to compare against trigger_config.value, not a formatted display string. Callers
     *  must pass already-valid args (a threshold's trigger_config is validated at save time). */
    public function fieldTotal(User $user, array $args): float
    {
        return $this->computeFieldTotal($user, $args)['total'];
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

        return $items->map(fn ($s) => '#'.$s->id.' '.$s->name.' ('.$s->section.')'
            .($s->checked ? ' — checked off' : '')
            .($s->shop_url ? ' — buy: '.$s->shop_url : ''))->implode("\n");
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

        $url = $this->cleanUrl($args['shop_url'] ?? null);

        $shoppingItem = $fridge->shoppingItems()->create([
            'name' => Str::limit($name, 255, ''),
            'section' => Str::limit(trim((string) ($args['section'] ?? 'other')) ?: 'other', 255, ''),
            'checked' => false,
            'shop_url' => $url,
        ]);
        $this->mutated = true;
        $this->undo = ['tool' => 'add_to_shopping', 'shopping_id' => $shoppingItem->id];

        return "Added \"{$name}\" to the shopping list on {$fridge->name}".($url ? ' with a buy link' : '').'.';
    }

    /** Accept only a plain http(s) URL for storage (these are opened in the user's browser,
     *  never fetched by the server) - reject javascript:, data:, garbage, or anything overlong. */
    private function cleanUrl(mixed $url): ?string
    {
        $url = trim((string) ($url ?? ''));

        if ($url === '' || strlen($url) > 2048
            || ! preg_match('#^https?://#i', $url)
            || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return null;
        }

        return $url;
    }

    private function addNote(User $user, ?int $fridgeId, array $args): string
    {
        $fridge = $this->targetFridge($user, $fridgeId);
        $text = trim((string) ($args['text'] ?? ''));
        if ($text === '') {
            return 'Error: note text is required.';
        }
        $color = in_array($args['color'] ?? null, FridgeNote::COLORS, true) ? $args['color'] : 'amber';

        $note = $fridge->notes()->create(['text' => Str::limit($text, 500, ''), 'color' => $color, 'user_id' => $user->id]);
        $this->mutated = true;
        $this->undo = ['tool' => 'add_note', 'note_id' => $note->id];

        return "Left a note on {$fridge->name}: \"{$text}\".";
    }

    /** Machine-only (see the class docblock) - wraps Notifier::notify() rather than a second
     *  delivery path, so this rides the same push pipeline as expiry/invite/member alerts. */
    private function notifyUser(User $user, ?int $fridgeId, array $args): string
    {
        $message = trim((string) ($args['message'] ?? ''));
        if ($message === '') {
            return 'Error: message is required.';
        }
        $message = Str::limit($message, 240, '');

        $title = trim((string) ($args['title'] ?? ''));
        $title = $title !== '' ? Str::limit($title, 60, '') : null;

        $fridge = $this->targetFridge($user, $fridgeId);
        Notifier::notify($user, 'machine', $message, $fridge, null, $title);
        $this->mutated = true;

        return "Notified: \"{$message}\".";
    }

    /**
     * Chat's entry point into Kitchen Lab: drafts and immediately saves a Machine from the
     * user's own description, same drafting call (AgentService::draftMachine, including its
     * validate-then-repair round trip) Kitchen Lab's own "AI draft" button uses - so the two
     * paths can never silently diverge in what counts as a valid draft. Resolved lazily via
     * the container rather than constructor-injected: AgentService already depends on this
     * class (for schemas()/MACHINE_TOOLS), so injecting it back here would be circular.
     * Always creates the Machine disabled, exactly like MachineController::store()'s own
     * default - chat gets no extra trust to skip the "review before it goes live" step every
     * other creation path already enforces.
     */
    private function createMachine(User $user, ?int $fridgeId, array $args): string
    {
        $prompt = trim((string) ($args['prompt'] ?? ''));
        if ($prompt === '') {
            return 'Error: describe what you want automated, e.g. "every day at 8am, tell me what\'s expiring this week".';
        }
        // Same cap MachineController::draft() validates - keeps the drafting call's own
        // length/cost bounded regardless of which path a prompt arrives through.
        $prompt = Str::limit($prompt, 500, '');

        $result = app(AgentService::class)->draftMachine($user, $prompt);
        if (! $result['ok']) {
            return "Error: couldn't set that up automatically - {$result['message']}";
        }

        $draft = $result['draft'];
        $fridge = $this->targetFridge($user, $fridgeId);

        $machine = Machine::create([
            'user_id' => $user->id,
            'fridge_id' => $fridge->id,
            'name' => $draft['name'],
            'prompt' => $prompt,
            'trigger_type' => $draft['trigger_type'],
            'trigger_config' => $draft['trigger_config'],
            'steps' => $draft['steps'],
            'enabled' => false,
            'version' => 1,
            'next_run_at' => $draft['trigger_type'] === 'schedule'
                ? MachineSchedule::nextRunAt($draft['trigger_config'], now())
                : null,
        ]);
        $this->mutated = true;

        $stepCount = count($draft['steps']);

        return "Created Machine \"{$machine->name}\" with a {$draft['trigger_type']} trigger and {$stepCount} step".
            ($stepCount === 1 ? '' : 's').
            '. It is OFF by default - tell the user to open Kitchen Lab to review the details and turn it on before it will actually run.';
    }

    private function removeNote(User $user, array $args): string
    {
        $notes = FridgeNote::whereIn('fridge_id', $this->fridgeIds($user));

        if (isset($args['note_id'])) {
            $note = $notes->find((int) $args['note_id']);
            if (! $note) {
                return 'Error: no note with that id. Call list_notes for valid ids.';
            }
        } else {
            $fragment = trim((string) ($args['text'] ?? ''));
            if ($fragment === '') {
                return 'Error: pass note_id or a text fragment to match.';
            }
            $matches = $notes->whereRaw('lower(text) like ?', ['%'.Str::lower($fragment).'%'])->get();
            if ($matches->isEmpty()) {
                return "No note matches \"{$fragment}\".";
            }
            if ($matches->count() > 1) {
                $list = $matches->map(fn ($n) => "#{$n->id} \"{$n->text}\"")->implode('; ');

                return "That matches {$matches->count()} notes: {$list}. Ask the user which one, then call remove_note with its note_id.";
            }
            $note = $matches->first();
        }

        if (empty($args['confirm'])) {
            return "Not removed yet. This will permanently delete the note \"{$note->text}\". ".
                'Tell the user exactly what will be removed and ask them to confirm, then call remove_note again with confirm:true (and note_id set to this note\'s id, so it deletes the same one).';
        }

        $text = $note->text;
        $note->delete();
        $this->mutated = true;

        return "Removed the note \"{$text}\".";
    }

    private function updateItem(User $user, array $args): string
    {
        $item = $this->items($user)->find($args['item_id'] ?? null);
        if (! $item) {
            return 'Error: no accessible item with that id. Call list_items to get valid ids.';
        }

        $data = [];
        if (isset($args['name']) && trim((string) $args['name']) !== '') {
            $data['name'] = Str::limit(trim((string) $args['name']), 255, '');
        }
        if (isset($args['category'])) {
            $groups = ['protein', 'vegetables', 'fruit', 'grains', 'dairy', 'other_extras'];
            if (! in_array($args['category'], $groups, true)) {
                return 'Error: category must be one of '.implode(', ', $groups).'.';
            }
            $data['nutrition_category'] = $args['category'];
        }
        if (isset($args['quantity']) && (int) $args['quantity'] >= 1) {
            $data['quantity'] = (int) $args['quantity'];
        }
        if (array_key_exists('opened', $args)) {
            $data['opened'] = (bool) $args['opened'];
        }
        if (isset($args['location']) && in_array($args['location'], ['fridge', 'freezer', 'pantry'], true)) {
            $data['location'] = $args['location'];
        }
        if (array_key_exists('shop_url', $args)) {
            $data['shop_url'] = trim((string) $args['shop_url']) === '' ? null : $this->cleanUrl($args['shop_url']);
            if ($data['shop_url'] === null && trim((string) $args['shop_url']) !== '') {
                return 'Error: shop_url must be a plain http(s) link.';
            }
        }
        if (array_key_exists('note', $args)) {
            $data['note'] = Str::limit(trim((string) $args['note']), 255, '');
        }
        if (isset($args['expiry_date'])) {
            try {
                $expiryDate = Carbon::parse($args['expiry_date'])->startOfDay();
            } catch (\Throwable) {
                return 'Error: expiry_date must be a valid date like 2026-09-20.';
            }
            $data['expiry_date'] = $expiryDate->toDateString();
            // The old shelf_life_days no longer means anything once the date itself changed -
            // re-derive from today-to-new-date so ItemResource's freshness % (what Guardian
            // sorts by) stays meaningful instead of comparing `days` against a stale total.
            $data['shelf_life_days'] = max(1, (int) Carbon::now()->startOfDay()->diffInDays($expiryDate, false));
        }

        if (array_key_exists('weight', $args)) {
            if ($args['weight'] === null) {
                $data['weight'] = null;
            } elseif (! is_numeric($args['weight']) || (float) $args['weight'] < 0 || (float) $args['weight'] > 9999999) {
                return 'Error: weight must be a number between 0 and 9999999, or null to clear it.';
            } elseif (empty($args['weight_unit']) || ! in_array($args['weight_unit'], ItemPayload::WEIGHT_UNITS, true)) {
                return 'Error: weight needs a weight_unit (one of '.implode(', ', ItemPayload::WEIGHT_UNITS).') in the same call.';
            } else {
                $data['weight'] = (float) $args['weight'];
                $data['weight_unit'] = $args['weight_unit'];
            }
        } elseif (isset($args['weight_unit'])) {
            if (! $item->weight) {
                return 'Error: weight_unit needs a weight to go with it, and this item has none set. Pass weight too.';
            }
            if (! in_array($args['weight_unit'], ItemPayload::WEIGHT_UNITS, true)) {
                return 'Error: weight_unit must be one of '.implode(', ', ItemPayload::WEIGHT_UNITS).'.';
            }
            $data['weight_unit'] = $args['weight_unit'];
        }

        if (array_key_exists('calories', $args)) {
            if ($args['calories'] === null) {
                $data['calories'] = null;
            } elseif (! is_numeric($args['calories']) || (int) $args['calories'] < 0 || (int) $args['calories'] > 100000) {
                return 'Error: calories must be a whole number between 0 and 100000, or null to clear it.';
            } else {
                $data['calories'] = (int) $args['calories'];
            }
        }

        if (isset($args['set_custom_fields']) && is_array($args['set_custom_fields'])) {
            $merged = ItemPayload::mergeCustomFields($item->custom_fields ?? [], $args['set_custom_fields']);
            if (is_string($merged)) {
                return "Error: {$merged}";
            }
            $data['custom_fields'] = $merged;
        }

        if (! $data) {
            return 'Error: nothing to change - pass at least one of name, quantity, opened, location, category, expiry_date, note, shop_url, weight, calories, set_custom_fields.';
        }

        $data = ItemPayload::normalize($data);
        $item->update($data);
        $this->mutated = true;

        return "Updated \"{$item->name}\": ".$this->describeItemChanges($data).'.';
    }

    /** Renders update_item's $data for the confirmation string - weight/unit fold into one
     *  "weight=500g" part instead of two, and custom_fields into readable "label=value"s. */
    private function describeItemChanges(array $data): string
    {
        $parts = [];
        foreach ($data as $k => $v) {
            if ($k === 'weight') {
                $parts[] = $v === null ? 'weight=cleared' : 'weight='.$this->formatWeight((float) $v, $data['weight_unit'] ?? null);

                continue;
            }
            if ($k === 'weight_unit') {
                if (array_key_exists('weight', $data)) {
                    continue; // already folded into the weight= part above
                }
                $parts[] = "weight_unit={$v}";

                continue;
            }
            if ($k === 'custom_fields') {
                $rendered = collect($v)->map(fn ($f) => "{$f['label']}={$f['value']}")->implode(', ');
                $parts[] = 'custom fields: '.($rendered !== '' ? $rendered : 'none');

                continue;
            }
            $parts[] = "{$k}=".(is_bool($v) ? ($v ? 'true' : 'false') : ($v ?? 'cleared'));
        }

        return implode(', ', $parts);
    }

    private function updateNote(User $user, array $args): string
    {
        $note = FridgeNote::whereIn('fridge_id', $this->fridgeIds($user))->find($args['note_id'] ?? null);
        if (! $note) {
            return 'Error: no note with that id. Call list_notes for valid ids.';
        }

        $data = [];
        if (isset($args['text']) && trim((string) $args['text']) !== '') {
            $data['text'] = Str::limit(trim((string) $args['text']), 500, '');
        }
        if (isset($args['color']) && in_array($args['color'], FridgeNote::COLORS, true)) {
            $data['color'] = $args['color'];
        }
        if (! $data) {
            return 'Error: pass text and/or a valid color to change.';
        }

        $note->update($data);
        $this->mutated = true;

        return "Updated the note: \"{$note->text}\".";
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

    /** The single filter key names sum_item_field/list_items already share - "at least one
     *  of these" is mark_items_used_matching's safety guardrail against an accidental
     *  match-everything sweep. */
    private const ITEM_FILTER_KEYS = ['search', 'location', 'expired_only', 'expiring_within_days', 'fridge_id'];

    private function hasItemFilter(array $args): bool
    {
        foreach (self::ITEM_FILTER_KEYS as $key) {
            if (isset($args[$key]) && $args[$key] !== '' && $args[$key] !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * The filter-based, safe-for-unattended-automation sibling of mark_item_used - re-resolves
     * its filter fresh every run instead of a saved item_id, so it can never go stale the way
     * mark_item_used would (see the class docblock's MACHINE_TOOLS exclusion reasoning).
     */
    private function markItemsUsedMatching(User $user, array $args): string
    {
        if (! $this->hasItemFilter($args)) {
            return 'Error: pass at least one filter (search, location, expired_only, expiring_within_days, or fridge_id) - this cannot run against every item.';
        }

        $items = $this->filteredItems($user, $args, null);
        if ($items->isEmpty()) {
            $this->value = '0';

            return 'No matching items to mark used.';
        }

        $names = [];
        $snapshots = [];
        $usageDeltas = [];
        foreach ($items as $row) {
            $item = $row['model'];
            $days = ItemFreshness::daysUntilExpiry($item);
            $this->recordUsage($user, $item->name, $item->icon, $days);
            $names[] = $item->name;

            // Same normalization recordUsage() applies - tallied here too so undoStep() can
            // decrement usage_history back by exactly what this run added, not guess at it.
            $key = Str::lower(trim($item->name));
            $usageDeltas[$key] ??= ['count' => 0, 'fresh' => 0];
            $usageDeltas[$key]['count']++;
            if ($days !== null && $days >= 0) {
                $usageDeltas[$key]['fresh']++;
            }

            // Enough of the item's own fields to recreate it on undo - a fresh row, not the
            // same id (a hard-deleted primary key can't be reused safely), but otherwise a
            // faithful restore.
            $snapshots[] = $item->only([
                'section_id', 'product_id', 'category_id', 'name', 'icon', 'icon_url',
                'nutrition_category', 'location', 'quantity', 'weight', 'weight_unit',
                'expiry_date', 'shelf_life_days', 'opened', 'note', 'source', 'shop_url',
                'calories', 'custom_fields',
            ]);

            $item->delete();
        }
        $this->mutated = true;
        $this->value = (string) count($names);
        $this->undo = ['tool' => 'mark_items_used_matching', 'items' => $snapshots, 'usage_deltas' => $usageDeltas];

        $shown = array_slice($names, 0, 10);
        $rest = count($names) - count($shown);

        return 'Marked '.count($names).' item'.(count($names) === 1 ? '' : 's').' as used: '.
            implode(', ', $shown).($rest > 0 ? " (+{$rest} more)" : '').'.';
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

    private function listBadges(User $user): string
    {
        $earned = UserBadge::where('user_id', $user->id)->get()->keyBy('badge_key');

        return collect(BadgeService::BADGES)->map(function (int $threshold, string $key) use ($earned) {
            $meta = self::BADGE_CATALOG[$key];
            $row = $earned->get($key);

            if ($row && $row->earned_at) {
                return "✓ {$meta['label']} — earned {$row->earned_at->toDateString()}. {$meta['description']}";
            }

            $progress = $row->progress ?? 0;

            return "☐ {$meta['label']} — {$progress}/{$threshold}. {$meta['description']}";
        })->implode("\n");
    }

    private function getCreditsBalance(User $user): string
    {
        return "{$this->credits->balance($user)} AI credits remaining.";
    }

    private function getKitchenScore(User $user): string
    {
        $s = $this->kitchenScore->scoreFor($user);

        $fmt = fn (?int $v) => $v === null ? 'not enough data yet' : "{$v}/100";

        return "Waste Saver: {$fmt($s['wasteScore'])}\n".
            "Food Balance: {$fmt($s['balanceScore'])}\n".
            "Tidiness (Organizer): {$fmt($s['organizerScore'])}\n".
            "Shopping List (Shopkeeper): {$fmt($s['shopkeeperScore'])}\n".
            "Overdue items right now: {$s['overdueCount']}";
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
        $links = collect($recipe->attachments ?? [])->pluck('url')->filter()->implode("\n");

        return "{$recipe->name} ({$recipe->minutes}m)\n\nIngredients:\n{$ings}\n\nSteps:\n{$steps}"
            .($links !== '' ? "\n\nAttachments / links:\n{$links}" : '');
    }

    // ---- inventory / shopping / memory / recipe writes ----------------------

    private function addItem(User $user, ?int $fridgeId, array $args): string
    {
        if (trim((string) ($args['name'] ?? '')) === '') {
            return 'Error: a name is required.';
        }

        $fridge = $this->targetFridge($user, $this->wantedFridgeId($user, $args['fridge_id'] ?? null, $fridgeId));
        $item = $this->createItem($fridge, $args);
        if (is_string($item)) {
            return 'Error: '.$item;
        }
        $this->undo = ['tool' => 'add_item', 'item_ids' => [$item->id]];

        return "Added \"{$item->name}\" ({$item->quantity}x) to {$item->section->name} in {$fridge->name}".
            ($item->expiry_date ? ' · expires '.$item->expiry_date->toDateString() : '').
            ($item->weight !== null ? ' · '.$this->formatWeight($item->weight, $item->weight_unit) : '').
            ($item->calories !== null ? " · {$item->calories} kcal" : '').'.';
    }

    private function bulkAddItems(User $user, ?int $fridgeId, array $args): string
    {
        $specs = is_array($args['items'] ?? null) ? $args['items'] : [];
        if ($specs === []) {
            return 'Error: pass an "items" array, each entry with at least a name.';
        }

        $fridge = $this->targetFridge($user, $this->wantedFridgeId($user, $args['fridge_id'] ?? null, $fridgeId));

        $added = [];
        $addedIds = [];
        $skipped = [];
        foreach (array_slice($specs, 0, 30) as $spec) {
            if (! is_array($spec) || trim((string) ($spec['name'] ?? '')) === '') {
                continue;
            }
            $r = $this->createItem($fridge, $spec);
            if (is_string($r)) {
                $skipped[] = trim($spec['name']).' ('.$r.')';
            } else {
                $added[] = "{$r->name} ({$r->quantity}x)";
                $addedIds[] = $r->id;
            }
        }

        if ($added === []) {
            return 'Nothing was added. '.implode('; ', $skipped);
        }
        $this->undo = ['tool' => 'bulk_add_items', 'item_ids' => $addedIds];

        return "Added to {$fridge->name}: ".implode(', ', $added).'.'.
            ($skipped ? ' Skipped: '.implode('; ', $skipped).'.' : '');
    }

    private function wantedFridgeId(User $user, mixed $explicit, ?int $chatFridgeId): ?int
    {
        return isset($explicit) && $this->fridgeIds($user)->contains((int) $explicit)
            ? (int) $explicit
            : $chatFridgeId;
    }

    /**
     * Create one item in the given fridge from a loose spec (name required). Returns the
     * created Item with its `section` relation set, or an error string.
     */
    private function createItem(Fridge $fridge, array $spec): Item|string
    {
        $name = trim((string) ($spec['name'] ?? ''));
        if ($name === '') {
            return 'a name is required';
        }

        $location = in_array($spec['location'] ?? null, ['fridge', 'freezer', 'pantry'], true)
            ? $spec['location'] : 'fridge';

        $expiry = null;
        $shelfLifeDays = null;
        if (isset($spec['expiry_date'])) {
            try {
                $expiryDate = Carbon::parse($spec['expiry_date'])->startOfDay();
            } catch (\Throwable) {
                return 'bad expiry_date';
            }
            $expiry = $expiryDate->toDateString();
            // ItemResource's freshness % (what the Guardian tab sorts by) needs a total-
            // shelf-life denominator to compare `days` against, not just an expiry date - to
            // derive it from today-to-expiry when the caller didn't also give an explicit
            // shelf_life_days, same convention the manual/scan add paths already rely on.
            $shelfLifeDays = isset($spec['shelf_life_days']) && (int) $spec['shelf_life_days'] >= 1
                ? (int) $spec['shelf_life_days']
                : max(1, (int) Carbon::now()->startOfDay()->diffInDays($expiryDate, false));
        } elseif (isset($spec['shelf_life_days']) && (int) $spec['shelf_life_days'] >= 1) {
            $shelfLifeDays = (int) $spec['shelf_life_days'];
            $expiry = Carbon::now()->addDays($shelfLifeDays)->toDateString();
        }

        $weight = null;
        $weightUnit = null;
        if (isset($spec['weight']) && $spec['weight'] !== null) {
            if (! is_numeric($spec['weight']) || (float) $spec['weight'] < 0 || (float) $spec['weight'] > 9999999) {
                return 'weight must be a number between 0 and 9999999';
            }
            if (empty($spec['weight_unit']) || ! in_array($spec['weight_unit'], ItemPayload::WEIGHT_UNITS, true)) {
                return 'weight needs a weight_unit (one of '.implode(', ', ItemPayload::WEIGHT_UNITS).')';
            }
            $weight = (float) $spec['weight'];
            $weightUnit = $spec['weight_unit'];
        }

        $calories = null;
        if (isset($spec['calories']) && $spec['calories'] !== null) {
            if (! is_numeric($spec['calories']) || (int) $spec['calories'] < 0 || (int) $spec['calories'] > 100000) {
                return 'calories must be a whole number between 0 and 100000';
            }
            $calories = (int) $spec['calories'];
        }

        $section = $this->sectionFor($fridge, $spec['section'] ?? null, $location);
        $icon = FoodIconMatcher::guess($name) ?? '';

        $item = $section->items()->create([
            'name' => Str::limit($name, 255, ''),
            'icon' => $icon,
            'nutrition_category' => FoodIconMatcher::nutritionCategoryFor($icon ?: null),
            'location' => $location,
            'quantity' => isset($spec['quantity']) ? max(1, (int) $spec['quantity']) : 1,
            'expiry_date' => $expiry,
            'shelf_life_days' => $shelfLifeDays,
            'source' => 'manual',
            'weight' => $weight,
            'weight_unit' => $weightUnit,
            'calories' => $calories,
        ]);
        $this->mutated = true;

        return $item->setRelation('section', $section);
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

    private function listFacts(User $user): string
    {
        $facts = $user->userMemory?->facts ?? [];
        if ($facts === []) {
            return "I don't have any remembered facts about you yet.";
        }

        return collect($facts)->map(fn ($f, $i) => "#{$i} {$f}")->implode("\n");
    }

    private function forgetFact(User $user, array $args): string
    {
        $memory = $user->userMemory()->firstOrCreate([], ['facts' => []]);
        $facts = $memory->facts ?? [];
        if ($facts === []) {
            return "There's nothing remembered to forget.";
        }

        if (isset($args['index']) && array_key_exists((int) $args['index'], $facts)) {
            $removed = $facts[(int) $args['index']];
            unset($facts[(int) $args['index']]);
        } else {
            $fragment = Str::lower(trim((string) ($args['text'] ?? '')));
            if ($fragment === '') {
                return 'Error: pass index (from list_facts) or a text fragment.';
            }
            $idx = collect($facts)->search(fn ($f) => str_contains(Str::lower((string) $f), $fragment));
            if ($idx === false) {
                return "No remembered fact matches \"{$args['text']}\".";
            }
            $removed = $facts[$idx];
            unset($facts[$idx]);
        }

        $memory->update(['facts' => array_values($facts)]);
        $this->mutated = true;

        return "Forgot: \"{$removed}\".";
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
            'ingredients' => array_map(fn ($i) => ['name' => $i, 'icon' => FoodIconMatcher::guess($i) ?? ''], $ingredients),
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

        return "Logged that you made \"{$recipe->name}\" ({$recipe->made_count}x now).";
    }

    private function deleteRecipe(User $user, array $args): string
    {
        // Only the user's own recipes - recipesFor() also includes curated ones.
        $recipe = $user->recipes()->find($args['recipe_id'] ?? null);
        if (! $recipe) {
            return 'Error: no recipe of yours with that id. You can only delete recipes you saved - call list_recipes for ids.';
        }

        if (empty($args['confirm'])) {
            return "Not deleted yet. This permanently deletes your recipe \"{$recipe->name}\". ".
                'Confirm with the user, then call delete_recipe again with confirm:true.';
        }

        $name = $recipe->name;
        $recipe->delete();
        $this->mutated = true;

        return "Deleted the recipe \"{$name}\".";
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
            'icon' => $icon ?: '',
            'count' => 1,
            'fresh_use_count' => $freshInc,
            'freshness_sum' => 0,
            'freshness_sample_count' => 0,
            'last_used_at' => now(),
        ]);
    }
}
