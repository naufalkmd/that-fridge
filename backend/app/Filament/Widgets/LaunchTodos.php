<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\AdminTodoResource;
use App\Models\AdminAuditLog;
use App\Models\AdminTodo;
use Filament\Widgets\Widget;
use Illuminate\Support\Carbon;

/**
 * The most urgent open to-dos, with a countdown to the launch deadline, at the top of the dashboard. Ticking one off here is the same as
 * on the To-do page. The whole list (and adding to it) lives at Insights > To-do.
 */
class LaunchTodos extends Widget
{
    protected static string $view = 'filament.widgets.launch-todos';

    protected static ?int $sort = 0;

    protected int|string|array $columnSpan = 'full';

    protected static ?string $pollingInterval = null;

    /** Shipaton 2026 closes Sep 30, 2026 at 11:45pm PDT. */
    public const DEADLINE = '2026-09-30 23:45:00';

    public const DEADLINE_ZONE = 'America/Los_Angeles';

    public const SHOWN = 6;

    public function markDone(int $id): void
    {
        $todo = AdminTodo::open()->find($id);
        if ($todo) {
            $todo->update(['status' => 'done', 'done_at' => now()]);
            AdminAuditLog::record('updated', $todo, ['after' => ['status' => 'done']]);
        }
    }

    protected function getViewData(): array
    {
        $open = AdminTodo::open()->byUrgency();
        $deadline = Carbon::parse(self::DEADLINE, self::DEADLINE_ZONE);
        $hoursLeft = (int) floor(now()->diffInHours($deadline, false));

        return [
            'todos' => (clone $open)->limit(self::SHOWN)->get(),
            'openCount' => AdminTodo::open()->count(),
            'blockerCount' => AdminTodo::open()->where('priority', 'blocker')->count(),
            'countdown' => match (true) {
                $hoursLeft < 0 => 'The launch deadline has passed',
                $hoursLeft < 48 => "{$hoursLeft} hours to the launch deadline",
                default => (int) floor($hoursLeft / 24).' days to the launch deadline',
            },
            'overdue' => $hoursLeft < 0,
            'urgent' => $hoursLeft >= 0 && $hoursLeft < 72,
            'listUrl' => AdminTodoResource::getUrl('index'),
        ];
    }
}
