<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserProfileResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * `profileFridges` is a dynamic attribute UserController::profile() sets on the User
     * instance before wrapping it (not a real column/relation) - the fridges THIS user owns,
     * each already shaped as {id, name, memberCount, role, requestStatus} from the viewing
     * user's own perspective. Building it here instead would mean re-querying with no access
     * to the viewer's id.
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
        ];
    }
}
