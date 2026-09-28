<?php

namespace App\Filament\Resources\ProductResource\Widgets;

use App\Services\AlgorithmInsightsReport;
use App\Support\AdminCacheKeys;
use Filament\Widgets\Widget;
use Illuminate\Support\Facades\Cache;

/** On Products: the barcodes people scanned that no product source knew, to add as products. */
class BarcodeMisses extends Widget
{
    protected static string $view = 'filament.resources.product-resource.widgets.barcode-misses';

    protected int|string|array $columnSpan = 'full';

    protected static bool $isLazy = false;

    /** @return list<array{barcode: string, scans: int, users: int, named: int, shared_name: ?string, last_seen: string}> */
    public function rows(): array
    {
        return Cache::flexible(AdminCacheKeys::BARCODE_LOOKUP_MISSES, AdminCacheKeys::DASHBOARD_TTL,
            fn () => app(AlgorithmInsightsReport::class)->barcodeLookupMisses());
    }
}
