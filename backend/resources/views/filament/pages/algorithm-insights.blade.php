<x-filament-panels::page>
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
                        <tr class="border-t border-gray-200 dark:border-gray-700"><td class="p-2">{{ $gap->algo }}</td><td class="p-2">{{ $gap->name_key }}</td><td class="p-2">{{ $gap->events }}</td><td class="p-2">{{ $gap->users }}</td></tr>
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
                    <thead><tr><th class="p-2">Barcode</th><th class="p-2">Typed name</th><th class="p-2">Events</th><th class="p-2">Users</th></tr></thead>
                    <tbody>
                    @foreach ($barcodes as $barcode)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">{{ $barcode->guess }}</td><td class="p-2">{{ $barcode->name_key }}</td>
                            <td class="p-2">{{ $barcode->events }}</td><td class="p-2">{{ $barcode->users }}</td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>
</x-filament-panels::page>
