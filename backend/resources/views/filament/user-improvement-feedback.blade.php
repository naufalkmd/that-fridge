<div class="max-h-96 overflow-auto">
    @if ($events->isEmpty())
        <p class="text-sm text-gray-500">No improvement feedback for this account.</p>
    @else
        <table class="w-full text-left text-sm">
            <thead><tr><th class="p-2">When</th><th class="p-2">Algorithm</th><th class="p-2">Kind</th><th class="p-2">Class / name</th><th class="p-2">Guess</th><th class="p-2">Final</th></tr></thead>
            <tbody>
            @foreach ($events as $event)
                <tr class="border-t border-gray-200 dark:border-gray-700">
                    <td class="p-2">{{ $event->occurred_at }}</td>
                    <td class="p-2">{{ $event->algo }} v{{ $event->rules_v }}</td>
                    <td class="p-2">{{ $event->kind }}</td>
                    <td class="p-2">{{ $event->class ?? $event->name_key ?? '—' }}</td>
                    <td class="p-2">{{ $event->guess ?? $event->guess_number ?? '—' }}</td>
                    <td class="p-2">{{ $event->final ?? $event->final_number ?? '—' }}</td>
                </tr>
            @endforeach
            </tbody>
        </table>
    @endif
</div>
