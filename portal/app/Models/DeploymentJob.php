<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeploymentJob extends Model
{
    public $timestamps = false;

    protected $fillable = ['plugin_version_id', 'initiated_by', 'status', 'job_type', 'plugin_slug', 'plugin_name', 'target_version', 'download_url', 'file_hash', 'total_sites', 'success_count', 'failed_count', 'note', 'scheduled_at', 'created_at', 'started_at', 'finished_at'];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'created_at' => 'datetime',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function pluginVersion(): BelongsTo
    {
        return $this->belongsTo(PluginVersion::class);
    }

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiated_by');
    }

    public function sites(): HasMany
    {
        return $this->hasMany(DeploymentJobSite::class);
    }

    public function isWporgJob(): bool
    {
        return str_starts_with($this->job_type ?? '', 'wporg_');
    }

    public function getDisplayName(): string
    {
        if ($this->isWporgJob()) {
            return $this->plugin_name ?? $this->plugin_slug ?? 'Unknown Plugin';
        }

        return $this->pluginVersion?->version_label ?? $this->plugin_name ?? 'Unknown';
    }
}
