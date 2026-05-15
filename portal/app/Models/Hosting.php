<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Hosting extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'provider',
        'note',
        'created_by',
    ];

    public function sites(): HasMany
    {
        return $this->hasMany(Site::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
