<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * A generated icon curated into the app-wide shared pack. No user_id - it's a de-identified
 * asset once promoted (see the create_shared_icons migration and IconController::shared).
 */
#[Fillable(['label', 'image_path', 'image_url', 'source_generated_icon_id'])]
class SharedIcon extends Model
{
    //
}
