<?php

namespace App\Console\Commands;

use App\Models\Site;
use App\Services\ActivityLogService;
use App\Jobs\SendTelegramNotification;
use Illuminate\Console\Command;
use Carbon\Carbon;

class CheckSiteHealth extends Command
{
    protected $signature = 'sites:check-health';
    protected $description = 'Check site health and mark disconnected/recovered sites';

    public function handle(): int
    {
        $threshold = now()->subMinutes(
            (int) ($this->getConfigValue('agent_ping_interval_minutes', 5) * 3)
        );

        // Find sites that should be marked disconnected
        $disconnected = Site::where('status', 'connected')
            ->where('last_ping_at', '<', $threshold)
            ->get();

        foreach ($disconnected as $site) {
            $site->update(['status' => 'disconnected']);

            ActivityLogService::log(
                'site.disconnected',
                $site,
                null,
                null,
                ['last_ping_at' => $site->last_ping_at?->toIso8601String()]
            );

            // Send Telegram notification
            $this->sendTelegramNotification(
                "🔴 Site *{$site->name}* is offline. Last ping: " .
                ($site->last_ping_at ? $site->last_ping_at->diffForHumans() : 'never')
            );

            $this->info("Marked disconnected: {$site->name} (last ping: {$site->last_ping_at})");
        }

        // Find sites that have recovered (were disconnected but pinged recently)
        $recovered = Site::where('status', 'disconnected')
            ->where('last_ping_at', '>=', $threshold)
            ->get();

        foreach ($recovered as $site) {
            $site->update(['status' => 'connected']);

            ActivityLogService::log(
                'site.recovered',
                $site,
                null,
                null
            );

            // Send Telegram notification
            $this->sendTelegramNotification(
                "🟢 Site *{$site->name}* is back online."
            );

            $this->info("Marked recovered: {$site->name}");
        }

        $this->info("Health check complete. Disconnected: {$disconnected->count()}, Recovered: {$recovered->count()}");

        return Command::SUCCESS;
    }

    private function getConfigValue(string $key, $default = null)
    {
        $setting = \App\Models\PortalSetting::where('key', $key)->first();
        return $setting ? $setting->value : $default;
    }

    private function sendTelegramNotification(string $message): void
    {
        try {
            $chatId = $this->getConfigValue('telegram_default_chat_id');
            $token = $this->getConfigValue('telegram_bot_token');

            if (!empty($chatId) && !empty($token)) {
                SendTelegramNotification::dispatch($chatId, $message);
            }
        } catch (\Exception $e) {
            $this->warn("Failed to queue Telegram notification: {$e->getMessage()}");
        }
    }
}
