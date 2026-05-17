<?php

namespace App\Console\Commands;

use App\Models\Site;
use App\Models\SitePlugin;
use App\Models\VulnerabilityDefinition;
use App\Models\SiteVulnerability;
use App\Models\SecurityAlert;
use App\Models\PortalSetting;
use App\Services\VersionRangeEvaluator;
use App\Jobs\SendTelegramNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class ScanSiteVulnerabilities extends Command
{
    protected $signature = 'security:scan-vulnerabilities';
    protected $description = 'Scan all sites for plugin vulnerabilities against local database';

    public function handle(): int
    {
        $this->info('Starting vulnerability scan across all sites...');

        $sites = Site::where('status', 'connected')
            ->with('sitePlugins.plugin')
            ->get();

        $totalFound = 0;
        $totalPatched = 0;

        foreach ($sites as $site) {
            $this->line("  Scanning: {$site->name}");

            foreach ($site->sitePlugins as $sitePlugin) {
                if (!$sitePlugin->installed_version) {
                    continue;
                }

                // Get slug from the related Plugin model
                $pluginSlug = $sitePlugin->plugin->slug ?? null;
                if (!$pluginSlug) {
                    continue;
                }

                // Find matching vulnerabilities for this plugin
                $vulnerabilities = VulnerabilityDefinition::where('plugin_slug', $pluginSlug)->get();

                foreach ($vulnerabilities as $vuln) {
                    $isAffected = VersionRangeEvaluator::isAffected(
                        $sitePlugin->installed_version,
                        $vuln->affected_versions,
                        $vuln->fixed_in_version
                    );

                    $existing = SiteVulnerability::where('site_id', $site->id)
                        ->where('vulnerability_id', $vuln->id)
                        ->first();

                    if ($isAffected) {
                        if (!$existing) {
                            // New vulnerability found
                            SiteVulnerability::create([
                                'site_id' => $site->id,
                                'vulnerability_id' => $vuln->id,
                                'plugin_slug' => $pluginSlug,
                                'installed_version' => $sitePlugin->installed_version,
                                'status' => 'open',
                                'first_detected_at' => now(),
                                'last_seen_at' => now(),
                            ]);
                            $totalFound++;

                            // Alert for critical/high
                            if (in_array($vuln->severity, ['critical', 'high'])) {
                                $this->createVulnerabilityAlert($site, $vuln, $sitePlugin);
                            }
                        } else {
                            // Update last_seen_at
                            $existing->update([
                                'last_seen_at' => now(),
                                'installed_version' => $sitePlugin->installed_version,
                            ]);
                        }
                    } elseif ($existing && $existing->status === 'open') {
                        // Plugin was updated past the fix — mark as patched
                        $existing->update([
                            'status' => 'patched',
                            'patched_at' => now(),
                        ]);
                        $totalPatched++;
                    }
                }
            }
        }

        $this->info("Scan complete: {$totalFound} new vulnerabilities found, {$totalPatched} patched");
        return self::SUCCESS;
    }

    private function createVulnerabilityAlert(Site $site, VulnerabilityDefinition $vuln, SitePlugin $sitePlugin): void
    {
        $exists = SecurityAlert::where('site_id', $site->id)
            ->where('alert_type', 'vulnerability_' . $vuln->severity)
            ->where('detail->cve_id', $vuln->cve_id)
            ->where('created_at', '>=', now()->subDay())
            ->exists();

        if ($exists) {
            return;
        }

        $alert = SecurityAlert::create([
            'site_id' => $site->id,
            'alert_type' => 'vulnerability_' . $vuln->severity,
            'severity' => $vuln->severity,
            'title' => "{$vuln->plugin_name} {$sitePlugin->installed_version} — {$vuln->cve_id}: {$vuln->title}",
            'detail' => [
                'cve_id' => $vuln->cve_id,
                'plugin_slug' => $vuln->plugin_slug,
                'installed_version' => $sitePlugin->installed_version,
                'fixed_in_version' => $vuln->fixed_in_version,
                'cvss_score' => $vuln->cvss_score,
            ],
            'status' => 'open',
            'created_at' => now(),
        ]);

        // Send Telegram for critical/high
        $emoji = $vuln->severity === 'critical' ? "\xF0\x9F\x9A\xA8" : "\xE2\x9A\xA0\xEF\xB8\x8F";
        $message = "{$emoji} *VULNERABILITY — {$vuln->cve_id}*\n";
        $message .= "Plugin: {$vuln->plugin_name} v{$sitePlugin->installed_version}\n";
        $message .= "Severity: " . strtoupper($vuln->severity) . " (CVSS: {$vuln->cvss_score})\n";
        $message .= "Fix: Update to v{$vuln->fixed_in_version}\n";
        $message .= "Site: {$site->name}\n";
        $message .= "Time: " . now()->format('Y-m-d H:i:s');

        $chatId = PortalSetting::where('key', 'telegram_default_chat_id')->value('value')
            ?: config('services.telegram.chat_id');

        if ($chatId) {
            SendTelegramNotification::dispatch($chatId, $message);
            $alert->update(['telegram_sent' => true, 'telegram_sent_at' => now()]);
        }
    }
}
