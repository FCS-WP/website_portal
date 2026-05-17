<?php

namespace App\Console\Commands;

use App\Models\Site;
use App\Services\SecurityScoreService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CalculateSecurityScores extends Command
{
    protected $signature = 'security:calculate-scores {--site= : Calculate for specific site}';
    protected $description = 'Recalculate and store security scores for all connected sites';

    public function handle(): int
    {
        $siteId = $this->option('site');

        $query = Site::where('status', 'connected');

        if ($siteId) {
            $query->where('id', $siteId);
        }

        $sites = $query->get();

        if ($sites->isEmpty()) {
            $this->info('No connected sites found.');
            return self::SUCCESS;
        }

        $this->info("Calculating security scores for {$sites->count()} site(s)...");

        $successCount = 0;
        $failedCount = 0;

        foreach ($sites as $site) {
            try {
                SecurityScoreService::recalculateAndStore($site);
                $this->line("  ✓ {$site->name}");
                $successCount++;
            } catch (\Exception $e) {
                $this->error("  ✗ {$site->name}: {$e->getMessage()}");
                Log::error("SecurityScore calculation failed for site {$site->id}: " . $e->getMessage());
                $failedCount++;
            }
        }

        $this->info("Done: {$successCount} calculated, {$failedCount} failed.");
        return $failedCount > 0 ? self::FAILURE : self::SUCCESS;
    }
}
