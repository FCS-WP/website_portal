<?php

namespace App\Jobs;

use App\Models\FileIntegrityFinding;
use App\Models\SecurityAlert;
use App\Models\SecurityScanRun;
use App\Models\Site;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ScanFileIntegrityJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 120;

    public function __construct(public Site $site)
    {
    }

    public function handle(): void
    {
        $site = $this->site;

        $scanRun = SecurityScanRun::create([
            'site_id' => $site->id,
            'scan_type' => 'file_integrity',
            'status' => 'running',
            'started_at' => now(),
        ]);

        try {
            $response = Http::timeout(90)
                ->withHeaders([
                    'X-Agent-Key' => decrypt($site->api_key_encrypted),
                    'Accept' => 'application/json',
                ])
                ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/security/file-scan');

            if (!$response->successful()) {
                throw new \Exception('Agent returned ' . $response->status() . ': ' . $response->body());
            }

            $results = $response->json();
            $findings = $results['findings'] ?? $results;
            $findingsCount = 0;

            // Collect currently flagged file paths
            $flaggedPaths = collect($findings)->pluck('file_path')->filter()->toArray();

            // Resolve previous open findings that are no longer flagged
            FileIntegrityFinding::where('site_id', $site->id)
                ->where('status', 'open')
                ->when(!empty($flaggedPaths), fn ($q) => $q->whereNotIn('file_path', $flaggedPaths))
                ->update(['status' => 'resolved', 'resolved_at' => now()]);

            // If no flagged paths, resolve ALL open findings for this site
            if (empty($flaggedPaths)) {
                FileIntegrityFinding::where('site_id', $site->id)
                    ->where('status', 'open')
                    ->update(['status' => 'resolved', 'resolved_at' => now()]);
            }

            // Store new findings
            foreach ($findings as $finding) {
                $filePath = $finding['file_path'] ?? null;
                if (!$filePath) {
                    continue;
                }

                $changeType = $finding['change_type'] ?? 'modified';
                $severity = $this->determineSeverity($filePath);

                FileIntegrityFinding::updateOrCreate(
                    [
                        'site_id' => $site->id,
                        'file_path' => $filePath,
                        'status' => 'open',
                    ],
                    [
                        'scan_run_id' => $scanRun->id,
                        'change_type' => $changeType,
                        'severity' => $severity,
                        'file_hash_current' => $finding['hash'] ?? null,
                        'file_hash_baseline' => $finding['baseline_hash'] ?? null,
                        'detected_at' => now(),
                    ]
                );

                $findingsCount++;

                // Create alert for critical files
                if ($this->isCriticalFile($filePath)) {
                    $this->createCriticalFileAlert($site, $filePath, $changeType);
                }
            }

            $scanRun->update([
                'status' => 'completed',
                'finished_at' => now(),
                'findings_count' => $findingsCount,
            ]);
        } catch (\Exception $e) {
            Log::error("ScanFileIntegrityJob failed for site {$site->id}: " . $e->getMessage());

            $scanRun->update([
                'status' => 'failed',
                'finished_at' => now(),
                'error_message' => substr($e->getMessage(), 0, 500),
            ]);
        }
    }

    private function isCriticalFile(string $filePath): bool
    {
        $criticalPatterns = [
            'wp-config.php',
            '.htaccess',
            'wp-login.php',
        ];

        foreach ($criticalPatterns as $pattern) {
            if (str_ends_with($filePath, $pattern) || basename($filePath) === $pattern) {
                return true;
            }
        }

        // wp-includes/* files
        if (str_contains($filePath, 'wp-includes/')) {
            return true;
        }

        return false;
    }

    private function determineSeverity(string $filePath): string
    {
        if ($this->isCriticalFile($filePath)) {
            return 'critical';
        }

        // wp-admin files are high severity
        if (str_contains($filePath, 'wp-admin/')) {
            return 'high';
        }

        return 'medium';
    }

    private function createCriticalFileAlert(Site $site, string $filePath, string $changeType): void
    {
        // Avoid duplicate alerts within the last 24 hours
        $exists = SecurityAlert::where('site_id', $site->id)
            ->where('alert_type', 'file_integrity')
            ->where('detail->file_path', $filePath)
            ->where('created_at', '>=', now()->subDay())
            ->exists();

        if ($exists) {
            return;
        }

        SecurityAlert::create([
            'site_id' => $site->id,
            'alert_type' => 'file_integrity',
            'severity' => 'high',
            'title' => "Critical file {$changeType}: {$filePath}",
            'detail' => [
                'file_path' => $filePath,
                'change_type' => $changeType,
            ],
            'status' => 'open',
            'created_at' => now(),
        ]);
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("ScanFileIntegrityJob permanently failed for site {$this->site->id}: " . $exception->getMessage());
    }
}
