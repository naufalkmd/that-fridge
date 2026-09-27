<x-filament-panels::page>
    @php($r = $this->report())
    @php($t = $r['totals'])
    @php($money = fn ($v) => \App\Support\Money::usd((float) $v))
    @php($signed = fn ($v) => \App\Support\Money::signed((float) $v))
    @php($marginStyle = fn ($v) => $v === null ? '' : ($v < 0 ? 'color: rgb(220 38 38); font-weight: 600' : 'color: rgb(22 163 74)'))

    <div class="flex items-center justify-between gap-4">
        <p class="text-sm text-gray-500">
            Cost is what the provider charged per call (fal.ai is estimated). Credits are net of refunds and valued at
            ${{ number_format(\App\Services\AiCostReport::CREDIT_USD, 2) }} each; free monthly credits earn nothing, so treat margin as a best case.
        </p>
        <div class="w-48 shrink-0">
            <x-filament::input.wrapper>
                <x-filament::input.select wire:model.live="days">
                    @foreach (\App\Filament\Pages\AiCosts::PERIODS as $value => $label)
                        <option value="{{ $value }}">{{ $label }}</option>
                    @endforeach
                </x-filament::input.select>
            </x-filament::input.wrapper>
        </div>
    </div>

    <x-filament::section>
        <dl class="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div><dt class="text-gray-500">AI cost</dt><dd class="text-lg font-semibold">{{ $money($t['cost']) }}</dd><dd class="text-xs text-gray-500">{{ number_format($t['calls']) }} calls</dd></div>
            <div><dt class="text-gray-500">Users who used AI</dt><dd class="text-lg font-semibold">{{ number_format($t['users']) }}</dd><dd class="text-xs text-gray-500">{{ $t['users'] ? $money($t['cost'] / $t['users']) : '$0' }} per user</dd></div>
            <div><dt class="text-gray-500">Credits charged</dt><dd class="text-lg font-semibold">{{ number_format($t['credits']) }}</dd><dd class="text-xs text-gray-500">worth {{ $money($t['credit_value']) }}</dd></div>
            <div><dt class="text-gray-500">Margin</dt><dd class="text-lg" style="{{ $marginStyle($t['margin']) }}">{{ $signed($t['margin']) }}</dd><dd class="text-xs text-gray-500">credit value minus AI cost</dd></div>
        </dl>
    </x-filament::section>

    <x-filament::section heading="By feature" description="What each AI feature costs per call and per user, against the credits it charged. A feature with no credits is free to users and pure cost.">
        @if (count($r['features']) === 0)
            <p class="text-sm text-gray-500">No AI calls in this period.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr>
                            <th class="p-2">Feature</th><th class="p-2">Calls</th><th class="p-2">Users</th><th class="p-2">Avg tokens in / out</th>
                            <th class="p-2">Cost</th><th class="p-2">Per call</th><th class="p-2">Per user</th>
                            <th class="p-2">Credits</th><th class="p-2">Credit value</th><th class="p-2">Margin</th><th class="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                    @foreach ($r['features'] as $f)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2 font-medium">{{ $f['feature'] }}</td>
                            <td class="p-2">
                                {{ number_format($f['calls']) }}
                                @if ($f['failed'])<span class="text-xs text-gray-500">({{ $f['failed'] }} failed)</span>@endif
                            </td>
                            <td class="p-2">{{ number_format($f['users']) }}</td>
                            <td class="p-2">
                                {{ $f['calls'] ? number_format($f['prompt_tokens'] / $f['calls']) : 0 }} / {{ $f['calls'] ? number_format($f['completion_tokens'] / $f['calls']) : 0 }}
                            </td>
                            <td class="p-2 font-semibold">
                                {{ $money($f['cost']) }}
                                @if ($f['unpriced'])<span class="text-xs text-gray-500" title="Calls the provider did not report a price for">+{{ $f['unpriced'] }} unpriced</span>@endif
                            </td>
                            <td class="p-2">{{ $f['avg_cost'] === null ? '-' : $money($f['avg_cost']) }}</td>
                            <td class="p-2">{{ $f['cost_per_user'] === null ? '-' : $money($f['cost_per_user']) }}</td>
                            <td class="p-2">{{ $f['credits'] === null ? 'free' : number_format($f['credits']) }}</td>
                            <td class="p-2">{{ $f['credit_value'] === null ? '-' : $money($f['credit_value']) }}</td>
                            <td class="p-2" style="{{ $marginStyle($f['margin']) }}">{{ $f['margin'] === null ? '-' : $signed($f['margin']) }}</td>
                            <td class="p-2"><a href="{{ $this->logUrl(feature: $f['feature']) }}" class="text-primary-600 hover:underline">Calls</a></td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>

    <x-filament::section heading="By user" description="The 25 users whose AI use cost the most. A negative margin means their credits did not cover what their calls cost.">
        @if (count($r['users']) === 0)
            <p class="text-sm text-gray-500">No signed-in AI use in this period.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead>
                        <tr>
                            <th class="p-2">User</th><th class="p-2">Plan</th><th class="p-2">Calls</th><th class="p-2">Cost</th>
                            <th class="p-2">Credits</th><th class="p-2">Margin</th><th class="p-2">Uses most</th><th class="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                    @foreach ($r['users'] as $u)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2">
                                <a href="{{ $this->userUrl($u['user_id']) }}" class="font-medium text-primary-600 hover:underline">{{ $u['name'] ?: 'User #'.$u['user_id'] }}</a>
                                <div class="text-xs text-gray-500">{{ $u['email'] ?? 'deleted account' }}</div>
                            </td>
                            <td class="p-2">{{ $u['pro'] ? 'Pro' : 'Free' }}</td>
                            <td class="p-2">{{ number_format($u['calls']) }}</td>
                            <td class="p-2 font-semibold">{{ $money($u['cost']) }}</td>
                            <td class="p-2">{{ number_format($u['credits']) }}</td>
                            <td class="p-2" style="{{ $marginStyle($u['margin']) }}">{{ $signed($u['margin']) }}</td>
                            <td class="p-2">{{ $u['top_feature'] }}@if ($u['features'] > 1)<span class="text-xs text-gray-500"> +{{ $u['features'] - 1 }} more</span>@endif</td>
                            <td class="p-2"><a href="{{ $this->logUrl(userId: $u['user_id']) }}" class="text-primary-600 hover:underline">Calls</a></td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>
</x-filament-panels::page>
