<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FileIntegrityFinding extends Model
{
    protected $fillable = [
        'site_id',
        'scan_run_id',
        'file_path',
        'change_type',
        'severity',
        'file_hash_current',
        'file_hash_baseline',
        'status',
        'resolved_at',
        'acknowledged_by',
        'detected_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
        'detected_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function scanRun(): BelongsTo
    {
        return $this->belongsTo(SecurityScanRun::class, 'scan_run_id');
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
