<x-filament-panels::page>
    <form wire:submit="save" class="space-y-4">
        {{ $this->form }}

        <div class="flex flex-wrap items-center gap-3">
            <x-filament::button type="button" wire:click="generate" wire:loading.attr="disabled" wire:target="generate" icon="heroicon-m-sparkles" :color="$hasDraft ? 'gray' : 'primary'">
                <span wire:loading.remove wire:target="generate">{{ $hasDraft ? 'Write another version' : 'Write recipe' }}</span>
                <span wire:loading wire:target="generate">Chef is writing… (10-20 seconds)</span>
            </x-filament::button>

            @if ($hasDraft)
                <x-filament::button type="submit" wire:loading.attr="disabled" wire:target="save" color="success" icon="heroicon-m-check">
                    <span wire:loading.remove wire:target="save">Save as curated recipe</span>
                    <span wire:loading wire:target="save">Saving…</span>
                </x-filament::button>
                <x-filament::button type="button" wire:click="discard" color="danger" outlined>Discard draft</x-filament::button>
            @endif
        </div>
    </form>

    <x-filament::section heading="Latest curated recipes" description="Already in the app for everyone. Edit or delete them under Content → Recipes.">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            @forelse ($this->recent() as $recipe)
                <div class="flex items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    @if ($recipe->icon_url)
                        <img src="{{ $recipe->icon_url }}" alt="" class="h-10 w-10 shrink-0 [image-rendering:pixelated]" />
                    @endif
                    <div class="min-w-0">
                        <p class="truncate text-sm font-semibold">{{ $recipe->name }}</p>
                        <p class="text-xs text-gray-500">{{ $recipe->minutes }} min{{ $recipe->category ? ' · '.ucfirst($recipe->category) : '' }}</p>
                    </div>
                </div>
            @empty
                <p class="text-sm text-gray-500">No curated recipes yet.</p>
            @endforelse
        </div>
    </x-filament::section>
</x-filament-panels::page>
