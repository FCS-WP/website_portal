<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DeploymentJob extends Model
{
    public $timestamps = false;

    protected $fillable = ['plugin_version_id', 'initiated_by', 'status', 'job_type', 'total_sites', 'success_count', 'failed_count', 'note', 'scheduled_at', 'created_at', 'started_at', 'finished_at'];

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
}
