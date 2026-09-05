<?php

namespace App\Http\Controllers;

use App\Services\AgentService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AgentController extends Controller
{
    protected $agentService;

    public function __construct(AgentService $agentService)
    {
        $this->agentService = $agentService;
    }

    private const HISTORY_LIMIT = 200;

    private const SESSION_LIST_LIMIT = 50;

    // Mirrors apps/mobile/src/lib/chatQuota.ts's FREE_CHATS_PER_WEEK - that copy is a
    // client-side pre-check for UX (disable the button before even trying), this one is the
    // real enforcement. A free user calling the API directly, bypassing the app entirely,
    // previously had no limit at all - the backend had no way to tell Pro from free.
    private const FREE_CHATS_PER_WEEK = 5;

    private const CHAT_CONTEXT_TURNS = 8;

    /**
     * Get the authenticated user's most recent chat session, oldest message first.
     * Used to restore "where you left off" on login/refresh - not the entire
     * chat history, which would merge every past conversation into one thread.
     */
    public function history(Request $request)
    {
        $latestSessionId = $request->user()->chatHistory()
            ->latest('created_at')
            ->value('session_id');

        if (! $latestSessionId) {
            return response()->json(['messages' => [], 'session_id' => null], 200);
        }

        $messages = $request->user()->chatHistory()
            ->where('session_id', $latestSessionId)
            ->orderBy('created_at')
            ->limit(self::HISTORY_LIMIT)
            ->get(['id', 'agent', 'user_message', 'agent_response', 'recipe_suggestion', 'created_at']);

        return response()->json([
            'messages' => $messages,
            'session_id' => $latestSessionId,
        ], 200);
    }

    /**
     * List the authenticated user's past chat sessions, most recent first, for
     * the Chat History screen. One row per session with a preview and timing,
     * not the full message list (see sessionMessages() for that).
     */
    public function sessions(Request $request)
    {
        $sessions = $request->user()->chatHistory()
            ->selectRaw('session_id, MIN(user_message) as first_message, MAX(created_at) as updated_at, COUNT(*) as message_count')
            ->whereNotNull('session_id')
            ->groupBy('session_id')
            ->orderByDesc('updated_at')
            ->limit(self::SESSION_LIST_LIMIT)
            ->get();

        return response()->json(['sessions' => $sessions], 200);
    }

    /**
     * Get every message in one specific past session, oldest first - used when
     * the user taps a session in Chat History to resume it.
     */
    public function sessionMessages(Request $request, string $sessionId)
    {
        $messages = $request->user()->chatHistory()
            ->where('session_id', $sessionId)
            ->orderBy('created_at')
            ->limit(self::HISTORY_LIMIT)
            ->get(['id', 'agent', 'user_message', 'agent_response', 'recipe_suggestion', 'created_at']);

        if ($messages->isEmpty()) {
            return response()->json(['error' => 'Session not found'], 404);
        }

        return response()->json([
            'session_id' => $sessionId,
            'messages' => $messages,
        ], 200);
    }

    /**
     * Delete every message in one of the authenticated user's own past sessions.
     */
    public function deleteSession(Request $request, string $sessionId)
    {
        $deleted = $request->user()->chatHistory()
            ->where('session_id', $sessionId)
            ->delete();

        if ($deleted === 0) {
            return response()->json(['error' => 'Session not found'], 404);
        }

        return response()->json(['session_id' => $sessionId, 'deleted' => true], 200);
    }

    /**
     * The prior turns of the session this message belongs to, oldest first, as alternating
     * user/assistant messages ready to hand to the model - without this, AgentService::chat
     * only ever sees the single latest message, so every follow-up ("show me the recipe",
     * "yes", "make it spicier") reads as a context-free, ambiguous request with no memory of
     * what the assistant itself just said. A compact call or a brand-new conversation (no
     * session_id yet) has nothing to fetch.
     */
    private function recentSessionHistory(Request $request): array
    {
        $sessionId = $request->input('session_id');
        if (! $sessionId || $request->boolean('compact')) {
            return [];
        }

        $rows = $request->user()->chatHistory()
            ->where('session_id', $sessionId)
            ->orderByDesc('created_at')
            ->limit(self::CHAT_CONTEXT_TURNS)
            ->get(['user_message', 'agent_response'])
            ->reverse();

        $messages = [];
        foreach ($rows as $row) {
            $messages[] = ['role' => 'user', 'content' => $row->user_message];
            if ($row->agent_response) {
                $messages[] = ['role' => 'assistant', 'content' => $row->agent_response];
            }
        }

        return $messages;
    }

    /**
     * Send message to agent, persist the exchange under a session, and return the response.
     *
     * If the client doesn't pass a session_id, this is the first message of a new
     * conversation - generate one and hand it back so the client can reuse it for
     * every subsequent message in that same conversation.
     */
    public function send(Request $request)
    {
        $request->validate([
            'message' => 'required|string|max:1000',
            'agent' => 'required|in:Chef,Guardian,Organizer,Shopkeeper',
            'inventory' => 'nullable|string', // JSON string of inventory for context
            'usage_history' => 'nullable|string', // frequently-used-items summary for context
            'streak_context' => 'nullable|string', // one-line Waste Saver streak summary for context
            'session_id' => 'nullable|uuid',
            // Set by the Home tip cards / "Activate" button, not real user chat messages -
            // asks for one short plain-text sentence instead of a looser 2-3 sentence reply,
            // so those small fixed-size cards read consistently instead of one being a plain
            // sentence and another a bolded, bulleted mini-essay.
            'compact' => 'nullable|boolean',
            // Quick Chat's photo-attach button - same constraints as PhotoController::scan.
            // Not persisted (see AgentController::send's chatHistory()->create() below, which
            // never writes it) - stateless, same as the fridge-photo scan flow.
            'image' => 'nullable|image|mimes:jpeg,png,jpg,gif|max:5120',
        ]);

        // Compact calls (Home tip cards / "Activate {agent}") share the same weekly budget as
        // real Quick Chat messages for a non-Pro user - previously they were fully exempt, which
        // meant a free user could get unlimited AI replies just by never using Quick Chat
        // directly. They're still not persisted to chat_history (see below), so they can't be
        // counted from a DB row the way real messages are - tracked in cache instead, keyed per
        // user per ISO week, and added to the chat_history count for the combined total.
        $weekStart = Carbon::now()->startOfWeek(Carbon::MONDAY);
        $compactQuotaKey = 'compact_chat_quota:'.$request->user()->id.':'.$weekStart->format('oW');

        if (! $request->user()->isPro()) {
            $used = $request->user()->chatHistory()->where('created_at', '>=', $weekStart)->count()
                + (int) Cache::get($compactQuotaKey, 0);

            if ($used >= self::FREE_CHATS_PER_WEEK) {
                return response()->json([
                    'message' => "You've used your ".self::FREE_CHATS_PER_WEEK." free AI replies this week. Upgrade to Pro for unlimited AI chat.",
                ], 402);
            }
        }

        // Read directly from the DB rather than having the client fetch-and-forward these
        // on every message like inventory/usage_history - facts exist only to serve
        // prompts, are already persisted server-side (see MemoryController::extract), and
        // this way they can't drift or go stale on the client.
        $memory = $request->user()->userMemory?->facts ?? [];

        $result = $this->agentService->chat(
            $request->input('message'),
            $request->input('agent'),
            $request->input('inventory'),
            $request->input('usage_history'),
            $request->boolean('compact'),
            $memory,
            $this->recentSessionHistory($request),
            $request->input('streak_context'),
            $request->file('image')
        );

        if (! $result) {
            return response()->json(['error' => 'Failed to get agent response'], 500);
        }

        // Compact calls are Home's tip-card auto-fetches (see AGENT_ACTIVATE_PROMPT on the
        // client), not messages in a real conversation - the client never restores or lists
        // them. Persisting them would make them win the "most recent session" restore in
        // history() and clutter the Chat History session list with entries that just come
        // back on the next page load.
        if ($request->boolean('compact')) {
            if (! $request->user()->isPro()) {
                Cache::put($compactQuotaKey, (int) Cache::get($compactQuotaKey, 0) + 1, now()->addWeek());
            }

            return response()->json([
                'session_id' => $request->input('session_id'),
                'user_message' => $result['user_message'],
                'agent' => $result['agent'],
                'agent_response' => $result['agent_response'],
                'recipe_suggestion' => $result['recipe_suggestion'] ?? null,
                'created_at' => now()->toIso8601String(),
                'mocked' => $result['mocked'] ?? false,
            ], 200);
        }

        $sessionId = $request->input('session_id') ?: (string) Str::uuid();

        $record = $request->user()->chatHistory()->create([
            'session_id' => $sessionId,
            'agent' => $result['agent'],
            'user_message' => $result['user_message'],
            'agent_response' => $result['agent_response'],
            'recipe_suggestion' => $result['recipe_suggestion'] ?? null,
        ]);

        return response()->json([
            'id' => $record->id,
            'session_id' => $sessionId,
            'user_message' => $record->user_message,
            'agent' => $record->agent,
            'agent_response' => $record->agent_response,
            'recipe_suggestion' => $record->recipe_suggestion,
            'created_at' => $record->created_at->toIso8601String(),
            'mocked' => $result['mocked'] ?? false,
        ], 200);
    }

    /**
     * Suggest a shelf life and storage location for an item name, for the Add-item form's
     * "Auto-fill" button. Stateless - no item needs to exist yet, since this runs while the
     * form is still being filled in.
     */
    public function suggestItemDetails(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'icon' => 'nullable|string|max:255',
        ]);

        $suggestion = $this->agentService->suggestItemDetails($data['name'], $data['icon'] ?? null);

        return response()->json($suggestion, 200);
    }
}
