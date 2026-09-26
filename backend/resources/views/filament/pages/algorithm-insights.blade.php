<x-filament-panels::page>
    @php($health = $this->health())
    <x-filament::section heading="Data health" description="Is collection alive? Yesterday vs the previous 7-day daily average, and the share of last week's events with no class (a rule that stopped matching).">
        @if (! $health['enabled'])
            <p class="text-sm font-semibold text-danger-600">Collection is OFF (ALGO_FEEDBACK_ENABLED=false) - nothing is being recorded.</p>
        @elseif (count($health['rows']) === 0)
            <p class="text-sm text-gray-500">Collection is on; no events recorded in the last 30 days yet.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Algorithm</th><th class="p-2">Yesterday</th><th class="p-2">Prior 7-day avg</th><th class="p-2">Status</th><th class="p-2">No-class rate</th><th class="p-2">Last event</th></tr></thead>
                    <tbody>
                    @foreach ($health['rows'] as $row)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">{{ $row['algo'] }}</td>
                            <td class="p-2">{{ number_format($row['yesterday']) }}</td>
                            <td class="p-2">{{ $row['baseline'] }}</td>
                            <td class="p-2">{{ $row['dropped'] ? 'Volume dropped' : 'OK' }}</td>
                            <td class="p-2">{{ $row['no_class_rate'] === null ? '-' : $row['no_class_rate'].'%' }}</td>
                            <td class="p-2">{{ $row['last_event'] ?? '-' }}</td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>

    @php($m = $this->metrics())
    <x-filament::section heading="Outcome metrics" description="Last {{ $m['days'] }} days, from feedback events. Waste rate counts the classifier's used/wasted decision at removal time, before any corrections.">
        <dl class="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><dt class="text-gray-500">Waste rate</dt><dd class="text-lg font-semibold">{{ $m['waste_rate'] === null ? '-' : $m['waste_rate'].'%' }}</dd><dd class="text-xs text-gray-500">{{ $m['removed_wasted'] }} wasted / {{ $m['removed_used'] }} used</dd></div>
            <div><dt class="text-gray-500">Items used up</dt><dd class="text-lg font-semibold">{{ number_format($m['removed_used']) }}</dd></div>
            <div><dt class="text-gray-500">Expiry alert action rate</dt><dd class="text-lg font-semibold">{{ $m['expiry_alert_action_rate'] === null ? '-' : $m['expiry_alert_action_rate'].'%' }}</dd><dd class="text-xs text-gray-500">removed within 24h of {{ $m['expiry_alerts_sent'] }} alerts</dd></div>
            <div><dt class="text-gray-500">Low-stock action rate</dt><dd class="text-lg font-semibold">{{ $m['low_stock_action_rate'] === null ? '-' : $m['low_stock_action_rate'].'%' }}</dd><dd class="text-xs text-gray-500">{{ $m['low_stock_alerts_sent'] }} alerts</dd></div>
            <div><dt class="text-gray-500">Recipes made from a suggestion</dt><dd class="text-lg font-semibold">{{ number_format($m['recipes_made_from_suggestions']) }}</dd></div>
            <div><dt class="text-gray-500">Made recipe was #1</dt><dd class="text-lg font-semibold">{{ $m['recipe_top1_rate'] === null ? '-' : $m['recipe_top1_rate'].'%' }}</dd></div>
            <div><dt class="text-gray-500">Made recipe was in top 3</dt><dd class="text-lg font-semibold">{{ $m['recipe_top3_rate'] === null ? '-' : $m['recipe_top3_rate'].'%' }}</dd></div>
            <div><dt class="text-gray-500">Add time per item</dt><dd class="text-sm">
                @forelse ($m['add_seconds_by_source'] as $t)
                    {{ $t['source'] }}: {{ $t['seconds'] }}s ({{ $t['events'] }})<br>
                @empty
                    -
                @endforelse
            </dd></div>
        </dl>
    </x-filament::section>

    @php($cohorts = $this->retention())
    <x-filament::section heading="Retention" description="Signup cohorts by week: share who opened the app at least 1 / 7 / 30 days after signing up (only days old enough are counted).">
        @if (count($cohorts) === 0)
            <p class="text-sm text-gray-500">No signups in the last 8 weeks.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Week of</th><th class="p-2">Signups</th><th class="p-2">D1</th><th class="p-2">D7</th><th class="p-2">D30</th></tr></thead>
                    <tbody>
                    @foreach ($cohorts as $c)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">{{ $c['week'] }}</td><td class="p-2">{{ $c['users'] }}</td>
                            <td class="p-2">{{ $c['d1'] === null ? '-' : $c['d1'].'%' }}</td>
                            <td class="p-2">{{ $c['d7'] === null ? '-' : $c['d7'].'%' }}</td>
                            <td class="p-2">{{ $c['d30'] === null ? '-' : $c['d30'].'%' }}</td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Scoreboard" description="Daily rollups for the last 30 days, split by rule version. Yesterday's data appears after the nightly rollup.">
        @php($rows = $this->scoreboard())
        @if (count($rows) === 0)
            <p class="text-sm text-gray-500">No feedback yet.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Algorithm</th><th class="p-2">Rules</th><th class="p-2">Events</th><th class="p-2">Corrections</th><th class="p-2">Correction rate</th><th class="p-2">Daily volume</th></tr></thead>
                    <tbody>
                    @foreach ($rows as $row)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">{{ $row['algo'] }}</td>
                            <td class="p-2">v{{ $row['rules_v'] }}</td>
                            <td class="p-2">{{ number_format($row['events']) }}</td>
                            <td class="p-2">{{ number_format($row['corrections']) }}</td>
                            <td class="p-2">{{ $row['correction_rate'] }}%</td>
                            <td class="p-2" aria-label="Daily event counts">{{ implode(' · ', $row['trend']) }}</td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Per-algorithm detail" description="Last 30 days by kind / outcome / source, plus the guess-to-final pairs people keep correcting (shown after {{ \App\Services\AlgorithmInsightsReport::MIN_USERS }}+ different people).">
        @if (count($this->algos()) === 0)
            <p class="text-sm text-gray-500">No feedback yet.</p>
        @else
            <div class="mb-4 flex flex-wrap gap-2">
                @foreach ($this->algos() as $name)
                    <x-filament::button size="sm" :color="$name === $this->algo ? 'primary' : 'gray'" wire:click="$set('algo', '{{ $name }}')">{{ $name }}</x-filament::button>
                @endforeach
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Kind</th><th class="p-2">Outcome</th><th class="p-2">Source</th><th class="p-2">Events</th><th class="p-2">Users</th><th class="p-2">Avg guess</th><th class="p-2">Avg final</th></tr></thead>
                    <tbody>
                    @foreach ($this->breakdown() as $row)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">{{ $row['kind'] }}</td><td class="p-2">{{ $row['outcome'] ?? '-' }}</td><td class="p-2">{{ $row['source'] ?? '-' }}</td>
                            <td class="p-2">{{ $row['events'] }}</td><td class="p-2">{{ $row['users'] }}</td>
                            <td class="p-2">{{ $row['avg_guess'] === null ? '-' : round($row['avg_guess'], 1) }}</td>
                            <td class="p-2">{{ $row['avg_final'] === null ? '-' : round($row['avg_final'], 1) }}</td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
            @php($corrections = $this->topCorrections())
            @if (count($corrections) > 0)
                <h4 class="mb-2 mt-6 text-sm font-semibold">Most-corrected guesses</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead><tr><th class="p-2">Guess</th><th class="p-2">Changed to</th><th class="p-2">Events</th><th class="p-2">Users</th></tr></thead>
                        <tbody>
                        @foreach ($corrections as $row)
                            <tr class="border-t border-gray-200 dark:border-gray-700"><td class="p-2">{{ $row['guess'] }}</td><td class="p-2">{{ $row['final'] }}</td><td class="p-2">{{ $row['events'] }}</td><td class="p-2">{{ $row['users'] }}</td></tr>
                        @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        @endif
    </x-filament::section>

    @php($suggestions = $this->ruleSuggestions())
    <x-filament::section heading="Rule suggestions" description="Consistent corrections from {{ \App\Services\AlgorithmInsightsReport::ACT_USERS }}+ different people. Text for a human to review and copy - nothing is applied automatically.">
        @if (count($suggestions) === 0)
            <p class="text-sm text-gray-500">No consistent corrections yet.</p>
        @else
            <ul class="list-disc space-y-1 pl-5 text-sm">
                @foreach ($suggestions as $row)
                    <li>{{ $row['suggestion'] }}</li>
                @endforeach
            </ul>
        @endif
    </x-filament::section>

    <x-filament::section heading="Unclassified names" description="Shown only after three different people supplied the same name.">
        @php($gaps = $this->gaps())
        @if (count($gaps) === 0)
            <p class="text-sm text-gray-500">No shared gaps yet.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Algorithm</th><th class="p-2">Name</th><th class="p-2">Events</th><th class="p-2">Users</th></tr></thead>
                    <tbody>
                    @foreach ($gaps as $gap)
                        <tr class="border-t border-gray-200 dark:border-gray-700"><td class="p-2">{{ $gap['algo'] }}</td><td class="p-2">{{ $gap['name_key'] }}</td><td class="p-2">{{ $gap['events'] }}</td><td class="p-2">{{ $gap['users'] }}</td></tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>

    <x-filament::section heading="Unknown barcodes" description="A barcode and typed name appear after at least three different people save the same pair. Review before adding it to Products.">
        @php($barcodes = $this->barcodeMisses())
        @if (count($barcodes) === 0)
            <p class="text-sm text-gray-500">No shared barcode misses yet.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Barcode</th><th class="p-2">Typed name</th><th class="p-2">Events</th><th class="p-2">Users</th><th class="p-2"></th></tr></thead>
                    <tbody>
                    @foreach ($barcodes as $barcode)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">{{ $barcode['guess'] }}</td><td class="p-2">{{ $barcode['name_key'] }}</td>
                            <td class="p-2">{{ $barcode['events'] }}</td><td class="p-2">{{ $barcode['users'] }}</td>
                            <td class="p-2"><x-filament::button size="xs" wire:click="createProduct('{{ $barcode['guess'] }}', '{{ addslashes($barcode['name_key']) }}')" wire:confirm="Create a Product for this barcode?">Create Product</x-filament::button></td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>
    @php($icons = $this->iconRequests())
    <x-filament::section heading="Icon requests" description="What people generate icons for (free text they typed), shown only when {{ \App\Services\AlgorithmInsightsReport::MIN_USERS }}+ different people asked. Promote good ones from Shared icons.">
        @if (count($icons) === 0)
            <p class="text-sm text-gray-500">No shared icon requests yet.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Prompt</th><th class="p-2">Requests</th><th class="p-2">Users</th></tr></thead>
                    <tbody>
                    @foreach ($icons as $row)
                        <tr class="border-t border-gray-200 dark:border-gray-700"><td class="p-2">{{ $row['prompt'] }}</td><td class="p-2">{{ $row['requests'] }}</td><td class="p-2">{{ $row['users'] }}</td></tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>
</x-filament-panels::page>
