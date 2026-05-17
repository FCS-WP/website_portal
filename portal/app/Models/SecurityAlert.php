<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SecurityAlert extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'site_id',
        'alert_type',
        'severity',
        'title',
        'detail',
        'status',
        'telegram_sent',
        'telegram_sent_at',
        'acknowledged_by',
        'acknowledged_at',
        'resolved_at',
        'created_at',
    ];

    protected $casts = [
        'detail' => 'array',
        'telegram_sent' => 'boolean',
        'telegram_sent_at' => 'datetime',
        'acknowledged_at' => 'datetime',
        'resolved_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function acknowledgedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acknowledged_by');
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', 'open');
    }

    public function scopeCritical(Builder $query): Builder
    {
        return $query->where('severity', 'critical');
    }

    public function scopeHigh(Builder $query): Builder
    {
        return $query->where('severity', 'high');
    }
}
