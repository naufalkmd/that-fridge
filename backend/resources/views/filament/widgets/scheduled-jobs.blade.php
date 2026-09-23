<x-filament-widgets::widget>
    <x-filament::section heading="Scheduled jobs">
        <table class="w-full text-sm">
            <thead>
                <tr class="text-left text-gray-500 dark:text-gray-400">
                    <th class="py-1 font-medium">Job</th>
                    <th class="py-1 font-medium">Runs</th>
                    <th class="py-1 font-medium">Last run</th>
                    <th class="py-1 font-medium">Result</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($jobs as $job)
                    <tr class="border-t border-gray-100 dark:border-white/5">
                        <td class="py-1">{{ $job['label'] }} <span class="text-xs text-gray-500">{{ $job['command'] }}</span></td>
                        <td class="py-1">{{ $job['every'] }}</td>
                        <td class="py-1">{{ $job['at'] ?? 'No run recorded yet' }}</td>
                        <td class="py-1">
                            @if ($job['ok'] === null)
                                <x-filament::badge color="gray">unknown</x-filament::badge>
                            @elseif ($job['ok'])
                                <x-filament::badge color="success">ok</x-filament::badge>
                            @else
                                <x-filament::badge color="danger">failed</x-filament::badge>
                            @endif
                        </td>
                    </tr>
                @endforeach
            </tbody>
        </table>

        <div class="mt-4 flex flex-wrap gap-2">
            {{ $this->pruneDryRunAction }}
            {{ $this->pruneAction }}
            {{ $this->freshnessAction }}
        </div>
    </x-filament::section>

    <x-filament-actions::modals />
</x-filament-widgets::widget>
