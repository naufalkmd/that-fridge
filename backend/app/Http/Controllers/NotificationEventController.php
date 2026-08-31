<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationEventResource;
use App\Models\NotificationEvent;
use Illuminate\Http\Request;

class NotificationEventController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->user()->id;
        $fridgeIds = $request->user()->memberFridges()->pluck('fridges.id');

        $events = NotificationEvent::query()
            ->where(function ($query) use ($userId, $fridgeIds) {
                $query->where('user_id', $userId)
                    ->orWhere(fn ($q) => $q->whereNull('user_id')->whereIn('fridge_id', $fridgeIds));
            })
            ->with('fridge')
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return NotificationEventResource::collection($events);
    }

    public function update(Request $request, NotificationEvent $notificationEvent)
    {
        $this->authorize('update', $notificationEvent);

        $data = $request->validate([
            'done' => ['required', 'boolean'],
        ]);

        $notificationEvent->update($data);

        return new NotificationEventResource($notificationEvent->load('fridge'));
    }
}
