<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserProfileResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * `profileFridges`/`profileRecipes` are dynamic attributes UserController::profile() sets
     * on the User instance before wrapping it (not real columns/relations) - the fridges and
     * custom recipes THIS user owns. Fridges are pre-shaped as {id, name, memberCount, role,
     * requestStatus} from the viewer's own perspective; recipes are already-resourced
     * RecipeResource collections, so isFavorite/isMine come from the viewer's perspective too.
     * Building either here instead would mean re-querying with no access to the viewer's id.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'name' => $this->name,
            'username' => $this->username,
            'fridges' => $this->profileFridges,
            'recipes' => $this->profileRecipes,
        ];
    }
}
