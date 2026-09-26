<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemOutcome;
use App\Models\Machine;
use App\Models\MachineRun;
use App\Models\MealEntry;
use App\Models\User;
use App\Support\ItemFreshness;
use App\Support\MachineSchedule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The in-app calendar's read model: one composed list of dated entries for a local date range,
 * built server-side so the effective-expiry rule lives in one place. Read-only - nothing here
 * writes. History kinds (added / used / thrown out / runs) are limited to the retention window
 * (180 days), and used / thrown out are per-day counts because an outcome row keeps no item name.
 */
final class CalendarService
{
    public const MAX_DAYS = 62;

    public const MAX_ENTRIES = 500;

    public const HISTORY_DAYS = 180;

    private const KIND_ORDER = ['meal' => 0, 'expiry' => 1, 'machine_scheduled' => 2, 'machine_run' => 3, 'used' => 4, 'wasted' => 5, 'added' => 6];

    /**
     * @param  list<int|string>  $fridgeIds  fridges the caller may see (already membership-checked)
     * @return array{entries: list<array<string, mixed>>, truncated: bool}
     */
    public function entries(User $user, string $from, string $to, string $tz, array $fridgeIds, ?int $onlyFridge = null): array
    {
        $startLocal = Carbon::parse($from, $tz)->startOfDay();
        $endLocal = Carbon::parse($to, $tz)->endOfDay();
        $startUtc = $startLocal->clone()->utc();
        $endUtc = $endLocal->clone()->utc();
        $historyFloor = now()->subDays(self::HISTORY_DAYS);
        $day = fn (Carbon $utc): string => $utc->clone()->setTimezone($tz)->toDateString();
        $todayLocal = now($tz)->toDateString();

        $entries = collect()
            ->merge($this->meals($user, $from, $to, $onlyFridge))
            ->merge($this->expiry($fridgeIds, $from, $to, $todayLocal))
            ->merge($this->machineScheduled($user, $fridgeIds, $startUtc, $endUtc, $tz))
            ->merge($this->machineRuns($user, $fridgeIds, $startUtc, $endUtc, $historyFloor, $tz, $day))
            ->merge($this->outcomes($user, $startUtc, $endUtc, $historyFloor, $day))
            ->merge($this->added($fridgeIds, $startUtc, $endUtc, $historyFloor, $day));

        $sorted = $entries->sortBy(fn ($e) => sprintf('%s|%d|%s', $e['date'], self::KIND_ORDER[$e['kind']] ?? 9, $e['time'] ?? '99:99'))->values();

        return [
            'entries' => $sorted->take(self::MAX_ENTRIES)->all(),
            'truncated' => $sorted->count() > self::MAX_ENTRIES,
        ];
    }

    /**
     * The meal plan / recipe log: the viewer's own entries plus those shared through a Pro-owned
     * fridge (MealEntry::visibleTo). With a single fridge selected, that fridge's entries and the
     * viewer's personal (fridge-less) ones - a personal entry belongs to no fridge, so it shows in
     * every scope.
     */
    private function meals(User $user, string $from, string $to, ?int $onlyFridge): Collection
    {
        return MealEntry::query()
            ->visibleTo($user)
            ->whereBetween('date', [$from, $to])
            ->when($onlyFridge !== null, fn ($q) => $q->where(fn ($w) => $w
                ->where('fridge_id', $onlyFridge)
                ->orWhere(fn ($p) => $p->whereNull('fridge_id')->where('user_id', $user->id))))
            ->with('user:id,username')
            ->orderBy('date')->limit(self::MAX_ENTRIES)->get()
            ->map(fn (MealEntry $e) => [
                'id' => "meal:{$e->id}", 'kind' => 'meal', 'date' => $e->date->toDateString(), 'time' => $e->time,
                'title' => $e->title, 'meta' => $e->slot, 'tone' => null,
                'slot' => $e->slot, 'status' => $e->status, 'note' => $e->note, 'calories' => $e->calories, 'caloriesSource' => $e->calories_source,
                'by' => $e->user_id !== $user->id ? $e->user?->username : null,
                'refs' => array_filter([
                    'mealEntryId' => (string) $e->id,
                    'recipeId' => $e->recipe_id !== null ? (string) $e->recipe_id : null,
                    'fridgeId' => $e->fridge_id !== null ? (string) $e->fridge_id : null,
                ]),
            ]);
    }

    /** Effective expiry (opened items land on the opened date), not just the printed one. */
    private function expiry(array $fridgeIds, string $from, string $to, string $todayLocal): Collection
    {
        // An opened item can expire earlier than its printed date, so opened items are candidates
        // whatever their printed date; everything else must have its printed date in range.
        $items = Item::query()
            ->whereHas('section', fn ($q) => $q->whereIn('fridge_id', $fridgeIds))
            ->where(fn ($q) => $q->whereBetween('expiry_date', [$from, $to])->orWhere('opened', true))
            ->with('section.fridge:id,name')
            ->get();

        return $items->map(function (Item $item) use ($from, $to, $todayLocal) {
            $date = ItemFreshness::effectiveExpiry($item)?->toDateString();
            if ($date === null || $date < $from || $date > $to) {
                return null;
            }
            $fridge = $item->section->fridge;

            return [
                'id' => "expiry:{$item->id}", 'kind' => 'expiry', 'date' => $date, 'time' => null,
                'title' => $item->name, 'meta' => $fridge->name,
                'tone' => $date < $todayLocal ? 'overdue' : null,
                'refs' => ['itemId' => (string) $item->id, 'fridgeId' => (string) $fridge->id],
            ];
        })->filter()->values();
    }

    /** Future runs of the caller's enabled schedule Machines, projected from next_run_at. */
    private function machineScheduled(User $user, array $fridgeIds, Carbon $startUtc, Carbon $endUtc, string $tz): Collection
    {
        $now = now();
        $out = collect();
        Machine::query()
            ->where('user_id', $user->id)->where('enabled', true)->where('trigger_type', 'schedule')
            ->whereIn('fridge_id', $fridgeIds)
            ->limit(50)->get()
            ->each(function (Machine $machine) use ($startUtc, $endUtc, $now, $tz, $out) {
                $cursor = $machine->next_run_at?->clone() ?? MachineSchedule::nextRunAt($machine->trigger_config, $now);
                for ($i = 0; $i < self::MAX_DAYS * 2 && $cursor->lte($endUtc); $i++) {
                    if ($cursor->gte($startUtc) && $cursor->gt($now)) {
                        $local = $cursor->clone()->setTimezone($tz);
                        $out->push([
                            'id' => "machine_scheduled:{$machine->id}:{$cursor->timestamp}", 'kind' => 'machine_scheduled',
                            'date' => $local->toDateString(), 'time' => $local->format('H:i'),
                            'title' => $machine->name, 'meta' => 'Scheduled automation', 'tone' => null,
                            'refs' => ['machineId' => (string) $machine->id],
                        ]);
                    }
                    $cursor = MachineSchedule::nextRunAt($machine->trigger_config, $cursor);
                }
            });

        return $out;
    }

    private function machineRuns(User $user, array $fridgeIds, Carbon $startUtc, Carbon $endUtc, Carbon $floor, string $tz, callable $day): Collection
    {
        return MachineRun::query()
            ->whereHas('machine', fn ($q) => $q->where('user_id', $user->id)->whereIn('fridge_id', $fridgeIds))
            ->where('created_at', '>=', $startUtc->max($floor))->where('created_at', '<=', $endUtc)
            ->with('machine:id,name')
            ->latest('created_at')->limit(200)->get()
            ->map(fn (MachineRun $run) => [
                'id' => "machine_run:{$run->id}", 'kind' => 'machine_run',
                'date' => $day($run->created_at), 'time' => $run->created_at->clone()->setTimezone($tz)->format('H:i'),
                'title' => $run->machine->name,
                'meta' => $run->status === 'failed' ? 'Automation ran and failed' : 'Automation ran',
                'tone' => $run->status === 'failed' ? 'overdue' : null,
                'refs' => ['machineId' => (string) $run->machine_id, 'runId' => (string) $run->id],
            ]);
    }

    /** Per-day counts only: an outcome row keeps no item name after a day. */
    private function outcomes(User $user, Carbon $startUtc, Carbon $endUtc, Carbon $floor, callable $day): Collection
    {
        $rows = ItemOutcome::query()
            ->where('user_id', $user->id)->whereNull('undone_at')->whereIn('outcome', ['used', 'wasted'])
            ->where('created_at', '>=', $startUtc->max($floor))->where('created_at', '<=', $endUtc)
            ->get(['outcome', 'created_at']);

        return $rows->groupBy(fn ($r) => $day($r->created_at).'|'.$r->outcome)->map(function (Collection $group, string $key) {
            [$date, $outcome] = explode('|', $key);
            $n = $group->count();

            return [
                'id' => "{$outcome}:{$date}", 'kind' => $outcome, 'date' => $date, 'time' => null, 'count' => $n,
                'title' => $outcome === 'used'
                    ? ($n === 1 ? '1 item used up' : "{$n} items used up")
                    : ($n === 1 ? '1 item thrown out' : "{$n} items thrown out"),
                'meta' => null, 'tone' => $outcome === 'wasted' ? 'overdue' : null, 'refs' => [],
            ];
        })->values();
    }

    /** Items still in the fridge that were added on a day - grouped so a big shop is one row. */
    private function added(array $fridgeIds, Carbon $startUtc, Carbon $endUtc, Carbon $floor, callable $day): Collection
    {
        $items = Item::query()
            ->whereHas('section', fn ($q) => $q->whereIn('fridge_id', $fridgeIds))
            ->where('created_at', '>=', $startUtc->max($floor))->where('created_at', '<=', $endUtc)
            ->get(['id', 'name', 'created_at']);

        return $items->groupBy(fn ($i) => $day($i->created_at))->map(function (Collection $group, string $date) {
            $n = $group->count();
            $names = $group->pluck('name')->take(3)->implode(', ');

            return [
                'id' => "added:{$date}", 'kind' => 'added', 'date' => $date, 'time' => null, 'count' => $n,
                'title' => $n === 1 ? '1 item added' : "{$n} items added",
                'meta' => $n > 3 ? $names.' + '.($n - 3).' more' : $names, 'tone' => null, 'refs' => [],
            ];
        })->values();
    }
}
