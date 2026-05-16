<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\CredentialShareLink;
use App\Models\CredentialType;
use App\Models\Site;
use App\Models\SiteCredential;
use App\Services\CredentialEncryptionService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class CredentialShareController extends Controller
{
    use ApiResponse;

    private CredentialEncryptionService $encryptionService;

    public function __construct(CredentialEncryptionService $encryptionService)
    {
        $this->encryptionService = $encryptionService;
    }

    /**
     * POST /api/sites/{site}/credentials/share
     * Create a new share link (admin only).
     */
    public function store(Request $request, Site $site): JsonResponse
    {
        $request->validate([
            'credential_type_ids' => 'required|array',
            'credential_type_ids.*' => 'integer|exists:credential_types,id',
            'expires_hours' => 'required|integer|in:12,24,48,168',
            'max_views' => 'required|integer|min:1|max:100',
            'share_password' => 'nullable|string|min:1',
        ]);

        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);

        $isPasswordProtected = !empty($request->share_password);
        $sharePasswordHash = $isPasswordProtected
            ? Hash::make($request->share_password)
            : null;

        $link = CredentialShareLink::create([
            'site_id' => $site->id,
            'token_hash' => $tokenHash,
            'credential_type_ids' => $request->credential_type_ids,
            'created_by' => $request->user()->id,
            'expires_at' => now()->addHours($request->expires_hours),
            'max_views' => $request->max_views,
            'view_count' => 0,
            'is_password_protected' => $isPasswordProtected,
            'share_password_hash' => $sharePasswordHash,
        ]);

        return $this->successResponse([
            'id' => $link->id,
            'share_url' => "/vault/share/{$token}",
            'token' => $token,
            'expires_at' => $link->expires_at->toISOString(),
            'max_views' => $link->max_views,
            'is_password_protected' => $link->is_password_protected,
        ], null, 201);
    }

    /**
     * GET /api/sites/{site}/credentials/share-links
     * List all share links for a site (admin only).
     */
    public function index(Request $request, Site $site): JsonResponse
    {
        $links = CredentialShareLink::where('site_id', $site->id)
            ->with('createdBy:id,name')
            ->orderByDesc('created_at')
            ->get();

        $data = $links->map(fn(CredentialShareLink $link) => [
            'id' => $link->id,
            'credential_type_ids' => $link->credential_type_ids,
            'created_by' => $link->createdBy?->name,
            'expires_at' => $link->expires_at?->toISOString(),
            'max_views' => $link->max_views,
            'view_count' => $link->view_count,
            'is_password_protected' => $link->is_password_protected,
            'last_accessed_at' => $link->last_accessed_at?->toISOString(),
            'last_accessed_ip' => $link->last_accessed_ip,
            'revoked_at' => $link->revoked_at?->toISOString(),
            'created_at' => $link->created_at?->toISOString(),
        ]);

        return $this->successResponse($data);
    }

    /**
     * DELETE /api/sites/{site}/credentials/share-links/{link}
     * Revoke a share link (admin only).
     */
    public function destroy(Request $request, Site $site, CredentialShareLink $link): JsonResponse
    {
        if ($link->site_id !== $site->id) {
            return $this->errorResponse('Share link not found.', 404);
        }

        $link->update([
            'revoked_at' => now(),
            'revoked_by' => $request->user()->id,
        ]);

        return response()->json(['message' => 'Share link revoked'], 200);
    }

    /**
     * GET /api/vault/share/{token}
     * Public: Check share link status.
     */
    public function show(string $token): JsonResponse
    {
        $link = $this->findValidLink($token);

        if (!$link) {
            return response()->json(['error' => 'This link has expired or is invalid'], 404);
        }

        $site = $link->site;
        $typeNames = CredentialType::whereIn('id', $link->credential_type_ids)
            ->pluck('name')
            ->toArray();

        return response()->json([
            'data' => [
                'requires_password' => $link->is_password_protected,
                'site_name' => $site->name,
                'credential_types' => $typeNames,
            ],
        ]);
    }

    /**
     * POST /api/vault/share/{token}/access
     * Public: Access credentials via share link.
     */
    public function access(Request $request, string $token): JsonResponse
    {
        $link = $this->findValidLink($token);

        if (!$link) {
            return response()->json(['error' => 'This link has expired or is invalid'], 404);
        }

        // Password check
        if ($link->is_password_protected) {
            $password = $request->input('password', '');
            if (!$password || !Hash::check($password, $link->share_password_hash)) {
                return response()->json(['error' => 'Invalid password'], 401);
            }
        }

        // Fetch credentials for the allowed types
        $credentials = SiteCredential::where('site_id', $link->site_id)
            ->whereIn('credential_type_id', $link->credential_type_ids)
            ->with(['credentialType', 'fields'])
            ->get();

        $credentialData = $credentials->map(function (SiteCredential $credential) {
            $fields = $credential->fields->map(function ($field) {
                $value = $field->field_value;
                if ($field->is_sensitive && $value) {
                    try {
                        $value = $this->encryptionService->decrypt($value);
                    } catch (\Exception $e) {
                        $value = '[decryption error]';
                    }
                }
                return [
                    'field_key' => $field->field_key,
                    'field_label' => $field->field_label,
                    'value' => $value,
                ];
            })->toArray();

            return [
                'type' => $credential->credentialType?->name,
                'label' => $credential->label,
                'fields' => $fields,
            ];
        })->toArray();

        // Update access tracking
        $link->increment('view_count');
        $link->update([
            'last_accessed_at' => now(),
            'last_accessed_ip' => $request->ip(),
        ]);

        $viewsRemaining = max(0, $link->max_views - $link->view_count);

        return response()->json([
            'data' => [
                'site_name' => $link->site->name,
                'credentials' => $credentialData,
                'views_remaining' => $viewsRemaining,
                'expires_at' => $link->expires_at->toISOString(),
            ],
        ], 200, [
            'Cache-Control' => 'no-store',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * Find a valid (not revoked, not expired, views remaining) share link by token.
     */
    private function findValidLink(string $token): ?CredentialShareLink
    {
        $tokenHash = hash('sha256', $token);

        return CredentialShareLink::where('token_hash', $tokenHash)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->whereColumn('view_count', '<', 'max_views')
            ->first();
    }
}
