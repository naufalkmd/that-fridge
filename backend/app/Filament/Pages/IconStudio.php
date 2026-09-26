<?php

namespace App\Filament\Pages;

use App\Models\AdminAuditLog;
use App\Models\GeneratedIcon;
use App\Services\IconCurator;
use App\Services\IconGenerationService;
use Filament\Facades\Filament;
use Filament\Forms;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Forms\Contracts\HasForms;
use Filament\Forms\Form;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Auth;
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
        $this->form->fill(['prompt' => '']);
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
