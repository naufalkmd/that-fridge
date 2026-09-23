<?php

namespace App\Filament\Concerns;

use App\Models\AdminAuditLog;

/** For CreateRecord pages: logs the new record to the admin audit trail. */
trait AuditsCreates
{
    protected function afterCreate(): void
    {
        AdminAuditLog::record('created', $this->getRecord());
    }
}
