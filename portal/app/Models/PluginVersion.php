<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PluginVersion extends Model
{
    protected $fillable = ['plugin_id', 'version', 'file_path', 'file_size', 'file_hash', 'is_stable', 'track', 'released_by', 'released_at'];

    protected $casts = [
        'is_stable' => 'boolean',
        'file_size' => 'integer',
        'released_at' => 'datetime',
    ];

    public function plugin(): BelongsTo
    {
        return $this->belongsTo(Plugin::class);
    }

    public function changelog(): HasOne
    {
        return $this->hasOne(PluginChangelog::class);
    }

    public function releasedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'released_by');
    }

    public function deploymentJobs()
    {
        return $this->hasMany(DeploymentJob::class);
    }
}
