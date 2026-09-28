<x-filament-widgets::widget>
    @php($lookups = $this->rows())
    <x-filament::section heading="Barcodes we couldn't find" description="Every barcode people scanned that no product source knew, most scanned first. They drop off once they're in the table below. What people named them shows once {{ \App\Services\AlgorithmInsightsReport::MIN_USERS }}+ typed the same name.">
        @if (count($lookups) === 0)
            <p class="text-sm text-gray-500">No failed barcode lookups yet.</p>
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                    <thead><tr><th class="p-2">Barcode</th><th class="p-2">Scans</th><th class="p-2">People</th><th class="p-2">Named as</th><th class="p-2">Last scanned</th><th class="p-2"></th></tr></thead>
                    <tbody>
                    @foreach ($lookups as $row)
                        <tr class="border-t border-gray-200 dark:border-gray-700">
                            <td class="p-2 font-mono">{{ $row['barcode'] }}</td>
                            <td class="p-2">{{ $row['scans'] }}</td>
                            <td class="p-2">{{ $row['users'] }}</td>
                            <td class="p-2">
                                @if ($row['shared_name']) {{ $row['shared_name'] }}
                                @elseif ($row['named']) <span class="text-gray-500">{{ $row['named'] }} named it</span>
                                @else <span class="text-gray-500">-</span> @endif
                            </td>
                            <td class="p-2">{{ \Illuminate\Support\Carbon::parse($row['last_seen'])->diffForHumans() }}</td>
                            <td class="p-2 whitespace-nowrap">
                                <a href="https://world.openfoodfacts.org/product/{{ urlencode($row['barcode']) }}" target="_blank" rel="noopener" class="text-primary-600 hover:underline">Open Food Facts</a>
                                · <a href="{{ \App\Filament\Resources\ProductResource::getUrl('create', array_filter(['barcode' => $row['barcode'], 'name' => $row['shared_name']])) }}" class="text-primary-600 hover:underline">Add product</a>
                            </td>
                        </tr>
                    @endforeach
                    </tbody>
                </table>
            </div>
        @endif
    </x-filament::section>

</x-filament-widgets::widget>
