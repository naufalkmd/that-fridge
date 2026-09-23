<?php

namespace App\Filament\Resources\AnalyticsEventResource\Pages;

use App\Filament\Resources\AnalyticsEventResource;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;

class ListAnalyticsEvents extends ListRecords
{
    protected static string $resource = AnalyticsEventResource::class;

    /**
     * Previous / Next only: analytics_events gains a row per app open, and page numbers would
     * need a COUNT(*) over the whole (filtered) table on every page change.
     */
    protected function paginateTableQuery(Builder $query): Paginator|CursorPaginator
    {
        return $query->simplePaginate(
            perPage: $this->getTableRecordsPerPage(),
            pageName: $this->getTablePaginationPageName(),
        );
    }
}
