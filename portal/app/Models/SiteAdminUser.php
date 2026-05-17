<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteAdminUser extends Model
{
    protected $fillable = [
        'site_id',
        'wp_user_id',
        'username',
        'email',
        'registered_at',
        'last_login_at',
        'two_fa_enabled',
        'two_fa_method',
        'reviewed',
        'reviewed_by',
        'reviewed_at',
        'status',
        'first_detected_at',
        'last_synced_at',
    ];

    protected $casts = [
        'registered_at' => 'datetime',
        'last_login_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'first_detected_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'two_fa_enabled' => 'boolean',
        'reviewed' => 'boolean',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeUnreviewed(Builder $query): Builder
    {
        return $query->where('reviewed', false);
    }
}
