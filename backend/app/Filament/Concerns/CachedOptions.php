<?php

namespace App\Filament\Concerns;

use App\Support\AdminCacheKeys;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Filter dropdown options for free-form columns (event names, app versions, ...). A SELECT
 * DISTINCT over a big table on every list load is wasteful, so the list is cached for 10
 * minutes - a brand-new value can take that long to show up, which is fine for filtering.
 */
class CachedOptions
{
    /**
     * @param  class-string<Model>  $model
     * @return array<string, string>
     */
    public static function distinct(string $model, string $column): array
    {
        $table = (new $model)->getTable();

        return Cache::remember(
            AdminCacheKeys::OPTIONS_PREFIX."{$table}.{$column}",
            AdminCacheKeys::OPTIONS_TTL,
            fn () => $model::query()
                ->whereNotNull($column)
                ->distinct()
                ->orderBy($column)
                ->pluck($column, $column)
                ->all(),
        );
    }
}
