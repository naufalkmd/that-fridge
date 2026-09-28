<x-filament-panels::page>
    @if ($this->usingTestKey())
        <x-filament::section>
            <p class="text-sm" style="color: rgb(217 119 6)">
                Using TheMealDB's public test key, which is for development only. Set <code>THEMEALDB_KEY</code> to your
                supporter key on the server before importing for real.
            </p>
        </x-filament::section>
    @endif

    <x-filament::section heading="Schedule" description="Recipes come from TheMealDB and are added to Explore as drafts - nothing reaches users until you publish it.">
        <form wire:submit="save" class="space-y-4">
            {{ $this->form }}
            <x-filament::button type="submit">Save schedule</x-filament::button>
        </form>
    </x-filament::section>

    <x-filament::section heading="Last run">
        @php($last = $this->lastRun())
        @if ($last === null)
            <p class="text-sm text-gray-500">Not run yet. Use "Run now" above to try it.</p>
        @else
            <dl class="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                <div><dt class="text-gray-500">When</dt><dd class="font-semibold">{{ \Illuminate\Support\Carbon::parse($last['at'])->diffForHumans() }}</dd><dd class="text-xs text-gray-500">{{ $last['trigger'] === 'scheduled' ? 'daily schedule' : 'run by hand' }}</dd></div>
                <div><dt class="text-gray-500">Added</dt><dd class="text-lg font-semibold">{{ $last['imported'] }}</dd></div>
                <div><dt class="text-gray-500">Already imported</dt><dd class="text-lg font-semibold">{{ $last['exists'] }}</dd></div>
                <div><dt class="text-gray-500">Duplicates skipped</dt><dd class="text-lg font-semibold">{{ $last['duplicate'] }}</dd></div>
                <div><dt class="text-gray-500">Too thin</dt><dd class="text-lg font-semibold">{{ $last['low_quality'] }}</dd></div>
            </dl>
        @endif
        <p class="mt-3 text-sm text-gray-500">
            Each run picks at random from the recipes not imported yet, and never imports one twice.
            @if (isset($last['left'])) About {{ $last['left'] }} left to try. @endif
        </p>
    </x-filament::section>

    <x-filament::section heading="Waiting for you">
        <p class="text-sm">
            {{ $this->draftsWaiting() }} imported {{ \Illuminate\Support\Str::plural('recipe', $this->draftsWaiting()) }} waiting as drafts.
            <a href="{{ $this->draftsUrl() }}" class="text-primary-600 hover:underline">Review and publish in Explore →</a>
        </p>
    </x-filament::section>
</x-filament-panels::page>
