<?php

namespace App\Http\Controllers;

use App\Services\MemoryService;
use App\Support\ChatQuota;
use Illuminate\Http\Request;

class MemoryController extends Controller
{
    public function __construct(protected MemoryService $memoryService) {}

    public function show(Request $request)
    {
        $memory = $request->user()->userMemory()->firstOrCreate([], ['facts' => []]);

        return response()->json(['facts' => $memory->facts ?? []]);
    }

    /**
     * Extract/update remembered facts from one chat exchange. Called by the frontend
     * right after a real chat reply is shown - fire-and-forget, never blocks the reply
     * itself (see AgentController::send, which is the synchronous chat call this
     * complements).
     */
    public function extract(Request $request)
    {
        $data = $request->validate([
            'user_message' => ['required', 'string', 'max:1000'],
            'agent_response' => ['required', 'string', 'max:2000'],
        ]);

        $memory = $request->user()->userMemory()->firstOrCreate([], ['facts' => []]);

        // The client fires this right after a chat reply, so it's only a real call when the
        // user still had chat allowance. If a non-Pro user has spent their weekly budget,
        // don't burn an LLM call here - just hand back what's already remembered.
        if (ChatQuota::isExhaustedFor($request->user())) {
            return response()->json(['facts' => $memory->facts ?? []]);
        }

        $facts = $this->memoryService->extractAndUpdate(
            $memory->facts ?? [],
            $data['user_message'],
            $data['agent_response']
        );

        $memory->update(['facts' => $facts]);

        return response()->json(['facts' => $facts]);
    }

    public function destroyFact(Request $request, int $index)
    {
        $memory = $request->user()->userMemory()->firstOrCreate([], ['facts' => []]);
        $facts = $memory->facts ?? [];

        if (! array_key_exists($index, $facts)) {
            return response()->json(['error' => 'Fact not found'], 404);
        }

        unset($facts[$index]);
        $memory->update(['facts' => array_values($facts)]);

        return response()->json(['facts' => $memory->facts]);
    }

    public function destroy(Request $request)
    {
        $request->user()->userMemory()->firstOrCreate([], ['facts' => []])->update(['facts' => []]);

        return response()->noContent();
    }
}
