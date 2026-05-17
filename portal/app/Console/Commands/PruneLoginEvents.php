<?php

namespace App\Console\Commands;

use App\Models\LoginEvent;
use App\Models\SecurityAlert;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PruneLoginEvents extends Command
{
    protected $signature = 'security:prune-login-events';
    protected $description = 'Prune old login events and resolved security alerts';

    public function handle(): int
    {
        $this->info('Pruning old security records...');

        // Delete login_events older than 90 days
        $loginEventsPruned = LoginEvent::where('occurred_at', '<', now()->subDays(90))->delete();
        $this->line("  Pruned {$loginEventsPruned} login events (older than 90 days)");

        // Delete resolved security_alerts older than 180 days
        $alertsPruned = SecurityAlert::where('status', 'resolved')
            ->where('created_at', '<', now()->subDays(180))
            ->delete();
        $this->line("  Pruned {$alertsPruned} resolved security alerts (older than 180 days)");

        $this->info("Pruning complete: {$loginEventsPruned} login events, {$alertsPruned} alerts removed.");

        Log::info("Security prune: {$loginEventsPruned} login events, {$alertsPruned} resolved alerts deleted.");

        return self::SUCCESS;
    }
}
