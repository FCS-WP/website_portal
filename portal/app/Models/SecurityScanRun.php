<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SecurityScanRun extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'site_id',
        'scan_type',
        'status',
        'started_at',
        'finished_at',
        'findings_count',
        'error_message',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function findings(): HasMany
    {
        return $this->hasMany(FileIntegrityFinding::class, 'scan_run_id');
    }
}
