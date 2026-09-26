<x-filament-panels::page>
    <x-filament::section heading="fal.ai" description="fal.ai does not expose its balance to API keys, so it is entered by hand. OpenRouter's balance is read live.">
        <form wire:submit="save" class="space-y-4">
            {{ $this->form }}
            <x-filament::button type="submit">Save balance</x-filament::button>
        </form>
    </x-filament::section>

    <x-filament::section heading="Earlier readings">
        <table class="w-full text-left text-sm">
            <thead><tr><th class="p-2">When</th><th class="p-2">Balance</th></tr></thead>
            <tbody>
            @foreach ($this->history() as $row)
                <tr class="border-t border-gray-200 dark:border-gray-700">
                    <td class="p-2">{{ $row->recorded_at->format('j M Y H:i') }}</td>
                    <td class="p-2">{{ \App\Support\Money::usd($row->balance_usd) }}</td>
                </tr>
            @endforeach
            </tbody>
        </table>
    </x-filament::section>
</x-filament-panels::page>
