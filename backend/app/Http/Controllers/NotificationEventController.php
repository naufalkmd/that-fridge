<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationEventResource;
use App\Models\NotificationEvent;
use Illuminate\Http\Request;

class NotificationEventController extends Controller
{
    public function index(Request $request)
    {
        $events = NotificationEvent::query()
            ->whereIn('fridge_id', $request->user()->memberFridges()->pluck('fridges.id'))
            ->with('fridge')
            ->orderByDesc('created_at')
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
