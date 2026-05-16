<?php

namespace App\Console\Commands;

use App\Jobs\DispatchBulkDeployment;
use App\Models\DeploymentJob;
use Illuminate\Console\Command;

class DispatchScheduledDeployments extends Command
{
    protected $signature = 'deployments:dispatch-scheduled';
    protected $description = 'Dispatch scheduled deployments that are due';

    public function handle()
    {
        $dueJobs = DeploymentJob::where('status', 'scheduled')
            ->where('scheduled_at', '<=', now())
            ->get();

        if ($dueJobs->isEmpty()) {
            return 0;
        }

        foreach ($dueJobs as $job) {
            $job->update(['status' => 'queued']);
            DispatchBulkDeployment::dispatch($job);
            $this->info("Dispatched deployment #{$job->id}");
        }

        $this->info("Dispatched {$dueJobs->count()} scheduled deployment(s)");
        return 0;
    }
}
