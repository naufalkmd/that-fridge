<x-filament-widgets::widget>
    <x-filament::section heading="Onboarding funnel (last {{ $days }} days)" description="Each bar is the share of people who reached that step, compared with the first step.">
        <table class="w-full text-sm">
            <thead>
                <tr class="text-left text-gray-500 dark:text-gray-400">
                    <th class="py-1 font-medium">Step</th>
                    <th class="py-1 font-medium" style="width: 40%">Still with us (unique people)</th>
                    <th class="py-1 text-right font-medium">Unique</th>
                    <th class="py-1 text-right font-medium">Events</th>
                </tr>
            </thead>
            <tbody>
                @php($top = max(1, (int) ($steps[0]['unique'] ?? 0)))
                @foreach ($steps as $step)
                    @php($pct = min(100, (int) round($step['unique'] / $top * 100)))
                    <tr class="border-t border-gray-100 dark:border-white/5">
                        <td class="py-1" style="white-space: pre">{{ $step['label'] }}</td>
                        <td class="py-1">
                            <div class="flex items-center gap-2">
                                <div class="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                                    <div class="h-2 rounded-full bg-amber-500" style="width: {{ $pct }}%"></div>
                                </div>
                                <span class="w-10 text-right text-xs text-gray-500 dark:text-gray-400" style="font-variant-numeric: tabular-nums">{{ $pct }}%</span>
                            </div>
                        </td>
                        <td class="py-1 text-right" style="font-variant-numeric: tabular-nums">{{ number_format($step['unique']) }}</td>
                        <td class="py-1 text-right text-gray-500 dark:text-gray-400" style="font-variant-numeric: tabular-nums">{{ number_format($step['events']) }}</td>
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
