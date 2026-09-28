<?php

namespace App\Filament\Resources\ProductResource\Pages;

use App\Filament\Concerns\AuditsCreates;
use App\Filament\Resources\ProductResource;
use Filament\Resources\Pages\CreateRecord;

class CreateProduct extends CreateRecord
{
    use AuditsCreates;

    protected static string $resource = ProductResource::class;

    /** "Add product" on Algorithm insights' "Barcodes we couldn't find" opens here with it filled in. */
    protected function afterFill(): void
    {
        $barcode = request()->query('barcode');
        $name = request()->query('name');
        $this->form->fill(array_filter([
            'barcode' => is_string($barcode) ? mb_substr(trim($barcode), 0, 64) : null,
            'name' => is_string($name) ? mb_substr(trim($name), 0, 255) : null,
        ]));
    }
}
