<?php

namespace App\Jobs;

use App\Models\PortalSetting;
use App\Models\Site;
use App\Models\Site2faSetting;
use App\Services\ActivityLogService;
use App\Services\SitePluginSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PingSiteJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 20;

    // --- Tunables ---
    private const HTTP_TIMEOUT_SECONDS = 10;
    private const DISCONNECT_AT_FAILURES = 3;
    private const ALERT_COOLDOWN_MINUTES = 60;

    public function __construct(public int $siteId)
    {
        $this->onQueue('pings');
    }

    public function handle(): void
    {
        $site = Site::find($this->siteId);
        if (!$site || !$site->api_key_encrypted) {
            return;
        }

        try {
            $response = Http::timeout(self::HTTP_TIMEOUT_SECONDS)
                ->withHeaders([
                    'X-Agent-Key' => decrypt($site->api_key_encrypted),
                    'Accept' => 'application/json',
                ])
                ->get(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/status');

            if ($response->successful()) {
                $this->handleSuccess($site, $response->json() ?? []);
                return;
            }

            $this->handleFailure($site, "HTTP {$response->status()}");
        } catch (\Throwable $e) {
            $this->handleFailure($site, $e->getMessage());
        }
    }

    private function handleSuccess(Site $site, array $data): void
    {
        $wasDisconnected = $site->status === 'disconnected';

        $site->update([
            'status' => 'connected',
            'last_ping_at' => now(),
            'wp_version' => $data['wp_version'] ?? $site->wp_version,
            'php_version' => $data['php_version'] ?? $site->php_version,
            'consecutive_ping_failures' => 0,
        ]);

        // --- 2FA sync ---
        if (isset($data['two_fa'])) {
            $twoFa = $data['two_fa'];
            Site2faSetting::updateOrCreate(
                ['site_id' => $site->id],
                [
                    'enabled' => $twoFa['enabled'] ?? false,
                    'method' => $twoFa['method'] ?? null,
                    'wp_plugin_used' => $twoFa['plugin'] ?? null,
                ]
            );
        }

        // --- Plugin sync ---
        if (isset($data['all_plugins']) && is_array($data['all_plugins'])) {
            SitePluginSyncService::syncAll($site, $data['all_plugins']);
        }

        // --- Recovery alert ---
        if ($wasDisconnected) {
            ActivityLogService::log('site.recovered', $site);
            $this->notify("🟢 Site *{$site->name}* is back online.");
        }
    }

    private function handleFailure(Site $site, string $reason): void
    {
        $failures = (int) $site->consecutive_ping_failures + 1;
        $update = ['consecutive_ping_failures' => $failures];

        $shouldDisconnect = $site->status === 'connected'
            && $failures >= self::DISCONNECT_AT_FAILURES;

        if ($shouldDisconnect) {
            $update['status'] = 'disconnected';

            $alertOk = !$site->last_disconnect_alert_at
                || $site->last_disconnect_alert_at->lt(now()->subMinutes(self::ALERT_COOLDOWN_MINUTES));

            if ($alertOk) {
                $update['last_disconnect_alert_at'] = now();
            }

            $site->update($update);

            ActivityLogService::log(
                'site.disconnected',
                $site,
                null,
                null,
                [
                    'last_ping_at' => $site->last_ping_at?->toIso8601String(),
                    'reason' => substr($reason, 0, 200),
                    'consecutive_failures' => $failures,
                ]
            );

            Log::warning('Site disconnected via ping', [
                'site_id' => $site->id,
                'site_name' => $site->name,
                'url' => $site->url,
                'reason' => $reason,
                'consecutive_failures' => $failures,
            ]);

            if ($alertOk) {
                $lastPing = $site->last_ping_at
                    ? $site->last_ping_at->diffForHumans()
                    : 'never';
                $this->notify(
                    "🔴 Site *{$site->name}* is offline.\n"
                    . "Last successful ping: {$lastPing}\n"
                    . "Reason: " . substr($reason, 0, 200)
                );
            }
            return;
        }

        $site->update($update);
    }

    private function notify(string $message): void
    {
        try {
            $chatId = PortalSetting::where('key', 'telegram_default_chat_id')->value('value');
            $token = PortalSetting::where('key', 'telegram_bot_token')->value('value');
            if (!empty($chatId) && !empty($token)) {
                SendTelegramNotification::dispatch($chatId, $message);
            }
        } catch (\Throwable $e) {
            Log::warning("PingSiteJob notify failed: {$e->getMessage()}");
        }
    }
}
