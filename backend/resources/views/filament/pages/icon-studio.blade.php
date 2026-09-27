<x-filament-panels::page>
    <form wire:submit="generate" class="space-y-4">
        {{ $this->form }}
        <x-filament::button type="submit" wire:loading.attr="disabled" wire:target="generate" icon="heroicon-m-sparkles">
            <span wire:loading.remove wire:target="generate">Generate icon</span>
            <span wire:loading wire:target="generate">Drawing… (10-20 seconds)</span>
        </x-filament::button>
    </form>

    @php($suggested = $this->suggestions())
    <x-filament::section heading="Suggested by users" description="Food people added with no icon in the pack, or whose icon they had to change. Most people first. Names show once {{ \App\Services\AlgorithmInsightsReport::MIN_USERS }}+ different people hit them.">
        @if (count($suggested['rows']) === 0)
            <p class="text-sm text-gray-500">
                Nothing shared by {{ \App\Services\AlgorithmInsightsReport::MIN_USERS }}+ people yet.
                @if ($suggested['hidden'] > 0) {{ $suggested['hidden'] }} rarer {{ \Illuminate\Support\Str::plural('name', $suggested['hidden']) }} kept back. @endif
            </p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Food</th><th class="p-2">Why</th><th class="p-2">People</th><th class="p-2">Items</th><th class="p-2">Last seen</th><th class="p-2"></th></tr></thead>
                    <tbody>
                    @foreach ($suggested['rows'] as $row)
                        <tr class="border-t border-gray-200 dark:border-gray-700" wire:key="suggest-{{ $row['name_key'] }}">
                            <td class="p-2 font-medium">{{ $row['name_key'] }}</td>
                            <td class="p-2">
                                {{ $row['reason'] }}
                                @if ($row['picked'])<span class="text-xs text-gray-500">(people picked {{ $row['picked'] }})</span>@endif
                            </td>
                            <td class="p-2">{{ $row['users'] }}</td>
                            <td class="p-2">{{ $row['items'] }}</td>
                            <td class="p-2">{{ \Illuminate\Support\Carbon::parse($row['last_seen'])->diffForHumans() }}</td>
                            <td class="p-2"><x-filament::button size="xs" wire:click="useSuggestion(@js($row['name_key']))">Use</x-filament::button></td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
            @if ($suggested['hidden'] > 0)
                <p class="mt-2 text-xs text-gray-500">{{ $suggested['hidden'] }} rarer {{ \Illuminate\Support\Str::plural('name', $suggested['hidden']) }} (fewer than {{ \App\Services\AlgorithmInsightsReport::MIN_USERS }} people) kept back.</p>
            @endif
        @endif
    </x-filament::section>

    <x-filament::section heading="Your recent icons" description="Not in the pack yet. Add the good ones; discard the rest. Icons already in the pack live under Content → Shared icon pack.">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            @forelse ($this->recent() as $icon)
                <div class="space-y-2 rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700" wire:key="icon-{{ $icon->id }}" x-data="{ label: @js(\Illuminate\Support\Str::limit(\Illuminate\Support\Str::title(trim((string) $icon->prompt)), 40, '')) }">
                    <img src="{{ $icon->image_url }}" alt="{{ $icon->prompt }}" class="mx-auto h-24 w-24 [image-rendering:pixelated]" />
                    <input type="text" x-model="label" maxlength="40" class="w-full rounded-md border border-gray-300 px-2 py-1 text-center text-sm dark:border-gray-600 dark:bg-gray-800" aria-label="Pack label" />
                    <div class="flex justify-center gap-2">
                        <x-filament::button size="xs" color="success" x-on:click="$wire.addToPack({{ $icon->id }}, label)">Add to pack</x-filament::button>
                        <x-filament::button size="xs" color="danger" outlined wire:click="discard({{ $icon->id }})" wire:confirm="Discard this icon?">Discard</x-filament::button>
                    </div>
                </div>
            @empty
                <p class="col-span-full text-sm text-gray-500">Nothing here yet. Generate an icon above.</p>
            @endforelse
        </div>
    </x-filament::section>
</x-filament-panels::page>
