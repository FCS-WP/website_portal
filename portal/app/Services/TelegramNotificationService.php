<?php

namespace App\Services;

use App\Models\PortalSetting;
use App\Jobs\SendTelegramNotification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class TelegramNotificationService
{
    /**
     * Send a Telegram message synchronously (for testing).
     */
    public static function send(string $chatId, string $message): bool
    {
        $token = self::getBotToken();

        if (empty($token)) {
            Log::warning('Telegram send skipped: no bot token configured.');
            return false;
        }

        try {
            $response = Http::timeout(10)->post(
                "https://api.telegram.org/bot{$token}/sendMessage",
                [
                    'chat_id' => $chatId,
                    'text' => $message,
                    'parse_mode' => 'Markdown',
                ]
            );

            if ($response->successful()) {
                return true;
            }

            Log::error('Telegram send failed', [
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            return false;
        } catch (\Exception $e) {
            Log::error('Telegram send exception', ['error' => $e->getMessage()]);
            return false;
        }
    }

    /**
     * Queue a Telegram notification for async delivery.
     */
    public static function queue(string $chatId, string $message): void
    {
        if (empty($chatId)) {
            $chatId = self::getDefaultChatId();
        }

        if (empty($chatId)) {
            Log::warning('Telegram queue skipped: no chat_id available.');
            return;
        }

        SendTelegramNotification::dispatch($chatId, $message);
    }

    /**
     * Send to the default admin channel.
     */
    public static function notifyAdminChannel(string $message): void
    {
        $chatId = self::getDefaultChatId();
        if ($chatId) {
            self::queue($chatId, $message);
        }
    }

    /**
     * Get the bot token from settings (cached).
     */
    private static function getBotToken(): ?string
    {
        return Cache::remember('telegram_bot_token', 300, function () {
            return PortalSetting::where('key', 'telegram_bot_token')->value('value');
        });
    }

    /**
     * Get the default chat ID from settings (cached).
     */
    private static function getDefaultChatId(): ?string
    {
        return Cache::remember('telegram_default_chat_id', 300, function () {
            return PortalSetting::where('key', 'telegram_default_chat_id')->value('value');
        });
    }

    /**
     * Clear cached settings (call when settings are updated).
     */
    public static function clearCache(): void
    {
        Cache::forget('telegram_bot_token');
        Cache::forget('telegram_default_chat_id');
    }
}
