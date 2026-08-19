<?php

namespace App\Http\Controllers;

use App\Http\Resources\ShoppingItemResource;
use App\Models\Fridge;
use App\Models\ShoppingItem;
use Illuminate\Http\Request;

class ShoppingItemController extends Controller
{
    /**
     * Every shopping item across every fridge the current user belongs to (owned or joined) -
     * one aggregated endpoint, same pattern as FridgeNoteController::index()/myInvites()/
     * myRequests() - the frontend filters this down to the current kitchen scope itself.
     */
    public function index(Request $request)
    {
        $fridgeIds = $request->user()->memberFridges()->pluck('fridges.id');

        return ShoppingItemResource::collection(
            ShoppingItem::whereIn('fridge_id', $fridgeIds)->with('fridge')->paginate(50)
        );
    }

    /**
     * Authorizes against the parent Fridge's own `update` ability (member-level) rather than a
     * dedicated create() ability on ShoppingItem itself - same pattern FridgeNoteController::
     * store() and ItemController::store() use against their own parents.
     */
    public function store(Request $request, Fridge $fridge)
    {
        $this->authorize('update', $fridge);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:255'],
            'section' => ['required', 'string', 'max:255'],
            'checked' => ['sometimes', 'boolean'],
            // camelCase, not snake_case - this resource has no Raw/toClient translation layer
            // at all, so it stays all-camelCase on the wire in both directions.
            'shopUrl' => ['nullable', 'string', 'max:2048', 'url'],
        ]);

        $data['checked'] ??= false;
        $this->renameShopUrlKey($data);

        $shoppingItem = $fridge->shoppingItems()->create($data);

        return new ShoppingItemResource($shoppingItem->load('fridge'));
    }

    public function update(Request $request, ShoppingItem $shoppingItem)
    {
        $this->authorize('update', $shoppingItem);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:255'],
            'section' => ['sometimes', 'string', 'max:255'],
            'checked' => ['sometimes', 'boolean'],
            'shopUrl' => ['sometimes', 'nullable', 'string', 'max:2048', 'url'],
        ]);

        $this->renameShopUrlKey($data);

        $shoppingItem->update($data);

        return new ShoppingItemResource($shoppingItem->load('fridge'));
    }

    public function destroy(Request $request, ShoppingItem $shoppingItem)
    {
        $this->authorize('delete', $shoppingItem);

        $shoppingItem->delete();

        return response()->noContent();
    }

    private function renameShopUrlKey(array &$data): void
    {
        if (array_key_exists('shopUrl', $data)) {
            $data['shop_url'] = $data['shopUrl'];
            unset($data['shopUrl']);
        }
    }
}
