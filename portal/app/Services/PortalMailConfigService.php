<?php

namespace App\Services;

use App\Models\PortalSetting;
use Illuminate\Support\Facades\Config;

/**
 * Reads portal-wide SMTP settings out of PortalSetting (key/value) and writes
 * them onto config('mail.*') at runtime. Called once from AppServiceProvider
 * boot() so every outgoing portal mail (password resets, alerts, etc.) uses
 * the admin-configured SMTP server instead of the static .env values.
 *
 * Settings live under these PortalSetting keys:
 *   portal_smtp_enabled       bool   gate, default false (keeps MAIL_MAILER=log)
 *   portal_smtp_host          string
 *   portal_smtp_port          int    default 587
 *   portal_smtp_username      string
 *   portal_smtp_password      enc    encrypted via CredentialEncryptionService
 *   portal_smtp_encryption    string tls|ssl|none, default tls
 *   portal_smtp_from_email    string
 *   portal_smtp_from_name     string
 */
class PortalMailConfigService
{
    public function apply(): void
    {
        try {
            $rows = PortalSetting::whereIn('key', [
                'portal_smtp_enabled',
                'portal_smtp_host',
                'portal_smtp_port',
                'portal_smtp_username',
                'portal_smtp_password',
                'portal_smtp_encryption',
                'portal_smtp_from_email',
                'portal_smtp_from_name',
            ])->pluck('value', 'key')->toArray();
        } catch (\Throwable $e) {
            // DB unavailable (migrations not yet run, or boot-time CLI command
            // like `artisan key:generate`). Fall through silently.
            return;
        }

        $enabled = filter_var($rows['portal_smtp_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$enabled || empty($rows['portal_smtp_host'])) {
            return;
        }

        $password = '';
        if (!empty($rows['portal_smtp_password'])) {
            try {
                $password = app(CredentialEncryptionService::class)->decrypt($rows['portal_smtp_password']);
            } catch (\Throwable $e) {
                $password = '';
            }
        }

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', $rows['portal_smtp_host']);
        Config::set('mail.mailers.smtp.port', (int) ($rows['portal_smtp_port'] ?? 587));
        Config::set('mail.mailers.smtp.username', $rows['portal_smtp_username'] ?? null);
        Config::set('mail.mailers.smtp.password', $password);

        $encryption = $rows['portal_smtp_encryption'] ?? 'tls';
        Config::set('mail.mailers.smtp.encryption', $encryption === 'none' ? null : $encryption);
        Config::set('mail.mailers.smtp.scheme', $encryption === 'ssl' ? 'smtps' : null);

        if (!empty($rows['portal_smtp_from_email'])) {
            Config::set('mail.from.address', $rows['portal_smtp_from_email']);
        }
        if (!empty($rows['portal_smtp_from_name'])) {
            Config::set('mail.from.name', $rows['portal_smtp_from_name']);
        }
    }
}
