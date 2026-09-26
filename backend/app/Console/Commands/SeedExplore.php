<?php

namespace App\Console\Commands;

use App\Models\ExploreItem;
use App\Models\Recipe;
use App\Models\SharedIcon;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Fills the Explore catalogue from what already exists: curated recipes, the shared icon pack, and a
 * starter set of Machine and meal-plan templates. Only ever ADDS rows that are missing, so anything an
 * admin has edited, featured, reordered or hidden is left exactly as it is; run it again after curating
 * more recipes or promoting more icons.
 */
#[Signature('app:seed-explore')]
#[Description('Add curated recipes, shared icons and starter templates to the Explore catalogue')]
class SeedExplore extends Command
{
    public function handle(): int
    {
        $added = ['recipe' => 0, 'icon' => 0, 'machine' => 0, 'meal_plan' => 0];

        foreach (Recipe::query()->whereNull('user_id')->get() as $recipe) {
            $created = ExploreItem::firstOrCreate(
                ['type' => 'recipe', 'ref_id' => $recipe->id],
                [
                    'title' => Str::limit($recipe->name, 120, ''),
                    'blurb' => collect([$recipe->minutes ? "{$recipe->minutes} min" : null, $recipe->category])->filter()->implode(' · ') ?: null,
                    'tags' => $this->recipeTags($recipe),
                ],
            );
            $added['recipe'] += $created->wasRecentlyCreated ? 1 : 0;
        }

        foreach (SharedIcon::query()->get() as $icon) {
            $label = trim((string) $icon->label) ?: 'Food icon';
            $created = ExploreItem::firstOrCreate(
                ['type' => 'icon', 'ref_id' => $icon->id],
                ['title' => Str::limit($label, 120, ''), 'tags' => ['icon', 'food']],
            );
            $added['icon'] += $created->wasRecentlyCreated ? 1 : 0;
        }

        foreach ($this->machineTemplates() as $row) {
            $added['machine'] += $this->addTemplate('machine', $row) ? 1 : 0;
        }
        foreach ($this->mealPlanTemplates() as $row) {
            $added['meal_plan'] += $this->addTemplate('meal_plan', $row) ? 1 : 0;
        }

        $this->info('Added: '.collect($added)->map(fn ($n, $k) => "{$n} {$k}")->implode(', ').'.');

        return self::SUCCESS;
    }

    /** @param  array{title: string, blurb: string, tags: list<string>, payload: array<string, mixed>}  $row */
    private function addTemplate(string $type, array $row): bool
    {
        if (ExploreItem::where('type', $type)->where('title', $row['title'])->exists()) {
            return false;
        }
        ExploreItem::create($row + ['type' => $type, 'featured' => true]);

        return true;
    }

    /** @return list<string> */
    private function recipeTags(Recipe $recipe): array
    {
        return collect($recipe->ingredients ?? [])->pluck('name')
            ->merge([$recipe->meal_type, $recipe->category])
            ->merge($recipe->vibes ?? [])->merge($recipe->food_focus ?? [])
            ->filter()->map(fn ($t) => Str::lower((string) $t))->unique()->values()->take(20)->all();
    }

    /** The same starters the Kitchen Lab used to hard-code in the app (schedule timezone is filled in on the device). */
    private function machineTemplates(): array
    {
        return [
            [
                'title' => 'Weekly expiry check',
                'blurb' => "Every Monday at 8am, count what's expiring within a week",
                'tags' => ['expiry', 'weekly', 'reminder', 'waste'],
                'payload' => [
                    'name' => 'Weekly expiry check',
                    'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'weekly', 'time' => '08:00', 'weekday' => 1]],
                    'steps' => [
                        ['tool' => 'sum_item_field', 'args' => ['field' => 'quantity', 'expiring_within_days' => 7]],
                        ['tool' => 'notify_user', 'args' => ['title' => 'Weekly expiry check', 'message' => '{step1} item(s) are expiring within a week — check what needs using.']],
                    ],
                ],
            ],
            [
                'title' => 'Low stock reminder',
                'blurb' => 'Notify me when total quantity on hand drops to 5 or below',
                'tags' => ['low stock', 'shopping', 'reminder'],
                'payload' => [
                    'name' => 'Low stock reminder',
                    'trigger' => ['type' => 'threshold', 'config' => ['field' => 'quantity', 'custom_field_label' => null, 'unit' => null, 'op' => 'lte', 'value' => 5]],
                    'steps' => [
                        ['tool' => 'notify_user', 'args' => ['title' => 'Low stock', 'message' => 'Total stock has dropped low — check what needs restocking.']],
                    ],
                ],
            ],
            [
                'title' => 'Fridge summary',
                'blurb' => 'Every Sunday at 9am, send your Kitchen Score',
                'tags' => ['score', 'weekly', 'summary'],
                'payload' => [
                    'name' => 'Fridge summary',
                    'trigger' => ['type' => 'schedule', 'config' => ['frequency' => 'weekly', 'time' => '09:00', 'weekday' => 0]],
                    'steps' => [
                        ['tool' => 'get_kitchen_score', 'args' => []],
                        ['tool' => 'notify_user', 'args' => ['title' => 'Fridge summary', 'message' => 'Your kitchen score: {step1}']],
                    ],
                ],
            ],
        ];
    }

    /** `day` counts from the day you start the plan (0 = that day). */
    private function mealPlanTemplates(): array
    {
        $days = fn (array $slots) => collect($slots)->flatMap(
            fn ($titles, $slot) => collect($titles)->map(fn ($title, $day) => ['day' => $day, 'slot' => $slot, 'title' => $title])
        )->values()->all();

        return [
            [
                'title' => 'Simple week of dinners',
                'blurb' => 'Seven easy dinners, one a night',
                'tags' => ['dinner', 'week', 'easy', 'family'],
                'payload' => ['days' => $days(['Dinner' => [
                    'Chicken rice', 'Vegetable stir fry with tofu', 'Spaghetti with tomato sauce', 'Fried rice with egg',
                    'Grilled fish with vegetables', 'Chicken soup with noodles', 'Egg and cheese omelette with toast',
                ]])],
            ],
            [
                'title' => 'Meal-prep Sunday',
                'blurb' => 'Cook once on day one, eat lunches for the week',
                'tags' => ['meal prep', 'lunch', 'batch', 'work'],
                'payload' => ['days' => $days([
                    'Prep' => [0 => 'Batch cook chicken and rice'],
                    'Lunch' => [1 => 'Chicken rice bowl', 2 => 'Chicken rice bowl', 3 => 'Chicken rice bowl', 4 => 'Chicken rice bowl'],
                    'Dinner' => [1 => 'Vegetable soup', 2 => 'Pasta with vegetables', 3 => 'Egg fried rice', 4 => 'Tofu stir fry'],
                ])],
            ],
            [
                'title' => 'Light and fresh week',
                'blurb' => 'Lighter lunches and dinners, plenty of vegetables and fruit',
                'tags' => ['light', 'healthy', 'vegetables', 'lunch', 'dinner'],
                'payload' => ['days' => $days([
                    'Lunch' => ['Salad with chicken', 'Vegetable wrap', 'Tuna salad', 'Fruit and yogurt bowl', 'Vegetable soup'],
                    'Dinner' => ['Grilled fish with vegetables', 'Stir fry vegetables with tofu', 'Chicken soup', 'Egg omelette with salad', 'Steamed fish with rice'],
                ])],
            ],
        ];
    }
}
