<?php

namespace App\Http\Controllers;

use App\Http\Resources\FridgeResource;
use App\Models\Fridge;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FridgeController extends Controller
{
    /**
     * Eager-load shape shared by every endpoint that returns a full FridgeResource -
     * `members` filtered to just the requesting user, so FridgeResource can read that
     * user's own role without loading every member's row on every fridge fetch.
     */
    private function withCurrentUser(Request $request)
    {
        return Fridge::with('sections.items.product')
            ->with(['members' => fn ($q) => $q->where('users.id', $request->user()->id)])
            ->withCount('members');
    }

    public function index(Request $request)
    {
        // Ordered explicitly: memberFridges() joins through fridge_members, so the natural
        // fridges.id ordering isn't guaranteed the way the plain fridges() HasMany's was -
        // the frontend's activeFridge/heroSlide are array indices, and a silent reorder would
        // jump the user to a different fridge on their next reload.
        $fridges = $request->user()->memberFridges()
            ->with('sections.items.product')
            ->with(['members' => fn ($q) => $q->where('users.id', $request->user()->id)])
            ->withCount('members')
            ->orderBy('fridges.id')
            ->get();

        return FridgeResource::collection($fridges);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'style' => ['nullable', 'string', 'max:255'],
            'photo_url' => ['nullable', 'string'],
        ]);

        $fridge = Fridge::create([
            ...$data,
            'user_id' => $request->user()->id,
            'invite_code' => $this->generateUniqueInviteCode(),
        ]);
        // Fridge::booted() attaches the owner as a member automatically.

        $fridge = $this->withCurrentUser($request)->find($fridge->id);

        return new FridgeResource($fridge);
    }

    public function show(Request $request, Fridge $fridge)
    {
        $this->authorize('view', $fridge);

        return new FridgeResource($this->withCurrentUser($request)->find($fridge->id));
    }

    public function update(Request $request, Fridge $fridge)
    {
        $this->authorize('update', $fridge);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'style' => ['sometimes', 'nullable', 'string', 'max:255'],
            'photo_url' => ['sometimes', 'nullable', 'string'],
        ]);

        $fridge->update($data);

        return new FridgeResource($this->withCurrentUser($request)->find($fridge->id));
    }

    public function destroy(Request $request, Fridge $fridge)
    {
        $this->authorize('delete', $fridge);

        $fridge->delete();

        return response()->noContent();
    }

    /**
     * Join an existing fridge via its shareable invite code. Any authenticated user - the
     * code itself is the access control, same trust model as a shared link.
     */
    public function join(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
        ]);

        $fridge = Fridge::where('invite_code', strtoupper(trim($data['code'])))->first();

        if (! $fridge) {
            throw ValidationException::withMessages(['code' => 'That invite code doesn\'t match a fridge.']);
        }

        if ($fridge->isMember($request->user())) {
            throw ValidationException::withMessages(['code' => 'You\'re already a member of this fridge.']);
        }

        $fridge->members()->attach($request->user()->id, ['role' => 'member']);

        return new FridgeResource($this->withCurrentUser($request)->find($fridge->id));
    }

    private function generateUniqueInviteCode(): string
    {
        do {
            $code = Str::upper(Str::random(8));
        } while (DB::table('fridges')->where('invite_code', $code)->exists());

        return $code;
    }
}
