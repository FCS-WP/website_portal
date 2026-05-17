<?php

namespace App\Http\Controllers\Agent;

use App\Http\Controllers\Controller;
use App\Models\FileIntegrityBaseline;
use App\Models\FileIntegrityFinding;
use App\Models\SecurityScanRun;
use App\Models\SecurityAlert;
use App\Models\SiteAdminUser;
use App\Models\Site2faSetting;
use App\Models\LoginEvent;
use App\Services\LoginSecurityAnalyzer;
use App\Services\TelegramNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SecurityReportController extends Controller
{
    /**
     * POST /api/agent/security/baseline
     * Store or update file integrity baseline from agent scan.
     */
    public function storeBaseline(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');
        $validated = $request->validate([
            'file_hashes' => 'required|array',
            'file_count' => 'required|integer',
        ]);

        FileIntegrityBaseline::updateOrCreate(
            ['site_id' => $site->id],
            [
                'file_hashes' => $validated['file_hashes'],
                'file_count' => $validated['file_count'],
                'created_by' => null, // Agent-initiated
            ]
        );

        return response()->json(['status' => 'ok']);
    }

    /**
     * POST /api/agent/security/file-report
     * Receive file integrity scan findings from agent.
     */
    public function storeFileReport(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');
        $validated = $request->validate([
            'findings' => 'required|array',
            'findings.*.file_path' => 'required|string',
            'findings.*.change_type' => 'required|in:added,modified,deleted',
            'findings.*.severity' => 'required|in:critical,high,medium,low,info',
            'findings.*.file_hash_current' => 'nullable|string',
            'findings.*.file_hash_baseline' => 'nullable|string',
            'files_scanned' => 'integer',
            'scan_duration_seconds' => 'integer',
        ]);

        // Create scan run record
        $scanRun = SecurityScanRun::create([
            'site_id' => $site->id,
            'scan_type' => 'file_integrity',
            'status' => 'completed',
            'started_at' => now()->subSeconds($validated['scan_duration_seconds'] ?? 0),
            'finished_at' => now(),
            'findings_count' => count($validated['findings']),
        ]);

        // Store findings and create alerts for critical/high
        foreach ($validated['findings'] as $finding) {
            FileIntegrityFinding::create([
                'site_id' => $site->id,
                'scan_run_id' => $scanRun->id,
                'file_path' => $finding['file_path'],
                'change_type' => $finding['change_type'],
                'severity' => $finding['severity'],
                'file_hash_current' => $finding['file_hash_current'] ?? null,
                'file_hash_baseline' => $finding['file_hash_baseline'] ?? null,
                'status' => 'open',
                'detected_at' => now(),
            ]);

            // Create alert and send Telegram for critical/high
            if (in_array($finding['severity'], ['critical', 'high'])) {
                $alert = SecurityAlert::create([
                    'site_id' => $site->id,
                    'alert_type' => 'file_integrity_' . $finding['severity'],
                    'severity' => $finding['severity'],
                    'title' => $this->buildFileAlertTitle($finding, $site),
                    'detail' => $finding,
                    'status' => 'open',
                    'created_at' => now(),
                ]);

                $this->sendSecurityTelegramAlert($alert, $site);
            }
        }

        return response()->json(['status' => 'ok', 'scan_run_id' => $scanRun->id]);
    }

    /**
     * POST /api/agent/security/login-events
     * Receive login events batch from agent.
     */
    public function storeLoginEvents(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');
        $validated = $request->validate([
            'events' => 'required|array',
            'events.*.type' => 'required|in:failed,success',
            'events.*.username' => 'nullable|string',
            'events.*.user_id' => 'nullable|integer',
            'events.*.ip' => 'required|string',
            'events.*.user_agent' => 'nullable|string',
            'events.*.timestamp' => 'required|integer',
        ]);

        // Batch insert login events
        $records = [];
        foreach ($validated['events'] as $event) {
            $records[] = [
                'site_id' => $site->id,
                'event_type' => $event['type'],
                'username' => $event['username'] ?? null,
                'wp_user_id' => $event['user_id'] ?? null,
                'ip_address' => $event['ip'],
                'user_agent' => $event['user_agent'] ?? null,
                'occurred_at' => \Carbon\Carbon::createFromTimestamp($event['timestamp']),
            ];
        }

        LoginEvent::insert($records);

        // Run detection rules
        LoginSecurityAnalyzer::analyze($site);

        return response()->json(['status' => 'ok', 'events_stored' => count($records)]);
    }

    /**
     * POST /api/agent/security/user-alert
     * Handle new admin or privilege escalation alerts from agent.
     */
    public function handleUserAlert(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');
        $validated = $request->validate([
            'event_type' => 'required|in:new_admin_created,user_promoted_to_admin',
            'data' => 'required|array',
            'data.user_id' => 'required|integer',
            'data.username' => 'required|string',
            'data.email' => 'nullable|string',
            'data.ip' => 'nullable|string',
        ]);

        // Create/update admin user record
        SiteAdminUser::updateOrCreate(
            ['site_id' => $site->id, 'wp_user_id' => $validated['data']['user_id']],
            [
                'username' => $validated['data']['username'],
                'email' => $validated['data']['email'] ?? null,
                'status' => 'active',
                'reviewed' => false,
                'first_detected_at' => now(),
                'last_synced_at' => now(),
            ]
        );

        // Create critical alert
        $alert = SecurityAlert::create([
            'site_id' => $site->id,
            'alert_type' => $validated['event_type'],
            'severity' => 'critical',
            'title' => $validated['event_type'] === 'new_admin_created'
                ? "New admin account created: {$validated['data']['username']}"
                : "User promoted to admin: {$validated['data']['username']}",
            'detail' => $validated['data'],
            'status' => 'open',
            'created_at' => now(),
        ]);

        $this->sendSecurityTelegramAlert($alert, $site);

        return response()->json(['status' => 'ok']);
    }

    /**
     * POST /api/agent/security/users-sync
     * Full sync of admin users from agent.
     */
    public function syncAdminUsers(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');
        $validated = $request->validate([
            'admins' => 'required|array',
            'admins.*.user_id' => 'required|integer',
            'admins.*.username' => 'required|string',
            'admins.*.email' => 'nullable|string',
            'admins.*.registered_at' => 'nullable|integer',
            'admins.*.last_login_at' => 'nullable|integer',
        ]);

        $currentWpUserIds = [];
        foreach ($validated['admins'] as $admin) {
            $currentWpUserIds[] = $admin['user_id'];
            SiteAdminUser::updateOrCreate(
                ['site_id' => $site->id, 'wp_user_id' => $admin['user_id']],
                [
                    'username' => $admin['username'],
                    'email' => $admin['email'] ?? null,
                    'registered_at' => isset($admin['registered_at'])
                        ? \Carbon\Carbon::createFromTimestamp($admin['registered_at'])
                        : null,
                    'last_login_at' => isset($admin['last_login_at'])
                        ? \Carbon\Carbon::createFromTimestamp($admin['last_login_at'])
                        : null,
                    'status' => 'active',
                    'first_detected_at' => now(),
                    'last_synced_at' => now(),
                ]
            );
        }

        // Mark missing users as deleted
        SiteAdminUser::where('site_id', $site->id)
            ->whereNotIn('wp_user_id', $currentWpUserIds)
            ->where('status', 'active')
            ->update(['status' => 'deleted']);

        return response()->json(['status' => 'ok']);
    }

    /**
     * POST /api/agent/security/2fa-status
     * Receive 2FA configuration status from agent.
     */
    public function store2faStatus(Request $request): JsonResponse
    {
        $site = $request->get('_agent_site');
        $validated = $request->validate([
            'method' => 'nullable|in:totp,email',
            'enforce_enabled' => 'required|boolean',
            'wp_plugin_used' => 'nullable|string',
            'admin_users' => 'nullable|array',
            'admin_users.*.user_id' => 'required|integer',
            'admin_users.*.username' => 'required|string',
            'admin_users.*.two_fa_enabled' => 'required|boolean',
            'admin_users.*.method' => 'nullable|in:totp,email',
        ]);

        // Update 2FA settings
        Site2faSetting::updateOrCreate(
            ['site_id' => $site->id],
            [
                'enabled' => $validated['enforce_enabled'],
                'method' => $validated['method'],
                'wp_plugin_used' => $validated['wp_plugin_used'] ?? null,
                'enforce_for_admins' => $validated['enforce_enabled'],
            ]
        );

        // Update admin user 2FA status
        if (!empty($validated['admin_users'])) {
            foreach ($validated['admin_users'] as $adminUser) {
                SiteAdminUser::where('site_id', $site->id)
                    ->where('wp_user_id', $adminUser['user_id'])
                    ->update([
                        'two_fa_enabled' => $adminUser['two_fa_enabled'],
                        'two_fa_method' => $adminUser['method'],
                        'last_synced_at' => now(),
                    ]);
            }
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Build a human-readable file alert title.
     */
    private function buildFileAlertTitle(array $finding, $site): string
    {
        $type = match ($finding['change_type']) {
            'added' => 'New file detected',
            'modified' => 'File modified',
            'deleted' => 'File deleted',
        };

        return "{$type}: {$finding['file_path']}";
    }

    /**
     * Send Telegram notification for a security alert.
     */
    private function sendSecurityTelegramAlert(SecurityAlert $alert, $site): void
    {
        $emoji = $alert->severity === 'critical' ? "\xF0\x9F\x9A\xA8" : "\xE2\x9A\xA0\xEF\xB8\x8F";
        $severityLabel = strtoupper($alert->severity);

        $message = "{$emoji} *{$severityLabel} — {$alert->title}*\n";
        $message .= "Site: {$site->name} ({$site->url})\n";

        $detail = is_array($alert->detail) ? $alert->detail : json_decode($alert->detail, true);
        if ($detail) {
            if (isset($detail['file_path'])) {
                $message .= "File: `{$detail['file_path']}`\n";
                $message .= "Type: {$detail['change_type']}\n";
            }
            if (isset($detail['username'])) {
                $message .= "Username: {$detail['username']}\n";
            }
            if (isset($detail['ip'])) {
                $message .= "IP: {$detail['ip']}\n";
            }
        }

        $message .= "Time: " . now()->format('Y-m-d H:i:s');

        try {
            TelegramNotificationService::notifyAdminChannel($message);
            $alert->update(['telegram_sent' => true, 'telegram_sent_at' => now()]);
        } catch (\Exception $e) {
            \Log::error("Failed to send security Telegram alert: " . $e->getMessage());
        }
    }
}
