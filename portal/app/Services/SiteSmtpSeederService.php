<?php

namespace App\Services;

use App\Jobs\PushSmtpToSite;
use App\Models\PortalSetting;
use App\Models\Site;
use App\Models\SiteSmtpSetting;

/**
 * Copies the admin-configured portal SMTP defaults into per-site rows so
 * the agent can apply them to wp_mail. Used in two places:
 *
 *   - "Apply to all sites" button on the Portal SMTP tab (bulk).
 *   - SiteController@store, so newly created sites inherit the default
 *     without an admin touching the SMTP tab.
 *
 * The portal SMTP password is stored already-encrypted in PortalSetting
 * (via CredentialEncryptionService). We copy that ciphertext straight into
 * the site row — no decrypt/re-encrypt cycle, no decrypted password ever in
 * memory here.
 */
class SiteSmtpSeederService
{
    /**
     * Pull the current portal SMTP defaults. Returns null when the admin
     * hasn't configured the portal SMTP at all (host empty), so callers can
     * silently skip rather than seeding empty rows.
     *
     * @return array{
     *   host:string, port:int, username:?string, password_encrypted:?string,
     *   encryption:string, from_email:string, from_name:string
     * }|null
     */
    public function getDefaults(): ?array
    {
        $rows = PortalSetting::whereIn('key', [
            'portal_smtp_host',
            'portal_smtp_port',
            'portal_smtp_username',
            'portal_smtp_password',
            'portal_smtp_encryption',
            'portal_smtp_from_email',
            'portal_smtp_from_name',
        ])->pluck('value', 'key')->toArray();

        if (empty($rows['portal_smtp_host']) || empty($rows['portal_smtp_from_email'])) {
            return null;
        }

        return [
            'host'               => $rows['portal_smtp_host'],
            'port'               => (int) ($rows['portal_smtp_port'] ?? 587),
            'username'           => $rows['portal_smtp_username'] ?? null,
            'password_encrypted' => $rows['portal_smtp_password'] ?? null,
            'encryption'         => $rows['portal_smtp_encryption'] ?? 'tls',
            'from_email'         => $rows['portal_smtp_from_email'],
            'from_name'          => $rows['portal_smtp_from_name'] ?? '',
        ];
    }

    /**
     * Seed a single site's row from the portal defaults and queue the push.
     * No-op when no defaults exist or when the site already has a row and
     * $overwrite is false.
     *
     * Returns 'created', 'overwritten', 'skipped_existing', or 'no_defaults'
     * so the caller can report counts back to the admin.
     */
    public function seedSite(Site $site, bool $overwrite, ?int $actorUserId = null): string
    {
        $defaults = $this->getDefaults();
        if (!$defaults) {
            return 'no_defaults';
        }

        $existing = SiteSmtpSetting::where('site_id', $site->id)->first();
        if ($existing && !$overwrite) {
            return 'skipped_existing';
        }

        $row = SiteSmtpSetting::updateOrCreate(
            ['site_id' => $site->id],
            array_merge($defaults, [
                'enabled'    => true,
                'updated_by' => $actorUserId,
            ])
        );

        PushSmtpToSite::dispatch($row->id);

        return $existing ? 'overwritten' : 'created';
    }

    /**
     * Bulk-seed every site in $sites. Returns a tally for the UI.
     *
     * @param  iterable<Site>  $sites
     * @return array{created:int, overwritten:int, skipped_existing:int, no_api_key:int, no_defaults:bool}
     */
    public function seedMany(iterable $sites, bool $overwrite, ?int $actorUserId = null): array
    {
        $tally = [
            'created'          => 0,
            'overwritten'      => 0,
            'skipped_existing' => 0,
            'no_api_key'       => 0,
            'no_defaults'      => false,
        ];

        if (!$this->getDefaults()) {
            $tally['no_defaults'] = true;
            return $tally;
        }

        foreach ($sites as $site) {
            // Skip sites that have no agent key — the push job would just
            // log-and-skip anyway, but counting it here gives the admin a
            // useful "5 of your sites aren't connected yet" signal.
            if (empty($site->api_key_encrypted)) {
                $tally['no_api_key']++;
                continue;
            }

            $result = $this->seedSite($site, $overwrite, $actorUserId);
            if (isset($tally[$result])) {
                $tally[$result]++;
            }
        }

        return $tally;
    }
}
