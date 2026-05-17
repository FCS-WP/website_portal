<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendTelegramNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 30;

    public function __construct(
        private string $chatId,
        private string $message,
    ) {}

    public function handle(): void
    {
        $token = \App\Models\PortalSetting::where('key', 'telegram_bot_token')->value('value');
        if (empty($token)) {
            $token = config('services.telegram.bot_token');
        }

        if (empty($token)) {
            Log::warning('Telegram notification skipped: no bot token configured.');
            return;
        }

        $payload = [
            'chat_id' => $this->chatId,
            'text' => $this->message,
            'parse_mode' => 'Markdown',
        ];

        // Add topic ID if configured
        $topicId = \App\Models\PortalSetting::where('key', 'telegram_topic_id')->value('value');
        if (empty($topicId)) {
            $topicId = config('services.telegram.topic_id');
        }
        if (!empty($topicId)) {
            $payload['message_thread_id'] = (int) $topicId;
        }

        $response = Http::post("https://api.telegram.org/bot{$token}/sendMessage", $payload);

        if (!$response->successful()) {
            Log::error('Telegram notification failed', [
                'chat_id' => $this->chatId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            // Throw to trigger retry
            throw new \RuntimeException("Telegram API returned {$response->status()}");
        }

        Log::info('Telegram notification sent', ['chat_id' => $this->chatId]);
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('Telegram notification permanently failed', [
            'chat_id' => $this->chatId,
            'error' => $exception->getMessage(),
        ]);
    }
}
