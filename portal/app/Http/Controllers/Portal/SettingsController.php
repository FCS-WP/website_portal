<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\PortalSetting;
use App\Traits\ApiResponse;
use App\Services\TelegramNotificationService;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/settings
     */
    public function index()
    {
        $settings = PortalSetting::all()->pluck('value', 'key');

        // Mask sensitive values
        if (isset($settings['telegram_bot_token']) && $settings['telegram_bot_token']) {
            $settings['telegram_bot_token'] = '••••••••' . substr($settings['telegram_bot_token'], -4);
        }

        return $this->successResponse($settings);
    }

    /**
     * PUT /api/settings
     */
    public function update(Request $request)
    {
        $request->validate([
            'telegram_bot_token' => 'nullable|string',
            'telegram_default_chat_id' => 'nullable|string',
            'portal_base_url' => 'nullable|url',
            'agent_ping_interval_minutes' => 'nullable|integer|min:1|max:60',
            'max_deployment_retries' => 'nullable|integer|min:0|max:10',
        ]);

        $allowedKeys = [
            'telegram_bot_token',
            'telegram_default_chat_id',
            'portal_base_url',
            'agent_ping_interval_minutes',
            'max_deployment_retries',
        ];

        foreach ($request->only($allowedKeys) as $key => $value) {
            if ($value !== null) {
                PortalSetting::updateOrCreate(
                    ['key' => $key],
                    ['value' => $value]
                );
            }
        }

        // Clear Telegram cache when settings change
        TelegramNotificationService::clearCache();

        return $this->successResponse(null, 'Settings updated successfully.');
    }

    /**
     * POST /api/settings/telegram/test
     */
    public function testTelegram(Request $request)
    {
        $request->validate([
            'chat_id' => 'required|string',
        ]);

        $success = TelegramNotificationService::send(
            $request->chat_id,
            "✅ *EPOS Portal* — Test notification successful!\n\nYour Telegram integration is working correctly."
        );

        if ($success) {
            return $this->successResponse(null, 'Test message sent successfully.');
        }

        return $this->errorResponse('Failed to send test message. Check your bot token and chat ID.', 500);
    }
}
