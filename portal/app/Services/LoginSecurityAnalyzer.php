<?php

namespace App\Services;

use App\Models\Site;
use App\Models\LoginEvent;
use App\Models\SecurityAlert;
use App\Models\KnownLoginIp;
use Carbon\Carbon;

class LoginSecurityAnalyzer
{
    /**
     * Run all detection rules against recent login events for a site.
     */
    public static function analyze(Site $site): void
    {
        self::checkIpBruteForce($site);
        self::checkDistributedBruteForce($site);
        self::checkCredentialStuffing($site);
        self::checkSuspiciousLogin($site);
        self::updateKnownIps($site);
    }

    /**
     * Rule 1: Same IP > 20 failed attempts in 10 min window.
     */
    private static function checkIpBruteForce(Site $site): void
    {
        $window = now()->subMinutes(10);

        $results = LoginEvent::where('site_id', $site->id)
            ->where('event_type', 'failed')
            ->where('occurred_at', '>=', $window)
            ->selectRaw('ip_address, COUNT(*) as attempt_count')
            ->groupBy('ip_address')
            ->having('attempt_count', '>', 20)
            ->get();

        foreach ($results as $result) {
            // Don't create duplicate alerts within 1 hour
            $exists = SecurityAlert::where('site_id', $site->id)
                ->where('alert_type', 'brute_force')
                ->where('created_at', '>=', now()->subHour())
                ->exists();

            if (!$exists) {
                $alert = SecurityAlert::create([
                    'site_id' => $site->id,
                    'alert_type' => 'brute_force',
                    'severity' => 'high',
                    'title' => "Brute force attack from IP {$result->ip_address} — {$result->attempt_count} attempts in 10 minutes",
                    'detail' => ['ip' => $result->ip_address, 'count' => $result->attempt_count],
                    'status' => 'open',
                    'created_at' => now(),
                ]);
                self::sendTelegramAlert($alert, $site);
            }
        }
    }

    /**
     * Rule 2: > 100 failed from > 10 distinct IPs in 30 min.
     */
    private static function checkDistributedBruteForce(Site $site): void
    {
        $window = now()->subMinutes(30);

        $totalFailed = LoginEvent::where('site_id', $site->id)
            ->where('event_type', 'failed')
            ->where('occurred_at', '>=', $window)
            ->count();

        $distinctIps = LoginEvent::where('site_id', $site->id)
            ->where('event_type', 'failed')
            ->where('occurred_at', '>=', $window)
            ->distinct('ip_address')
            ->count('ip_address');

        if ($totalFailed > 100 && $distinctIps > 10) {
            $exists = SecurityAlert::where('site_id', $site->id)
                ->where('alert_type', 'distributed_brute_force')
                ->where('created_at', '>=', now()->subHour())
                ->exists();

            if (!$exists) {
                $alert = SecurityAlert::create([
                    'site_id' => $site->id,
                    'alert_type' => 'distributed_brute_force',
                    'severity' => 'high',
                    'title' => "Distributed brute force — {$totalFailed} attempts from {$distinctIps} IPs in 30 minutes",
                    'detail' => ['count' => $totalFailed, 'ip_count' => $distinctIps],
                    'status' => 'open',
                    'created_at' => now(),
                ]);
                self::sendTelegramAlert($alert, $site);
            }
        }
    }

    /**
     * Rule 3: Same username > 50 attempts in 1 hour.
     */
    private static function checkCredentialStuffing(Site $site): void
    {
        $window = now()->subHour();

        $results = LoginEvent::where('site_id', $site->id)
            ->where('event_type', 'failed')
            ->where('occurred_at', '>=', $window)
            ->whereNotNull('username')
            ->selectRaw('username, COUNT(*) as attempt_count')
            ->groupBy('username')
            ->having('attempt_count', '>', 50)
            ->get();

        foreach ($results as $result) {
            $exists = SecurityAlert::where('site_id', $site->id)
                ->where('alert_type', 'credential_stuffing')
                ->where('created_at', '>=', now()->subHour())
                ->exists();

            if (!$exists) {
                SecurityAlert::create([
                    'site_id' => $site->id,
                    'alert_type' => 'credential_stuffing',
                    'severity' => 'medium',
                    'title' => "Credential stuffing — username '{$result->username}' tried {$result->attempt_count} times in 1 hour",
                    'detail' => ['username' => $result->username, 'count' => $result->attempt_count],
                    'status' => 'open',
                    'created_at' => now(),
                ]);
                // Medium severity: no immediate Telegram (weekly digest only per PRD)
            }
        }
    }

    /**
     * Rule 4: Successful login from new IP during night hours (22:00-06:00).
     */
    private static function checkSuspiciousLogin(Site $site): void
    {
        $recentSuccessful = LoginEvent::where('site_id', $site->id)
            ->where('event_type', 'success')
            ->where('occurred_at', '>=', now()->subMinutes(10))
            ->get();

        foreach ($recentSuccessful as $event) {
            $isKnownIp = KnownLoginIp::where('site_id', $site->id)
                ->where('ip_address', $event->ip_address)
                ->exists();

            if (!$isKnownIp) {
                $hour = (int) $event->occurred_at->format('H');
                $isNightHours = ($hour >= 22 || $hour < 6);

                if ($isNightHours) {
                    $exists = SecurityAlert::where('site_id', $site->id)
                        ->where('alert_type', 'suspicious_login')
                        ->where('created_at', '>=', now()->subHour())
                        ->where('detail', 'LIKE', "%{$event->ip_address}%")
                        ->exists();

                    if (!$exists) {
                        $alert = SecurityAlert::create([
                            'site_id' => $site->id,
                            'alert_type' => 'suspicious_login',
                            'severity' => 'medium',
                            'title' => "Suspicious login — user '{$event->username}' from new IP {$event->ip_address} at {$event->occurred_at->format('H:i')}",
                            'detail' => [
                                'username' => $event->username,
                                'ip' => $event->ip_address,
                                'time' => $event->occurred_at->toISOString(),
                            ],
                            'status' => 'open',
                            'created_at' => now(),
                        ]);
                        self::sendTelegramAlert($alert, $site);
                    }
                }
            }
        }
    }

    /**
     * Update known IPs table from recent successful logins.
     */
    private static function updateKnownIps(Site $site): void
    {
        $recentSuccessful = LoginEvent::where('site_id', $site->id)
            ->where('event_type', 'success')
            ->where('occurred_at', '>=', now()->subMinutes(10))
            ->get();

        foreach ($recentSuccessful as $event) {
            KnownLoginIp::updateOrCreate(
                ['site_id' => $site->id, 'ip_address' => $event->ip_address],
                ['last_seen_at' => now(), 'first_seen_at' => now()]
            );
        }
    }

    /**
     * Send Telegram notification for a security alert.
     */
    private static function sendTelegramAlert(SecurityAlert $alert, Site $site): void
    {
        $emoji = $alert->severity === 'critical' ? "\xF0\x9F\x9A\xA8" : "\xE2\x9A\xA0\xEF\xB8\x8F";
        $message = "{$emoji} *" . strtoupper($alert->severity) . "* — {$alert->title}\n"
            . "Site: {$site->name} ({$site->url})\n"
            . "Time: " . now()->format('Y-m-d H:i:s');

        TelegramNotificationService::notifyAdminChannel($message);
        $alert->update(['telegram_sent' => true, 'telegram_sent_at' => now()]);
    }
}
