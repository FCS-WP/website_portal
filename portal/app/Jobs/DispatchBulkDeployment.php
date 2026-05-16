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

        // Fan out individual push jobs
        foreach ($pendingSites as $deploymentJobSite) {
            PushPluginToSite::dispatch($deploymentJobSite)
                ->onQueue('deployments');
        }
    }
}
