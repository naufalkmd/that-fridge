<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/** An admin-picked icon for a food name (see the create_icon_assignments migration). */
#[Fillable(['name_key', 'icon', 'icon_url', 'shared_icon_id', 'assigned_by'])]
class IconAssignment extends Model {}
