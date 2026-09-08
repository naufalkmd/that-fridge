<?php

namespace App\Http\Controllers;

use App\Models\GeneratedIcon;
use App\Models\SharedIcon;
use App\Services\CreditService;
use App\Services\IconGenerationService;
use App\Support\CreditCost;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class IconController extends Controller
{
    public function __construct(
        protected IconGenerationService $iconService,
        protected CreditService $credits,
    ) {}

    /**
     * Every icon a user generates is already persisted (see IconGenerationService), so their
     * "library" is just that history surfaced back to them - no separate save step needed.
     */
    public function index(Request $request)
    {
        $icons = GeneratedIcon::where('user_id', $request->user()->id)
            ->latest()
            ->limit(60)
            ->get(['id', 'kind', 'prompt', 'image_url'])
            ->map(fn ($icon) => [
                'id' => (string) $icon->id,
                'kind' => $icon->kind,
                'prompt' => $icon->prompt,
                'image_url' => $icon->image_url,
            ]);

        return response()->json(['data' => $icons]);
    }

    /**
     * The app-wide shared pack - icons hand-picked from users' generations (app:promote-icon)
     * and de-identified. Shown in the picker for everyone, alongside the bundled pixel-art set.
     */
    public function shared()
    {
        $icons = SharedIcon::latest()
            ->limit(120)
            ->get(['id', 'label', 'image_url'])
            ->map(fn ($icon) => [
                'id' => (string) $icon->id,
                'label' => $icon->label,
                'image_url' => $icon->image_url,
            ]);

        return response()->json(['data' => $icons]);
    }

    public function generate(Request $request)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'max:200'],
            // What the image is for. Both cost 1 credit today; the field exists so recipe
            // images can be re-priced or moved to a different model without touching icons.
            'kind' => ['sometimes', Rule::in(array_keys(IconGenerationService::CREDIT_COST))],
        ]);
        $kind = $data['kind'] ?? 'icon';

        // Metered in AI credits (402 with the shortfall when the balance is short).
        $this->credits->spend($request->user(), CreditCost::ICON, 'icon');

        $result = $this->iconService->generateIcon($data['prompt'], $request->user()->id, $kind);

        if (! $result['ok']) {
            $this->credits->grant($request->user(), CreditCost::ICON, 'icon_refund');

            return response()->json(['message' => 'Failed to generate icon'], 502);
        }

        return response()->json([
            'icon_url' => $result['image_url'],
            'generated_icon_id' => (string) $result['generated_icon_id'],
        ]);
    }

    public function destroy(Request $request, GeneratedIcon $generatedIcon)
    {
        $this->authorize('delete', $generatedIcon);

        Storage::disk(config('filesystems.media_disk'))->delete($generatedIcon->image_path);
        $generatedIcon->delete();

        return response()->noContent();
    }
}
