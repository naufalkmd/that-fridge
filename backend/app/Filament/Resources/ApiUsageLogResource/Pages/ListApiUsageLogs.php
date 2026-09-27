<?php

namespace App\Filament\Resources\ApiUsageLogResource\Pages;

use App\Filament\Resources\ApiUsageLogResource;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;

class ListApiUsageLogs extends ListRecords
{
    protected static string $resource = ApiUsageLogResource::class;

    /** Previous / Next only: the log gains a row per AI call, and page numbers would need a COUNT(*) on every page change. */
    protected function paginateTableQuery(Builder $query): Paginator|CursorPaginator
    {
        return $query->simplePaginate(
            perPage: $this->getTableRecordsPerPage(),
            pageName: $this->getTablePaginationPageName(),
        );
    }
}
