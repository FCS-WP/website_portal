<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Jobs\PushSmtpToSite;
use App\Models\PortalSetting;
use App\Models\Site;
use App\Models\SiteSmtpSetting;
use App\Services\CredentialEncryptionService;
use App\Services\SiteSmtpSeederService;
use App\Traits\ApiResponse;
use App\Traits\AuthorizesSiteAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

/**
 * SMTP configuration for the portal itself + each managed site.
 *
 * Portal-side endpoints write to PortalSetting (key/value); per-site endpoints
 * write to site_smtp_settings (password encrypted with VAULT_MASTER_KEY) and
 * dispatch PushSmtpToSite which calls the agent's /smtp/update REST endpoint.
 */
class SmtpController extends Controller
{
    use ApiResponse, AuthorizesSiteAccess;

    private const PORTAL_KEYS = [
        'portal_smtp_enabled',
        'portal_smtp_host',
        'portal_smtp_port',
        'portal_smtp_username',
        'portal_smtp_password',
        'portal_smtp_encryption',
        'portal_smtp_from_email',
        'portal_smtp_from_name',
    ];

    // ─── Portal-wide SMTP ───────────────────────────────────────────────

    /** GET /api/smtp/portal */
    public function showPortal()
    {
        $rows = PortalSetting::whereIn('key', self::PORTAL_KEYS)
            ->pluck('value', 'key')
            ->toArray();

        return $this->successResponse([
            'enabled'    => filter_var($rows['portal_smtp_enabled'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'host'       => $rows['portal_smtp_host'] ?? '',
            'port'       => (int) ($rows['portal_smtp_port'] ?? 587),
            'username'   => $rows['portal_smtp_username'] ?? '',
            // Never return the password — UI shows a masked placeholder if set.
            'password_set' => !empty($rows['portal_smtp_password']),
            'encryption' => $rows['portal_smtp_encryption'] ?? 'tls',
            'from_email' => $rows['portal_smtp_from_email'] ?? '',
            'from_name'  => $rows['portal_smtp_from_name'] ?? '',
        ]);
    }

    /** PUT /api/smtp/portal */
    public function updatePortal(Request $request)
    {
        $data = $request->validate([
            'enabled'    => 'required|boolean',
            'host'       => 'required_if:enabled,true|nullable|string|max:255',
            'port'       => 'required_if:enabled,true|nullable|integer|min:1|max:65535',
            'username'   => 'nullable|string|max:255',
            // Password is optional on update — empty means "keep existing".
            'password'   => 'nullable|string|max:255',
            'encryption' => 'required|in:tls,ssl,none',
            'from_email' => 'required_if:enabled,true|nullable|email|max:255',
            'from_name'  => 'required_if:enabled,true|nullable|string|max:255',
        ]);

        $writes = [
            'portal_smtp_enabled'    => $data['enabled'] ? '1' : '0',
            'portal_smtp_host'       => $data['host'] ?? '',
            'portal_smtp_port'       => (string) ($data['port'] ?? 587),
            'portal_smtp_username'   => $data['username'] ?? '',
            'portal_smtp_encryption' => $data['encryption'],
            'portal_smtp_from_email' => $data['from_email'] ?? '',
            'portal_smtp_from_name'  => $data['from_name'] ?? '',
        ];

        if (!empty($data['password'])) {
            $writes['portal_smtp_password'] = app(CredentialEncryptionService::class)
                ->encrypt($data['password']);
        }

        foreach ($writes as $key => $value) {
            PortalSetting::updateOrCreate(['key' => $key], ['value' => $value]);
        }

        return $this->successResponse(null, 'Portal SMTP settings saved.');
    }

    /**
     * POST /api/smtp/portal/apply-to-sites
     *
     * Copies the saved portal SMTP defaults into every site (or every site
     * without an existing per-site config, depending on `overwrite`). Each
     * affected site gets a PushSmtpToSite job dispatched so the agent picks
     * up the new config without the admin having to touch each one.
     */
    public function applyToSites(Request $request, SiteSmtpSeederService $seeder)
    {
        $data = $request->validate([
            'overwrite' => 'sometimes|boolean',
        ]);
        $overwrite = (bool) ($data['overwrite'] ?? false);

        // Trash-soft-deleted sites are excluded by the default scope; that's
        // what we want here. We don't filter by `status` because even
        // pending/disconnected sites should get the config staged for when
        // they come back online.
        $sites = Site::all();
        $tally = $seeder->seedMany($sites, $overwrite, $request->user()->id);

        if ($tally['no_defaults']) {
            return $this->errorResponse(
                'Portal SMTP is not configured yet. Save the form first, then click "Apply to all sites".',
                400
            );
        }

        $msg = sprintf(
            '%d created, %d overwritten, %d skipped (already configured), %d skipped (no agent key).',
            $tally['created'],
            $tally['overwritten'],
            $tally['skipped_existing'],
            $tally['no_api_key']
        );

        return $this->successResponse($tally, $msg);
    }

    /** POST /api/smtp/portal/test */
    public function testPortal(Request $request)
    {
        $data = $request->validate([
            'to_email' => 'required|email',
        ]);

        // Re-apply settings in case they just changed in the same request cycle.
        app(\App\Services\PortalMailConfigService::class)->apply();

        try {
            Mail::raw(
                "This is a test email from the EPOS Portal. If you received this, your portal SMTP configuration is working correctly.",
                function ($m) use ($data) {
                    $m->to($data['to_email'])->subject('EPOS Portal — SMTP test');
                }
            );
            return $this->successResponse(null, 'Test email sent to ' . $data['to_email']);
        } catch (\Throwable $e) {
            return $this->errorResponse('Failed to send: ' . $e->getMessage(), 500);
        }
    }

    // ─── Per-site SMTP ─────────────────────────────────────────────────

    /** GET /api/sites/{site}/smtp */
    public function showSite(Request $request, Site $site)
    {
        $this->assertSiteAccess($request, $site);

        $row = SiteSmtpSetting::where('site_id', $site->id)->first();
        if (!$row) {
            return $this->successResponse([
                'configured'   => false,
                'enabled'      => false,
                'host'         => '',
                'port'         => 587,
                'username'     => '',
                'password_set' => false,
                'encryption'   => 'tls',
                'from_email'   => '',
                'from_name'    => '',
                'last_pushed_at' => null,
            ]);
        }

        return $this->successResponse([
            'configured'   => true,
            'enabled'      => $row->enabled,
            'host'         => $row->host,
            'port'         => $row->port,
            'username'     => $row->username ?? '',
            'password_set' => !empty($row->password_encrypted),
            'encryption'   => $row->encryption,
            'from_email'   => $row->from_email,
            'from_name'    => $row->from_name,
            'last_pushed_at' => $row->last_pushed_at,
        ]);
    }

    /** PUT /api/sites/{site}/smtp */
    public function updateSite(Request $request, Site $site)
    {
        $this->assertSiteAccess($request, $site);

        $data = $request->validate([
            'enabled'    => 'required|boolean',
            'host'       => 'required|string|max:255',
            'port'       => 'required|integer|min:1|max:65535',
            'username'   => 'nullable|string|max:255',
            'password'   => 'nullable|string|max:255',
            'encryption' => 'required|in:tls,ssl,none',
            'from_email' => 'required|email|max:255',
            'from_name'  => 'required|string|max:255',
        ]);

        $row = SiteSmtpSetting::where('site_id', $site->id)->first();

        $attributes = [
            'site_id'    => $site->id,
            'host'       => $data['host'],
            'port'       => $data['port'],
            'username'   => $data['username'] ?? null,
            'encryption' => $data['encryption'],
            'from_email' => $data['from_email'],
            'from_name'  => $data['from_name'],
            'enabled'    => $data['enabled'],
            'updated_by' => $request->user()->id,
        ];

        if (!empty($data['password'])) {
            $attributes['password_encrypted'] = app(CredentialEncryptionService::class)
                ->encrypt($data['password']);
        } elseif (!$row) {
            // Creating a new row with no password — store empty string encrypted,
            // so the agent gets a deterministic field even if the SMTP server
            // doesn't require auth.
            $attributes['password_encrypted'] = app(CredentialEncryptionService::class)
                ->encrypt('');
        }

        $row = SiteSmtpSetting::updateOrCreate(
            ['site_id' => $site->id],
            $attributes
        );

        // Push to the agent. Synchronous dispatch (via queue) keeps the response
        // fast; the UI polls last_pushed_at if it cares about confirmation.
        PushSmtpToSite::dispatch($row->id);

        return $this->successResponse(null, 'Site SMTP settings saved and queued for push.');
    }

    /** POST /api/sites/{site}/smtp/test */
    public function testSite(Request $request, Site $site)
    {
        $this->assertSiteAccess($request, $site);

        $data = $request->validate([
            'to_email' => 'required|email',
        ]);

        if (!$site->api_key_encrypted) {
            return $this->errorResponse('Site has no agent API key configured.', 400);
        }

        try {
            $response = Http::timeout(30)
                ->withHeaders([
                    'X-Agent-Key' => decrypt($site->api_key_encrypted),
                    'X-Site-Url'  => $site->url,
                    'Accept'      => 'application/json',
                ])
                ->post(rtrim($site->url, '/') . '/wp-json/epos-agent/v1/smtp/test', [
                    'to_email' => $data['to_email'],
                ]);

            if ($response->successful()) {
                return $this->successResponse(null, 'Test email sent to ' . $data['to_email']);
            }

            $body = $response->json();
            $msg = $body['message'] ?? ('Agent returned ' . $response->status());
            return $this->errorResponse($msg, 502);
        } catch (\Throwable $e) {
            return $this->errorResponse('Failed to reach agent: ' . $e->getMessage(), 502);
        }
    }
}
