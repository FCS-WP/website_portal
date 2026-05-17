<?php

namespace App\Console\Commands;

use App\Jobs\ScanFileIntegrityJob;
use App\Models\Site;
use Illuminate\Console\Command;

class ScanFileIntegrity extends Command
{
    protected $signature = 'security:scan-file-integrity {--site= : Scan specific site}';
    protected $description = 'Dispatch file integrity scans for sites with baselines';

    public function handle(): int
    {
        $siteId = $this->option('site');

        $query = Site::where('status', 'connected')
            ->whereHas('fileIntegrityBaseline');

        if ($siteId) {
            $query->where('id', $siteId);
        }

        $sites = $query->get();

        if ($sites->isEmpty()) {
            $this->info('No sites with file integrity baselines found.');
            return self::SUCCESS;
        }

        $this->info("Dispatching file integrity scans for {$sites->count()} site(s)...");

        foreach ($sites as $site) {
            ScanFileIntegrityJob::dispatch($site)->onQueue('security');
            $this->line("  Dispatched scan for: {$site->name}");
        }

        $this->info('All scan jobs dispatched.');
        return self::SUCCESS;
    }
}
