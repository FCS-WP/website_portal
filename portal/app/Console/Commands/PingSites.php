<?php

namespace App\Console\Commands;

use App\Jobs\PingSiteJob;
use App\Models\Site;
use Illuminate\Console\Command;

class PingSites extends Command
{
    protected $signature = 'sites:ping {--sync : Run pings inline (debug only, no queue)}';
    protected $description = 'Dispatch a PingSiteJob for every eligible site (parallel via queue worker)';

    public function handle(): int
    {
        $siteIds = Site::whereNotNull('api_key_encrypted')
            ->whereIn('status', ['connected', 'pending', 'disconnected'])
            ->pluck('id');

        $this->info("Dispatching ping for {$siteIds->count()} sites...");

        $sync = (bool) $this->option('sync');

        // --- Jittered dispatch ---
        foreach ($siteIds as $id) {
            if ($sync) {
                PingSiteJob::dispatchSync($id);
            } else {
                PingSiteJob::dispatch($id)->delay(now()->addSeconds(random_int(0, 240)));
            }
        }

        $this->info($sync ? 'Sync ping run complete.' : 'Ping jobs queued.');

        return Command::SUCCESS;
    }
}
