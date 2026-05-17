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
        $settings = PortalSetting::all()->pluck('value', 'key')->toArray();

        // Mask sensitive values
        if (!empty($settings['telegram_bot_token'])) {
            $settings['telegram_bot_token'] = '••••••••' . substr($settings['telegram_bot_token'], -4);
        }

        // Decode JSON-stored array settings so the frontend sees a real array
        // instead of a JSON string. Falls back to the same default the
        // classifier uses when the row is missing.
        $settings['company_plugin_prefixes'] = $this->decodePrefixes($settings['company_plugin_prefixes'] ?? null);

        return $this->successResponse($settings);
    }

    private function decodePrefixes($raw): array
    {
        if (empty($raw)) {
            return ['epos-'];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? array_values($decoded) : ['epos-'];
    }

    /**
     * PUT /api/settings
     */
    public function update(Request $request)
    {
        $request->validate([
            'telegram_bot_token' => 'nullable|string',
            'telegram_default_chat_id' => 'nullable|string',
            'telegram_topic_id' => 'nullable|string',
            'portal_base_url' => 'nullable|url',
            'agent_ping_interval_minutes' => 'nullable|integer|min:1|max:60',
            'max_deployment_retries' => 'nullable|integer|min:0|max:10',
            'rollback_enabled' => 'nullable|boolean',
            'rollback_check_delay_minutes' => 'nullable|integer|min:1|max:30',
            'rollback_second_check_delay_minutes' => 'nullable|integer|min:1|max:60',
            // Phase 6 — list of slug prefixes (e.g. "epos-", "zippy-").
            // Stored JSON-encoded on the same `value` column so no schema change.
            // Pattern requires lowercase, ends with hyphen, only [a-z0-9-].
            'company_plugin_prefixes' => 'nullable|array|max:20',
            'company_plugin_prefixes.*' => 'string|max:50|regex:/^[a-z0-9][a-z0-9-]*-$/',
        ]);

        $allowedKeys = [
            'telegram_bot_token',
            'telegram_default_chat_id',
            'telegram_topic_id',
            'portal_base_url',
            'agent_ping_interval_minutes',
            'max_deployment_retries',
            'rollback_enabled',
            'rollback_check_delay_minutes',
            'rollback_second_check_delay_minutes',
        ];

        foreach ($request->only($allowedKeys) as $key => $value) {
            if ($value !== null) {
                PortalSetting::updateOrCreate(
                    ['key' => $key],
                    ['value' => $value]
                );
            }
        }

        // Prefixes are stored JSON-encoded after normalization (lowercase, dedupe).
        // We persist on every update call, including an empty list — that lets
        // the admin reset to the empty state from the UI.
        if ($request->has('company_plugin_prefixes')) {
            $prefixes = collect((array) $request->input('company_plugin_prefixes', []))
                ->map(fn ($p) => strtolower(trim((string) $p)))
                ->filter()
                ->unique()
                ->values()
                ->all();

            PortalSetting::updateOrCreate(
                ['key' => 'company_plugin_prefixes'],
                ['value' => json_encode($prefixes)]
            );
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
