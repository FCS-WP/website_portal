<?php

namespace App\Jobs;

use App\Models\SiteSmtpSetting;
use App\Services\CredentialEncryptionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pushes a SiteSmtpSetting to the corresponding site's agent plugin via the
 * /smtp/update REST endpoint. Runs on the `deployments` queue (same as the
 * plugin push job) so the prod worker container picks it up.
 *
 * We pass the row id (not the model instance) to avoid serializing the
 * encrypted password column into the queue payload.
 */
class PushSmtpToSite implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 60;

    public function __construct(public int $siteSmtpSettingId)
    {
        $this->onQueue('deployments');
    }

    public function handle(): void
    {
        $row = SiteSmtpSetting::with('site')->find($this->siteSmtpSettingId);
        if (!$row || !$row->site) {
            Log::warning("PushSmtpToSite: missing row or site for id {$this->siteSmtpSettingId}");
            return;
        }

        $site = $row->site;
        if (!$site->api_key_encrypted) {
            Log::warning("PushSmtpToSite: site #{$site->id} has no agent API key, skipping");
            return;
        }

        $password = '';
        if (!empty($row->password_encrypted)) {
            try {
                $password = app(CredentialEncryptionService::class)->decrypt($row->password_encrypted);
            } catch (\Throwable $e) {
                Log::error("PushSmtpToSite: decrypt failed for row #{$row->id}: " . $e->getMessage());
                return;
            }
        }

        try {
            $response = Http::timeout(45)
                ->withHeaders([
                    'X-Agent-Key' => decrypt($site->api_key_encrypted),
                    'X-Site-Url'  => $site->url,
                    'Accept'      => 'application/json',
                ])
                ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/smtp/update', [
                    'host'       => $row->host,
                    'port'       => $row->port,
                    'username'   => $row->username ?? '',
                    'password'   => $password,
                    'encryption' => $row->encryption,
                    'from_email' => $row->from_email,
                    'from_name'  => $row->from_name,
                ]);

            if ($response->successful()) {
                $row->update(['last_pushed_at' => now()]);
                Log::info("PushSmtpToSite: pushed SMTP config to site #{$site->id}");
                return;
            }

            throw new \RuntimeException('Agent returned ' . $response->status() . ': ' . $response->body());
        } catch (\Throwable $e) {
            Log::error("PushSmtpToSite failed for site #{$site->id}: " . $e->getMessage());
            throw $e; // Let queue retry policy handle it.
        }
    }
}
