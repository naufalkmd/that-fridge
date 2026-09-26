<x-filament-widgets::widget>
    <x-filament::section>
        <x-slot name="heading">To-do</x-slot>
        <x-slot name="description">
            <span @class(['font-medium', 'text-danger-600 dark:text-danger-400' => $urgent || $overdue])>{{ $countdown }}</span>
            · {{ $blockerCount }} launch {{ \Illuminate\Support\Str::plural('blocker', $blockerCount) }} open · {{ $openCount }} open in total
        </x-slot>

        @forelse ($todos as $todo)
            <div class="flex items-start gap-3 border-t border-gray-100 py-2 first:border-t-0 dark:border-white/5" wire:key="todo-{{ $todo->id }}">
                <button type="button" wire:click="markDone({{ $todo->id }})" title="Mark done"
                    class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-gray-300 hover:border-success-500 dark:border-gray-600"></button>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <x-filament::badge :color="match ($todo->priority) { 'blocker' => 'danger', 'high' => 'warning', 'normal' => 'info', default => 'gray' }" size="xs">
                            {{ \App\Models\AdminTodo::PRIORITIES[$todo->priority] }}
                        </x-filament::badge>
                        <span class="text-sm font-medium">{{ $todo->title }}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">{{ \App\Models\AdminTodo::CATEGORIES[$todo->category] }}@if ($todo->due_on) · due {{ $todo->due_on->format('M j') }}@endif</span>
                    </div>
                    @if ($todo->details)
                        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{{ \Illuminate\Support\Str::limit($todo->details, 160) }}</p>
                    @endif
                </div>
                @if ($todo->link)
                    <a href="{{ $todo->link }}" target="_blank" rel="noopener" class="text-xs text-primary-600 hover:underline dark:text-primary-400">Open</a>
                @endif
            </div>
        @empty
            <p class="text-sm text-gray-500 dark:text-gray-400">Nothing open. Nicely done.</p>
        @endforelse

        <div class="mt-3 text-right">
            <a href="{{ $listUrl }}" class="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">See the full list &rarr;</a>
        </div>
    </x-filament::section>
</x-filament-widgets::widget>
