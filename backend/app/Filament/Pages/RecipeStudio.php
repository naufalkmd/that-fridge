<?php

namespace App\Filament\Pages;

use App\Filament\Resources\RecipeResource;
use App\Models\AdminAuditLog;
use App\Models\Recipe;
use App\Services\AgentService;
use App\Services\IconGenerationService;
use App\Services\RecipeChefService;
use App\Support\FoodIconMatcher;
use Filament\Facades\Filament;
use Filament\Forms;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Notifications\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;

/**
 * Write curated recipes with Chef instead of by hand: describe the dish, review and edit the draft, then save it as a curated recipe
 * (visible to every user), optionally with a generated icon and a place in Explore. Nothing is saved until "Save"; generating costs
 * OpenRouter (and fal.ai for the icon) but spends no user credits, and shows up on the AI cost dashboard as "Admin studio".
 */
class RecipeStudio extends Page implements HasForms
{
    use InteractsWithForms;

    public const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack', 'quick'];

    protected static ?string $navigationIcon = 'heroicon-o-sparkles';

    protected static ?string $navigationGroup = 'Content';

    protected static ?string $navigationLabel = 'Recipe studio';

    protected static ?string $title = 'Recipe studio';

    protected static ?int $navigationSort = 5;

    protected static string $view = 'filament.pages.recipe-studio';

    /** @var array<string, mixed> */
    public array $data = [];

    /** True once Chef has written a draft that is waiting for review. */
    public bool $hasDraft = false;

    public static function canAccess(): bool
    {
        $user = Filament::auth()->user();

        return $user !== null && $user->canAccessPanel(Filament::getCurrentPanel());
    }

    public function mount(): void
    {
        $this->form->fill(['prompt' => '', 'make_icon' => true, 'add_to_explore' => true]);
    }

    public function form(Form $form): Form
    {
        return $form->statePath('data')->schema([
            Forms\Components\Section::make('1. Ask Chef')->schema([
                Forms\Components\Textarea::make('prompt')
                    ->label('What should the recipe be?')
                    ->placeholder('e.g. High-protein vegetarian dinner under 30 minutes, or Nasi lemak for two')
                    ->rows(2)->maxLength(500),
            ]),
            Forms\Components\Section::make('2. Review and edit')
                ->description('Chef wrote this; fix anything before saving. Ingredient icons are guessed from the name.')
                ->visible(fn () => $this->hasDraft)
                ->schema([
                    Forms\Components\TextInput::make('name')->required()->maxLength(255),
                    Forms\Components\TextInput::make('minutes')->label('Total minutes')->required()->numeric()->minValue(1)->maxValue(1440),
                    Forms\Components\Select::make('category')->options(collect(self::CATEGORIES)->mapWithKeys(fn ($c) => [$c => ucfirst($c)])->all())->placeholder('None'),
                    Forms\Components\Repeater::make('ingredients')
                        ->schema([
                            Forms\Components\TextInput::make('name')->required()->maxLength(255),
                            Forms\Components\TextInput::make('icon')->required()->maxLength(255)->helperText('Pixel-pack key, e.g. eggs'),
                        ])->columns(2)->minItems(1)->columnSpanFull(),
                    Forms\Components\Repeater::make('steps')
                        ->simple(Forms\Components\Textarea::make('step')->required()->rows(2)->maxLength(1000))
                        ->minItems(1)->columnSpanFull(),
                    Forms\Components\Toggle::make('make_icon')->label('Also generate a recipe icon')->helperText('Uses fal.ai (under a cent).'),
                    Forms\Components\Toggle::make('add_to_explore')->label('Add to Explore')->helperText('Shows it in the app\'s Explore page straight away.'),
                ])->columns(2),
        ]);
    }

    public function generate(): void
    {
        $prompt = trim((string) ($this->data['prompt'] ?? ''));
        if ($prompt === '') {
            Notification::make()->warning()->title('Say what the recipe should be first.')->send();

            return;
        }

        $chef = app(RecipeChefService::class);
        if (! $chef->available()) {
            Notification::make()->danger()->title('OpenRouter is not configured on this server.')->send();

            return;
        }

        $result = $chef->draft(null, $prompt, false);
        AdminAuditLog::record('generated_recipe_draft', null, ['prompt' => $prompt, 'found' => $result['found']]);

        if (! $result['found']) {
            Notification::make()->warning()
                ->title(($result['reason'] ?? 'not_recognized') === 'not_recognized'
                    ? 'Chef could not write a recipe for that. Try describing a dish.'
                    : 'Chef could not answer just now ('.$result['reason'].'). Try again.')
                ->send();

            return;
        }

        $recipe = $result['recipe'];
        $this->hasDraft = true;
        $this->form->fill([
            'prompt' => $prompt,
            'name' => $recipe['name'],
            'minutes' => $recipe['minutes'],
            'category' => $recipe['category'],
            'ingredients' => array_map(fn ($i) => ['name' => $i['name'], 'icon' => FoodIconMatcher::guess($i['name']) ?? 'leftovers'], $recipe['ingredients']),
            'steps' => $recipe['steps'],
            'make_icon' => $this->data['make_icon'] ?? true,
            'add_to_explore' => $this->data['add_to_explore'] ?? true,
        ]);
    }

    public function save(): void
    {
        $state = $this->form->getState();

        $ingredients = array_values(array_map(fn ($i) => ['icon' => $i['icon'], 'name' => $i['name']], $state['ingredients']));
        $steps = array_values(array_map(fn ($s) => is_array($s) ? ($s['step'] ?? reset($s)) : $s, $state['steps']));

        // Tagged once at save time, exactly like a recipe saved from the app.
        $tags = app(AgentService::class)->tagRecipe($state['name'], $ingredients, (int) $state['minutes'], implode("\n", $steps));

        $recipe = Recipe::create([
            'user_id' => null,
            'name' => $state['name'],
            'minutes' => (int) $state['minutes'],
            'category' => $state['category'] ?: null,
            'ingredients' => $ingredients,
            'steps' => $steps,
            'meal_type' => $tags['meal_type'] ?? null,
            'vibes' => $tags['vibes'] ?? [],
            'food_focus' => $tags['food_focus'] ?? [],
            'made_count' => 0,
        ]);

        $iconNote = '';
        if ($state['make_icon'] ?? false) {
            $icon = app(IconGenerationService::class)->generateIcon($recipe->name, (int) Auth::id(), 'recipe');
            if ($icon['ok']) {
                $recipe->update(['icon_url' => $icon['image_url']]);
            } else {
                $iconNote = ' The icon could not be generated ('.($icon['reason'] ?? 'error').'); add one from the recipe page.';
            }
        }

        if ($state['add_to_explore'] ?? false) {
            Artisan::call('app:seed-explore');
        }

        AdminAuditLog::record('created', $recipe, ['name' => $recipe->name, 'via' => 'recipe_studio']);

        Notification::make()->success()->title("Saved “{$recipe->name}” as a curated recipe.".$iconNote)
            ->actions([Action::make('open')->label('Open')->url(RecipeResource::getUrl('edit', ['record' => $recipe]))])
            ->send();

        $this->hasDraft = false;
        $this->form->fill(['prompt' => '', 'make_icon' => $state['make_icon'] ?? true, 'add_to_explore' => $state['add_to_explore'] ?? true]);
    }

    public function discard(): void
    {
        $this->hasDraft = false;
        $this->form->fill(['prompt' => (string) ($this->data['prompt'] ?? ''), 'make_icon' => true, 'add_to_explore' => true]);
    }

    /** The team's most recent curated recipes, so they can see what is already there before writing another. */
    public function recent(): array
    {
        return Recipe::query()->whereNull('user_id')->latest('id')->limit(8)->get(['id', 'name', 'minutes', 'category', 'icon_url'])->all();
    }
}
