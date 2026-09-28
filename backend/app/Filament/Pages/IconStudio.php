<?php

namespace App\Filament\Pages;

use App\Models\AdminAuditLog;
use App\Models\GeneratedIcon;
use App\Models\IconAssignment;
use App\Models\Item;
use App\Models\SharedIcon;
use App\Services\AlgorithmInsightsReport;
use App\Services\IconCurator;
use App\Services\IconGenerationService;
use App\Support\AdminCacheKeys;
use App\Support\AlgoFeedback;
use App\Support\FoodIconMatcher;
use App\Support\IconAssignments;
use Filament\Actions\Action;
use Filament\Facades\Filament;
use Filament\Forms;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Generate food icons for the shared pack: type what to draw, look at the result, and add the good ones to the pack (or bin the rest).
 * Uses the same fal.ai pixel-art pipeline as the app, so icons match. Each one costs a fraction of a cent and no user credits; a generation
 * stays in "Your recent icons" until it is added or discarded, so a few tries can be compared side by side.
 */
class IconStudio extends Page implements HasForms
{
    use InteractsWithForms;

    protected static ?string $navigationIcon = 'heroicon-o-paint-brush';

    protected static ?string $navigationGroup = 'Content';

    protected static ?string $navigationLabel = 'Icon studio';

    protected static ?string $title = 'Icon studio';

    protected static ?int $navigationSort = 6;

    protected static string $view = 'filament.pages.icon-studio';

    /** @var array<string, mixed> */
    public array $data = [];

    public static function canAccess(): bool
    {
        $user = Filament::auth()->user();

        return $user !== null && $user->canAccessPanel(Filament::getCurrentPanel());
    }

    public function mount(): void
    {
        // "Make icon" on Algorithm insights' "Items with no icon" list opens here with the name filled in.
        $prompt = request()->query('prompt');
        $this->form->fill(['prompt' => is_string($prompt) ? mb_substr(trim($prompt), 0, 120) : '']);
    }

    public function form(Form $form): Form
    {
        return $form->statePath('data')->schema([
            Forms\Components\TextInput::make('prompt')
                ->label('What food should the icon show?')
                ->placeholder('e.g. ripe tomato, a bowl of ramen, sliced avocado')
                ->helperText('One item, described simply. The pixel-art style is added for you.')
                ->required()->maxLength(80),
        ]);
    }

    /** Names users couldn't get a right icon for - see AlgorithmInsightsReport::iconSuggestions. */
    public function suggestions(): array
    {
        return Cache::flexible(AdminCacheKeys::ICON_SUGGESTIONS, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->iconSuggestions());
    }

    /**
     * Pick the icon for a suggested food name: one of the pack icons, a shared icon, or an icon a
     * user generated for this name (promoted to the shared pack on the way). New items, scans and
     * barcode products with that name get it from then on; optionally the existing items too.
     */
    public function pickIconAction(): Action
    {
        return Action::make('pickIcon')
            ->label('Pick icon')
            ->icon('heroicon-m-photo')
            ->size('xs')
            ->modalHeading(fn (array $arguments) => 'Icon for "'.($arguments['name'] ?? '').'"')
            ->modalDescription('Items with this name will show it from now on.')
            ->form(fn (array $arguments) => [
                Forms\Components\Select::make('choice')
                    ->label('Icon')
                    ->searchable()
                    ->allowHtml()
                    ->required()
                    ->options(fn () => $this->iconChoices((string) ($arguments['name'] ?? ''))),
                Forms\Components\Toggle::make('apply_existing')
                    ->label(fn () => 'Also update the '.$this->unnamedItemCount((string) ($arguments['name'] ?? '')).' existing items with this name and no icon')
                    ->default(true)
                    ->visible(fn () => $this->unnamedItemCount((string) ($arguments['name'] ?? '')) > 0),
            ])
            ->action(fn (array $data, array $arguments) => $this->assign(
                (string) ($arguments['name'] ?? ''), (string) $data['choice'], (bool) ($data['apply_existing'] ?? false),
            ));
    }

    public function removeAssignmentAction(): Action
    {
        return Action::make('removeAssignment')
            ->label('Remove')
            ->color('danger')
            ->size('xs')
            ->requiresConfirmation()
            ->modalDescription('New items with this name go back to the pack\'s own guess. Items already updated keep their icon.')
            ->action(function (array $arguments) {
                $a = IconAssignment::find($arguments['id'] ?? null);
                if ($a) {
                    AdminAuditLog::record('deleted', $a, ['before' => $a->only(['name_key', 'icon', 'icon_url'])]);
                    $a->delete();
                    $this->flushIconCaches();
                }
            });
    }

    /** @return array<string, array<string, string>> Select options, grouped, as HTML with a preview. */
    public function iconChoices(string $name): array
    {
        $option = fn (?string $url, string $label) => '<span style="display:flex;align-items:center;gap:8px">'
            .($url ? '<img src="'.e($url).'" alt="" style="width:28px;height:28px;image-rendering:pixelated">' : '')
            .'<span>'.e($label).'</span></span>';

        $groups = [];
        $made = $this->userIconsFor($name, 12);
        if ($made !== []) {
            $groups['Made by users for this name'] = collect($made)->mapWithKeys(fn ($g) => ["gen:{$g->id}" => $option($g->image_url, "User icon #{$g->id}")])->all();
        }
        $shared = SharedIcon::query()->orderBy('label')->limit(300)->get(['id', 'label', 'image_url']);
        if ($shared->isNotEmpty()) {
            $groups['Shared icons'] = $shared->mapWithKeys(fn ($i) => ["shared:{$i->id}" => $option($i->image_url, (string) $i->label)])->all();
        }
        $groups['Pixel pack'] = collect(FoodIconMatcher::packOptions())
            ->mapWithKeys(fn ($label, $key) => ["pack:{$key}" => $option(FoodIconMatcher::imageUrl($key), $label)])->all();

        return $groups;
    }

    /** Icons users generated for this food name (their prompt was the name), newest first. */
    public function userIconsFor(string $name, int $limit = 3): array
    {
        return GeneratedIcon::query()
            ->whereRaw('lower(trim(prompt)) = ?', [mb_strtolower(trim($name))])
            ->latest('id')->limit($limit)->get(['id', 'image_url', 'image_path', 'prompt'])->all();
    }

    /** Items called this (same name key) that still have no icon. */
    public function unnamedItemCount(string $name): int
    {
        return count($this->unnamedItemIds($name));
    }

    /** @return list<int> */
    private function unnamedItemIds(string $name): array
    {
        $key = AlgoFeedback::nameKey($name);
        if ($key === null) {
            return [];
        }
        $ids = [];
        Item::query()->whereIn('icon', ['generic', ''])->whereNull('icon_url')->select(['id', 'name'])
            ->chunkById(500, function ($items) use ($key, &$ids) {
                foreach ($items as $item) {
                    if (AlgoFeedback::nameKey($item->name) === $key) {
                        $ids[] = $item->id;
                    }
                }
            });

        return $ids;
    }

    public function assign(string $name, string $choice, bool $applyExisting): void
    {
        $key = AlgoFeedback::nameKey($name);
        if ($key === null) {
            return;
        }

        [$kind, $ref] = array_pad(explode(':', $choice, 2), 2, '');
        $icon = null;
        $url = null;
        $sharedId = null;
        try {
            if ($kind === 'pack' && FoodIconMatcher::fileFor($ref) !== null) {
                $icon = $ref;
            } elseif ($kind === 'shared' && ($shared = SharedIcon::find((int) $ref))) {
                [$url, $sharedId] = [$shared->image_url, $shared->id];
            } elseif ($kind === 'gen' && ($gen = GeneratedIcon::find((int) $ref))) {
                // A user's icon becomes a shared one first, so it lives in the pack for everyone.
                $shared = app(IconCurator::class)->promote($gen, Str::limit(Str::title($name), 40, ''));
                [$url, $sharedId] = [$shared->image_url, $shared->id];
            } else {
                Notification::make()->danger()->title('That icon is no longer available.')->send();

                return;
            }
        } catch (RuntimeException $e) {
            Notification::make()->danger()->title($e->getMessage())->send();

            return;
        }

        $assignment = IconAssignment::updateOrCreate(['name_key' => $key], [
            'icon' => $icon, 'icon_url' => $url, 'shared_icon_id' => $sharedId, 'assigned_by' => Auth::id(),
        ]);
        $updated = 0;
        if ($applyExisting) {
            $ids = $this->unnamedItemIds($name);
            $updated = $ids === [] ? 0 : Item::query()->whereIn('id', $ids)->update(['icon' => $icon ?? 'generic', 'icon_url' => $url]);
        }
        AdminAuditLog::record('assigned_icon', $assignment, ['after' => ['name_key' => $key, 'icon' => $icon, 'icon_url' => $url], 'items_updated' => $updated]);
        $this->flushIconCaches();

        Notification::make()->success()
            ->title("\"{$key}\" has an icon now")
            ->body($updated ? "{$updated} existing items updated too." : 'New items with this name will use it.')
            ->send();
    }

    /** @return list<array{id: int, name_key: string, image: ?string, updated_at: string}> */
    public function assignments(): array
    {
        return IconAssignment::query()->latest('updated_at')->limit(100)->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'name_key' => $a->name_key,
                'image' => $a->icon_url ?? FoodIconMatcher::imageUrl($a->icon),
                'updated_at' => (string) $a->updated_at,
            ])->all();
    }

    private function flushIconCaches(): void
    {
        IconAssignments::flush();
        Cache::forget(AdminCacheKeys::ICON_SUGGESTIONS);
        Cache::forget(AdminCacheKeys::ICON_MISSES);
    }

    /** Put a suggested name in the prompt, ready to generate. */
    public function useSuggestion(string $name): void
    {
        $this->form->fill(['prompt' => mb_substr(trim($name), 0, 80)]);
    }

    public function generate(): void
    {
        $prompt = trim((string) $this->form->getState()['prompt']);

        $service = app(IconGenerationService::class);
        if (! $service->available()) {
            Notification::make()->danger()->title('fal.ai is not configured on this server.')->send();

            return;
        }

        $result = $service->generateIcon($prompt, (int) Auth::id(), 'icon');
        AdminAuditLog::record('generated_icon', null, ['prompt' => $prompt, 'ok' => $result['ok']]);

        if (! $result['ok']) {
            Notification::make()->danger()->title('Could not generate that icon ('.($result['reason'] ?? 'error').'). Try again.')->send();

            return;
        }

        Notification::make()->success()->title('Icon ready. Add it to the pack or try again.')->send();
    }

    public function addToPack(int $id, ?string $label = null): void
    {
        $icon = $this->mine()->find($id);
        if (! $icon) {
            return;
        }

        try {
            $shared = app(IconCurator::class)->promote($icon, $label ? Str::limit(trim($label), 40, '') : null);
        } catch (RuntimeException $e) {
            Notification::make()->danger()->title($e->getMessage())->send();

            return;
        }

        AdminAuditLog::record('promoted_icon', $shared, ['generated_icon_id' => $icon->id, 'label' => $shared->label, 'via' => 'icon_studio']);
        Notification::make()->success()->title('Added to the shared pack.')->send();
    }

    public function discard(int $id): void
    {
        $icon = $this->mine()->find($id);
        if (! $icon) {
            return;
        }

        Storage::disk(config('filesystems.media_disk'))->delete($icon->image_path);
        $icon->delete();
        AdminAuditLog::record('deleted', $icon, ['prompt' => $icon->prompt, 'via' => 'icon_studio']);
    }

    /** This admin's icons that have not been added to the pack, newest first. */
    public function recent(): array
    {
        return $this->mine()->latest('id')->limit(12)->get()->all();
    }

    /** Only icons this admin generated here and that are not in the pack yet: never someone else's or a published one. */
    private function mine()
    {
        return GeneratedIcon::query()
            ->where('user_id', Auth::id())->where('kind', 'icon')
            ->whereDoesntHave('sharedIcon');
    }
}
