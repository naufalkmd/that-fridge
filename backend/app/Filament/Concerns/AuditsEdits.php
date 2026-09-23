<?php

namespace App\Filament\Concerns;

use App\Models\AdminAuditLog;
use Illuminate\Support\Arr;

/**
 * For EditRecord pages: logs each save to the admin audit trail with before/after values of
 * only the fields that actually changed. A save that changes nothing isn't logged.
 */
trait AuditsEdits
{
    /** @var array<string, mixed> */
    protected array $auditBefore = [];

    protected function beforeSave(): void
    {
        $this->auditBefore = $this->getRecord()->getAttributes();
    }

    protected function afterSave(): void
    {
        $changed = Arr::except($this->getRecord()->getChanges(), ['updated_at']);
        if ($changed === []) {
            return;
        }

        AdminAuditLog::record('updated', $this->getRecord(), [
            'before' => Arr::only($this->auditBefore, array_keys($changed)),
            'after' => $changed,
        ]);
    }
}
