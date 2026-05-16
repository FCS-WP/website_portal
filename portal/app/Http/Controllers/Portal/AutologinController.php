<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\AutologinToken;
use App\Models\CredentialType;
use App\Models\Site;
use App\Models\SiteCredential;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AutologinController extends Controller
{
    use ApiResponse;

    /**
     * POST /api/sites/{site}/autologin
     *
     * Generate a one-time autologin JWT for quick WP Admin access.
     */
    public function create(Request $request, Site $site): JsonResponse
    {
        $user = $request->user();

        // Build JWT
        $header = $this->base64urlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = $this->base64urlEncode(json_encode([
            'site_id' => $site->id,
            'user_id' => $user->id,
            'iat' => time(),
            'exp' => time() + 60, // 60 seconds
        ]));
        $signature = $this->base64urlEncode(
            hash_hmac('sha256', "$header.$payload", config('app.key'), true)
        );
        $jwt = "$header.$payload.$signature";

        // Store hashed token
        AutologinToken::create([
            'site_id' => $site->id,
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $jwt),
            'expires_at' => now()->addSeconds(60),
        ]);

        $redirectUrl = rtrim($site->url, '/') . '/wp-json/epos-agent/v1/autologin?token=' . $jwt;

        return $this->successResponse([
            'redirect_url' => $redirectUrl,
        ]);
    }

    /**
     * POST /api/agent/verify-login-token
     *
     * Called by WP Agent to verify a JWT autologin token.
     */
    public function verifyToken(Request $request): JsonResponse
    {
        $request->validate([
            'token' => 'required|string',
        ]);

        $token = $request->input('token');

        // 1. Decode and verify JWT structure
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return response()->json(['valid' => false, 'error' => 'Invalid token format.'], 200);
        }

        [$header, $payload, $signature] = $parts;

        // 2. Verify signature
        $expectedSignature = $this->base64urlEncode(
            hash_hmac('sha256', "$header.$payload", config('app.key'), true)
        );

        if (!hash_equals($expectedSignature, $signature)) {
            return response()->json(['valid' => false, 'error' => 'Invalid token signature.'], 200);
        }

        // 3. Decode and check payload
        $payloadData = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);

        if (!$payloadData || !isset($payloadData['exp'])) {
            return response()->json(['valid' => false, 'error' => 'Invalid token payload.'], 200);
        }

        if ($payloadData['exp'] < time()) {
            return response()->json(['valid' => false, 'error' => 'Token has expired.'], 200);
        }

        // 4. Find unused token record
        $tokenHash = hash('sha256', $token);
        $autologinToken = AutologinToken::valid()
            ->where('token_hash', $tokenHash)
            ->first();

        if (!$autologinToken) {
            return response()->json(['valid' => false, 'error' => 'Token not found or already used.'], 200);
        }

        // 5. Mark as used
        $autologinToken->update(['used_at' => now()]);

        // 6. Determine WP username from site credentials
        $wpUsername = $this->resolveWpUsername($autologinToken->site_id);

        return response()->json([
            'valid' => true,
            'wp_username' => $wpUsername,
        ]);
    }

    /**
     * Look up the WordPress username from the site's credentials.
     * Falls back to 'admin' if not found.
     */
    private function resolveWpUsername(int $siteId): string
    {
        $wordpressType = CredentialType::where('slug', 'wordpress')->first();

        if (!$wordpressType) {
            return 'admin';
        }

        $credential = SiteCredential::where('site_id', $siteId)
            ->where('credential_type_id', $wordpressType->id)
            ->first();

        if (!$credential) {
            return 'admin';
        }

        $usernameField = $credential->fields()
            ->where('field_key', 'username')
            ->first();

        if (!$usernameField || empty($usernameField->field_value)) {
            return 'admin';
        }

        return $usernameField->field_value;
    }

    /**
     * Base64url encode (RFC 7515).
     */
    private function base64urlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
