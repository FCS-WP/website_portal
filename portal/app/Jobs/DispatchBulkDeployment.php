<?php

namespace App\Jobs;

use App\Models\DeploymentJob;
use App\Models\DeploymentJobSite;
use App\Services\TelegramNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class DispatchBulkDeployment implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public DeploymentJob $deploymentJob)
    {
    }

    public function handle(): void
    {
        $job = $this->deploymentJob;
        $job->update(['status' => 'running', 'started_at' => now()]);

        // Get all pending sites for this deployment
        $pendingSites = $job->sites()->where('status', 'pending')->get();

        // Fan out individual jobs based on job_type
        foreach ($pendingSites as $deploymentJobSite) {
            if ($job->isWporgJob()) {
                WpOrgPluginJob::dispatch(
                    $deploymentJobSite->id,
                    $deploymentJobSite->site_id,
                    $job->job_type,
                    $job->plugin_slug,
                    $job->target_version,
                    $job->download_url,
                    $job->file_hash,
                    true,
                    null,
                )->onQueue('deployments');
            } else {
                PushPluginToSite::dispatch($deploymentJobSite)
                    ->onQueue('deployments');
            }
        }
    }
}
