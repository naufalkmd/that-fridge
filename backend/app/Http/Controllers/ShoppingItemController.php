<?php

namespace App\Http\Controllers;

use App\Http\Resources\ShoppingItemResource;
use App\Models\ShoppingItem;
use Illuminate\Http\Request;

class ShoppingItemController extends Controller
{
    public function index(Request $request)
    {
        return ShoppingItemResource::collection(
            $request->user()->shoppingItems()->paginate(50)
        );
    }

    public function store(Request $request)
    {
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

        $shoppingItem = $request->user()->shoppingItems()->create($data);

        return new ShoppingItemResource($shoppingItem);
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

        return new ShoppingItemResource($shoppingItem);
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
