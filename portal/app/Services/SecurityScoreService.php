<?php

namespace App\Services;

use App\Models\FileIntegrityBaseline;
use App\Models\FileIntegrityFinding;
use App\Models\SecurityAlert;
use App\Models\Site;
use App\Models\Site2faSetting;
use App\Models\SiteAdminUser;
use App\Models\SiteSecurityScore;
use App\Models\SiteVulnerability;

class SecurityScoreService
{
    public static function calculateScore(Site $site): int
    {
        $score = 100;
        $score -= self::fileIntegrityDeductions($site);
        $score -= self::vulnerabilityDeductions($site);
        $score -= self::loginSecurityDeductions($site);
        $score -= self::userSecurityDeductions($site);
        $score -= self::twoFaDeductions($site);
        $score -= self::maintenanceDeductions($site);

        return max(0, $score);
    }

    public static function calculateBreakdown(Site $site): array
    {
        return [
            'file_integrity' => -self::fileIntegrityDeductions($site),
            'vulnerabilities' => -self::vulnerabilityDeductions($site),
            'login_security' => -self::loginSecurityDeductions($site),
            'user_security' => -self::userSecurityDeductions($site),
            'two_fa' => -self::twoFaDeductions($site),
            'maintenance' => -self::maintenanceDeductions($site),
        ];
    }

    public static function recalculateAndStore(Site $site): void
    {
        $score = self::calculateScore($site);
        $breakdown = self::calculateBreakdown($site);

        SiteSecurityScore::updateOrCreate(
            ['site_id' => $site->id, 'score_date' => now()->toDateString()],
            ['score' => $score, 'breakdown' => $breakdown, 'calculated_at' => now()]
        );
    }

    private static function fileIntegrityDeductions(Site $site): int
    {
        $deduction = 0;

        $findings = $site->fileIntegrityFindings()->open()->get();

        foreach ($findings as $finding) {
            match ($finding->severity) {
                'critical' => $deduction += 25,
                'high' => $deduction += 15,
                'medium' => $deduction += 5,
                default => null,
            };
        }

        // No baseline established
        if (!$site->fileIntegrityBaseline) {
            $deduction += 10;
        }

        return $deduction;
    }

    private static function vulnerabilityDeductions(Site $site): int
    {
        $deduction = 0;

        $vulnerabilities = $site->siteVulnerabilities()
            ->open()
            ->with('vulnerability')
            ->get();

        foreach ($vulnerabilities as $siteVuln) {
            $cvss = $siteVuln->vulnerability->cvss_score ?? 0;

            if ($cvss >= 9.0) {
                $deduction += 20;
            } elseif ($cvss >= 7.0) {
                $deduction += 10;
            } elseif ($cvss >= 4.0) {
                $deduction += 3;
            }
        }

        return $deduction;
    }

    private static function loginSecurityDeductions(Site $site): int
    {
        $deduction = 0;
        $last24h = now()->subDay();

        $activeAlerts = $site->securityAlerts()
            ->open()
            ->where('created_at', '>=', $last24h)
            ->get();

        foreach ($activeAlerts as $alert) {
            match ($alert->alert_type) {
                'brute_force' => $deduction += 15,
                'distributed_attack' => $deduction += 15,
                'suspicious_login' => $deduction += 10,
                default => null,
            };
        }

        return $deduction;
    }

    private static function userSecurityDeductions(Site $site): int
    {
        $deduction = 0;

        // Unreviewed new admins
        $unreviewedCount = $site->siteAdminUsers()
            ->active()
            ->unreviewed()
            ->count();

        $deduction += $unreviewedCount * 20;

        // More than 3 admin accounts
        $totalAdmins = $site->siteAdminUsers()->active()->count();
        if ($totalAdmins > 3) {
            $deduction += 5;
        }

        return $deduction;
    }

    private static function twoFaDeductions(Site $site): int
    {
        $deduction = 0;

        $setting = $site->site2faSetting;

        if (!$setting || !$setting->enforce_for_admins) {
            $deduction += 15;
        } else {
            // Count admins without 2FA when enforcement is on
            $adminsWithout2fa = $site->siteAdminUsers()
                ->active()
                ->where('two_fa_enabled', false)
                ->count();

            $deduction += $adminsWithout2fa * 5;
        }

        return $deduction;
    }

    private static function maintenanceDeductions(Site $site): int
    {
        $deduction = 0;

        // Check for outdated WP core via site plugins
        $outdatedPlugins = $site->sitePlugins()
            ->get()
            ->filter(fn ($p) => $p->isOutdated());

        // WP core outdated check - look for wordpress-core in plugins
        $coreOutdated = $outdatedPlugins->first(fn ($p) => $p->plugin && $p->plugin->slug === 'wordpress-core');
        if ($coreOutdated) {
            $deduction += 5;
        }

        // More than 3 plugins outdated
        if ($outdatedPlugins->count() > 3) {
            $deduction += 3;
        }

        return $deduction;
    }
}
