<?php

namespace App\Services;

use App\Models\VaultAccessLog;

class VaultAuditService
{
    /**
     * Log a vault access action.
     */
    public function log(
        string $action,
        int $siteId,
        ?int $userId = null,
        ?int $credentialId = null,
        ?string $fieldKey = null,
        ?array $metadata = null
    ): VaultAccessLog {
        return VaultAccessLog::create([
            'user_id' => $userId,
            'site_id' => $siteId,
            'site_credential_id' => $credentialId,
            'action' => $action,
            'field_key' => $fieldKey,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'metadata' => $metadata,
        ]);
    }
}
