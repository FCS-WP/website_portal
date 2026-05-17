<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\CredentialType;
use App\Models\Site;
use App\Models\SiteCredential;
use App\Models\SiteCredentialField;
use App\Services\CredentialEncryptionService;
use App\Services\TelegramNotificationService;
use App\Services\VaultAuditService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;

class CredentialController extends Controller
{
    use ApiResponse;

    // Credential type slugs that Dev can access
    private const DEV_ALLOWED_TYPES = ['wordpress', 'ftp', 'custom'];

    private CredentialEncryptionService $encryptionService;
    private VaultAuditService $auditService;

    public function __construct(CredentialEncryptionService $encryptionService, VaultAuditService $auditService)
    {
        $this->encryptionService = $encryptionService;
        $this->auditService = $auditService;
    }

    /**
     * GET /api/sites/{site}/credentials
     * List all credentials for a site.
     */
    public function index(Request $request, Site $site): JsonResponse
    {
        $user = $request->user();

        // MKT has read access (incl. reveal/copy for client handoff) but no
        // write — destroy/store/update still block them below. Audit-logging
        // captures every reveal/copy so the trail is preserved.

        // Check site accessibility for non-admin users
        if (!$this->canAccessSite($user, $site)) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        $query = $site->hasMany(SiteCredential::class)
            ->with(['credentialType', 'fields']);

        // Dev: filter to allowed credential types only
        if ($user->role === 'dev') {
            $query->whereHas('credentialType', function ($q) {
                $q->whereIn('slug', self::DEV_ALLOWED_TYPES);
            });
        }

        $credentials = $query->orderByDesc('updated_at')->get();

        $data = $credentials->map(fn($cred) => $this->formatCredential($cred));

        return $this->successResponse($data);
    }

    /**
     * POST /api/sites/{site}/credentials
     * Create a new credential.
     */
    public function store(Request $request, Site $site): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'mkt') {
            return $this->errorResponse('You do not have access to the vault.', 403);
        }

        if (!$this->canAccessSite($user, $site)) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        $request->validate([
            'credential_type_id' => 'required|exists:credential_types,id',
            'label' => 'required|string|max:255',
            'vault_pin' => 'required|string',
            'fields' => 'required|array|min:1',
            'fields.*.field_key' => 'required|string|max:100',
            'fields.*.field_label' => 'required|string|max:255',
            'fields.*.field_value' => 'nullable|string',
            'fields.*.is_sensitive' => 'required|boolean',
        ]);

        // Verify vault PIN
        $this->verifyPin($request);

        // Check role-based type restriction for Dev
        $credentialType = CredentialType::findOrFail($request->credential_type_id);
        if ($user->role === 'dev' && !in_array($credentialType->slug, self::DEV_ALLOWED_TYPES)) {
            return $this->errorResponse('You do not have permission to create this credential type.', 403);
        }

        $credential = DB::transaction(function () use ($request, $site, $user) {
            $credential = SiteCredential::create([
                'site_id' => $site->id,
                'credential_type_id' => $request->credential_type_id,
                'label' => $request->label,
                'created_by' => $user->id,
                'updated_by' => $user->id,
            ]);

            foreach ($request->fields as $index => $field) {
                $value = $field['field_value'] ?? '';
                $isSensitive = (bool) $field['is_sensitive'];

                if ($isSensitive && $value !== '' && $value !== null) {
                    $value = $this->encryptionService->encrypt($value);
                }

                SiteCredentialField::create([
                    'site_credential_id' => $credential->id,
                    'field_key' => $field['field_key'],
                    'field_label' => $field['field_label'],
                    'field_value' => $value,
                    'is_sensitive' => $isSensitive,
                    'sort_order' => $index,
                ]);
            }

            return $credential;
        });

        $credential->load(['credentialType', 'fields']);

        // Audit log: created
        $this->auditService->log(
            'created',
            $site->id,
            $user->id,
            $credential->id
        );

        return $this->successResponse(
            $this->formatCredential($credential),
            'Credential created successfully',
            201
        );
    }

    /**
     * GET /api/sites/{site}/credentials/{credential}
     * Show a single credential.
     */
    public function show(Request $request, Site $site, SiteCredential $credential): JsonResponse
    {
        $user = $request->user();

        // MKT can read individual credential records (no MKT block here);
        // they need this to look up usernames before pulling a reveal.

        if (!$this->canAccessSite($user, $site)) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        // Ensure credential belongs to this site
        if ($credential->site_id !== $site->id) {
            return $this->errorResponse('Credential not found.', 404);
        }

        // Dev: check credential type
        $credential->load(['credentialType', 'fields']);
        if ($user->role === 'dev' && !in_array($credential->credentialType->slug, self::DEV_ALLOWED_TYPES)) {
            return $this->errorResponse('You do not have access to this credential type.', 403);
        }

        return $this->successResponse($this->formatCredential($credential));
    }

    /**
     * PUT /api/sites/{site}/credentials/{credential}
     * Update a credential.
     */
    public function update(Request $request, Site $site, SiteCredential $credential): JsonResponse
    {
        $user = $request->user();

        if ($user->role === 'mkt') {
            return $this->errorResponse('You do not have access to the vault.', 403);
        }

        if (!$this->canAccessSite($user, $site)) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        if ($credential->site_id !== $site->id) {
            return $this->errorResponse('Credential not found.', 404);
        }

        $request->validate([
            'label' => 'nullable|string|max:255',
            'vault_pin' => 'required|string',
            'fields' => 'nullable|array',
            'fields.*.field_key' => 'required_with:fields|string|max:100',
            'fields.*.field_value' => 'nullable|string',
        ]);

        // Verify vault PIN
        $this->verifyPin($request);

        // Check role-based type restriction for Dev
        $credential->load('credentialType');
        if ($user->role === 'dev' && !in_array($credential->credentialType->slug, self::DEV_ALLOWED_TYPES)) {
            return $this->errorResponse('You do not have permission to edit this credential type.', 403);
        }

        DB::transaction(function () use ($request, $credential, $user) {
            // Update label if provided
            if ($request->has('label') && $request->label !== null) {
                $credential->label = $request->label;
            }
            $credential->updated_by = $user->id;
            $credential->save();

            // Update fields if provided
            if ($request->has('fields') && is_array($request->fields)) {
                foreach ($request->fields as $fieldData) {
                    $existingField = $credential->fields()
                        ->where('field_key', $fieldData['field_key'])
                        ->first();

                    if (!$existingField) {
                        continue;
                    }

                    $newValue = $fieldData['field_value'] ?? null;

                    if ($existingField->is_sensitive) {
                        // For sensitive fields: keep existing value if new value is null/empty
                        if ($newValue !== null && $newValue !== '') {
                            $existingField->field_value = $this->encryptionService->encrypt($newValue);
                        }
                        // else: keep existing encrypted value unchanged
                    } else {
                        // Non-sensitive: update directly
                        $existingField->field_value = $newValue ?? '';
                    }

                    // Update label if provided
                    if (isset($fieldData['field_label'])) {
                        $existingField->field_label = $fieldData['field_label'];
                    }

                    $existingField->save();
                }
            }
        });

        $credential->load(['credentialType', 'fields']);

        // Audit log: edited
        $this->auditService->log(
            'edited',
            $site->id,
            $user->id,
            $credential->id
        );

        return $this->successResponse(
            $this->formatCredential($credential),
            'Credential updated successfully'
        );
    }

    /**
     * DELETE /api/sites/{site}/credentials/{credential}
     * Delete a credential (admin only).
     */
    public function destroy(Request $request, Site $site, SiteCredential $credential): JsonResponse
    {
        $user = $request->user();

        // Admin only
        if ($user->role !== 'admin') {
            return $this->errorResponse('Only administrators can delete credentials.', 403);
        }

        if ($credential->site_id !== $site->id) {
            return $this->errorResponse('Credential not found.', 404);
        }

        $request->validate([
            'vault_pin' => 'required|string',
        ]);

        // Verify vault PIN
        $this->verifyPin($request);

        // Audit log: deleted
        $this->auditService->log(
            'deleted',
            $site->id,
            $user->id,
            $credential->id,
            null,
            ['label' => $credential->label]
        );

        // Hard delete (fields cascade via FK)
        $credential->delete();

        return $this->successResponse(null, 'Credential deleted');
    }

    /**
     * POST /api/sites/{site}/credentials/{credential}/reveal
     * Reveal a sensitive field value.
     */
    public function reveal(Request $request, Site $site, SiteCredential $credential): JsonResponse
    {
        $user = $request->user();

        // MKT may reveal credentials to share with clients. Every reveal is
        // PIN-protected and audit-logged via VaultAuditService below.

        if (!$this->canAccessSite($user, $site)) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        if ($credential->site_id !== $site->id) {
            return $this->errorResponse('Credential not found.', 404);
        }

        $request->validate([
            'field_key' => 'required|string',
            'vault_pin' => 'required|string',
        ]);

        // Verify vault PIN
        $this->verifyPin($request);

        // Find the field
        $field = $credential->fields()
            ->where('field_key', $request->input('field_key'))
            ->first();

        if (!$field) {
            return $this->errorResponse('Field not found.', 404);
        }

        if (!$field->is_sensitive) {
            return $this->errorResponse('Field is not encrypted.', 400);
        }

        // Decrypt (handle empty/null values gracefully)
        $decrypted = '';
        if (!empty($field->field_value)) {
            $decrypted = $this->encryptionService->decrypt($field->field_value);
        }

        // Audit log: viewed
        $this->auditService->log(
            'viewed',
            $site->id,
            $user->id,
            $credential->id,
            $request->input('field_key')
        );

        // Telegram notification
        $siteName = $site->name ?? $site->domain ?? "Site #{$site->id}";
        TelegramNotificationService::notifyAdminChannel(
            "\xF0\x9F\x91\x81 {$user->name} revealed {$request->input('field_key')} on {$siteName}"
        );

        return response()->json([
            'value' => $decrypted,
            'expires_in' => 30,
        ], 200, [
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * POST /api/sites/{site}/credentials/{credential}/copy
     * Copy a sensitive field value.
     */
    public function copy(Request $request, Site $site, SiteCredential $credential): JsonResponse
    {
        $user = $request->user();

        // MKT may copy credentials (same workflow as reveal — PIN-gated and
        // audit-logged). Writes remain admin/dev-only.

        if (!$this->canAccessSite($user, $site)) {
            return $this->errorResponse('You do not have access to this site.', 403);
        }

        if ($credential->site_id !== $site->id) {
            return $this->errorResponse('Credential not found.', 404);
        }

        $request->validate([
            'field_key' => 'required|string',
            'vault_pin' => 'required|string',
        ]);

        // Verify vault PIN
        $this->verifyPin($request);

        // Find the field
        $field = $credential->fields()
            ->where('field_key', $request->input('field_key'))
            ->first();

        if (!$field) {
            return $this->errorResponse('Field not found.', 404);
        }

        if (!$field->is_sensitive) {
            return $this->errorResponse('Field is not encrypted.', 400);
        }

        // Decrypt (handle empty/null values gracefully)
        $decrypted = '';
        if (!empty($field->field_value)) {
            $decrypted = $this->encryptionService->decrypt($field->field_value);
        }

        // Audit log: copied
        $this->auditService->log(
            'copied',
            $site->id,
            $user->id,
            $credential->id,
            $request->input('field_key')
        );

        return response()->json([
            'value' => $decrypted,
        ], 200, [
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * Verify the user's vault PIN with lockout logic.
     */
    private function verifyPin(Request $request): void
    {
        $user = $request->user();
        $pin = $request->input('vault_pin');

        if (!$pin || !$user->vault_pin_hash) {
            abort(400, 'Vault PIN is not set up or not provided.');
        }

        $userId = $user->id;

        // Check lockout
        $lockout = Redis::get("vault_pin_lockout:{$userId}");
        if ($lockout) {
            abort(423, 'Vault locked for 15 minutes.');
        }

        if (!Hash::check($pin, $user->vault_pin_hash)) {
            // Increment attempts
            $attemptsKey = "vault_pin_attempts:{$userId}";
            $attempts = Redis::incr($attemptsKey);
            if ($attempts === 1) {
                Redis::expire($attemptsKey, 900);
            }
            if ($attempts >= 3) {
                Redis::setex("vault_pin_lockout:{$userId}", 900, now()->addMinutes(15)->toISOString());
                Redis::del($attemptsKey);
            }
            abort(401, 'Invalid PIN.');
        }

        // Clear attempts on success
        Redis::del("vault_pin_attempts:{$userId}");
    }

    /**
     * Check if a user can access a given site.
     */
    private function canAccessSite($user, Site $site): bool
    {
        if ($user->role === 'admin') {
            return true;
        }

        // For dev: check if assigned to the site via site_users pivot
        return $site->users()->where('users.id', $user->id)->exists();
    }

    /**
     * Format a credential for API response (sensitive values as null).
     */
    private function formatCredential(SiteCredential $credential): array
    {
        return [
            'id' => $credential->id,
            'credential_type' => $credential->credentialType ? [
                'id' => $credential->credentialType->id,
                'name' => $credential->credentialType->name,
                'slug' => $credential->credentialType->slug,
                'icon' => $credential->credentialType->icon,
            ] : null,
            'label' => $credential->label,
            'fields' => $credential->fields->map(fn($field) => [
                'id' => $field->id,
                'field_key' => $field->field_key,
                'field_label' => $field->field_label,
                'field_value' => $field->is_sensitive ? null : $field->field_value,
                'is_sensitive' => $field->is_sensitive,
            ])->values()->toArray(),
            'created_at' => $credential->created_at?->toISOString(),
            'updated_at' => $credential->updated_at?->toISOString(),
        ];
    }
}
