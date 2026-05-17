<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoginEvent extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'site_id',
        'event_type',
        'username',
        'wp_user_id',
        'ip_address',
        'user_agent',
        'occurred_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function scopeFailed(Builder $query): Builder
    {
        return $query->where('event_type', 'failed');
    }

    public function scopeSuccess(Builder $query): Builder
    {
        return $query->where('event_type', 'success');
    }
}
