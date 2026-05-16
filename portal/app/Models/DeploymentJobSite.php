<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeploymentJobSite extends Model
{
    public $timestamps = false;

    protected $fillable = ['deployment_job_id', 'site_id', 'status', 'error_message', 'attempt_count', 'deployed_at', 'rollback_version', 'rollback_reason', 'health_check_results', 'rolled_back_at'];

    protected $casts = [
        'deployed_at' => 'datetime',
        'health_check_results' => 'array',
        'rolled_back_at' => 'datetime',
    ];

    public function deploymentJob(): BelongsTo
    {
        return $this->belongsTo(DeploymentJob::class);
    }

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
