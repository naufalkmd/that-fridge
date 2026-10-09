<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['email', 'country', 'source', 'consented_at'])]
class AndroidWaitlistSignup extends Model
{
    protected $table = 'android_waitlist';

    protected function casts(): array
    {
        return ['consented_at' => 'datetime'];
    }
}
