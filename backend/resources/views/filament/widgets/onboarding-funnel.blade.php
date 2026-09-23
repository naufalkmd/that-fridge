<x-filament-widgets::widget>
    <x-filament::section heading="Onboarding funnel (last {{ $days }} days)">
        <table class="w-full text-sm">
            <thead>
                <tr class="text-left text-gray-500 dark:text-gray-400">
                    <th class="py-1 font-medium">Step</th>
                    <th class="py-1 text-right font-medium">Events</th>
                    <th class="py-1 text-right font-medium">Unique</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($steps as $step)
                    <tr class="border-t border-gray-100 dark:border-white/5">
                        <td class="py-1" style="white-space: pre">{{ $step['label'] }}</td>
                        <td class="py-1 text-right" style="font-variant-numeric: tabular-nums">{{ number_format($step['events']) }}</td>
                        <td class="py-1 text-right" style="font-variant-numeric: tabular-nums">{{ number_format($step['unique']) }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>

        @if ($authMethods)
            <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Auth methods:
                @foreach ($authMethods as $method => $count)
                    {{ $method }} {{ $count }}@if (! $loop->last) · @endif
                @endforeach
            </p>
        @endif

        @if ($other)
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Other events seen: {{ implode(', ', $other) }}</p>
        @endif
    </x-filament::section>
</x-filament-widgets::widget>
