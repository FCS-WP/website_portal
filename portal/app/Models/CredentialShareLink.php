<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;

class CredentialShareLink extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'site_id',
        'token_hash',
        'credential_type_ids',
        'created_by',
        'expires_at',
        'max_views',
        'view_count',
        'is_password_protected',
        'share_password_hash',
        'last_accessed_at',
        'last_accessed_ip',
        'revoked_at',
        'revoked_by',
    ];

    protected $casts = [
        'credential_type_ids' => 'array',
        'expires_at' => 'datetime',
        'is_password_protected' => 'boolean',
        'last_accessed_at' => 'datetime',
        'revoked_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public static function boot(): void
    {
        parent::boot();

        static::creating(function ($model) {
            $model->created_at = $model->freshTimestamp();
        });
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->whereColumn('view_count', '<', 'max_views');
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query->where(function ($q) {
            $q->where('expires_at', '<=', now())
                ->orWhereColumn('view_count', '>=', 'max_views');
        });
    }
}
