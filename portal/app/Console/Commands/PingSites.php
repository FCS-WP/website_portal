<?php

namespace App\Console\Commands;

use App\Models\Site;
use App\Models\PortalSetting;
use App\Jobs\SendTelegramNotification;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PingSites extends Command
{
    protected $signature = 'sites:ping';
    protected $description = 'Ping all active sites to check connectivity and update status';

    public function handle(): int
    {
        $sites = Site::whereNotNull('api_key_encrypted')
            ->whereIn('status', ['connected', 'pending', 'disconnected'])
            ->get();

        $this->info("Pinging {$sites->count()} sites...");

        foreach ($sites as $site) {
            try {
                $response = Http::timeout(10)
                    ->withHeaders([
                        'X-Agent-Key' => decrypt($site->api_key_encrypted),
                        'Accept' => 'application/json',
                    ])
                    ->get(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/status');

                if ($response->successful()) {
                    $data = $response->json();

                    $site->update([
                        'status' => 'connected',
                        'last_ping_at' => now(),
                        'wp_version' => $data['wp_version'] ?? null,
                        'php_version' => $data['php_version'] ?? null,
                    ]);

                    $this->line("  ✓ {$site->name} ({$site->url}) - connected");
                } else {
                    $this->handleFailedPing($site, "HTTP {$response->status()}");
                }
            } catch (\Exception $e) {
                $this->handleFailedPing($site, $e->getMessage());
            }
        }

        $this->info('Ping complete.');

        return Command::SUCCESS;
    }

    private function handleFailedPing(Site $site, string $reason): void
    {
        // Only mark as disconnected if previously connected and last successful ping was > 15 minutes ago
        if ($site->status === 'connected' && $site->last_ping_at && $site->last_ping_at->lt(now()->subMinutes(15))) {
            $site->update(['status' => 'disconnected']);
            $this->warn("  ✗ {$site->name} - DISCONNECTED ({$reason})");

            Log::warning("Site disconnected via ping", [
                'site_id' => $site->id,
                'site_name' => $site->name,
                'url' => $site->url,
                'reason' => $reason,
            ]);

            $this->sendTelegramNotification(
                "⚠️ Site Disconnected: {$site->name} ({$site->url})\nReason: {$reason}"
            );
        } else {
            $this->warn("  ✗ {$site->name} - failed ({$reason})");
        }
    }

    private function sendTelegramNotification(string $message): void
    {
        try {
            $chatId = PortalSetting::where('key', 'telegram_default_chat_id')->value('value');
            $token = PortalSetting::where('key', 'telegram_bot_token')->value('value');

            if (!empty($chatId) && !empty($token)) {
                SendTelegramNotification::dispatch($chatId, $message);
            }
        } catch (\Exception $e) {
            $this->warn("  Failed to queue Telegram notification: {$e->getMessage()}");
        }
    }
}
