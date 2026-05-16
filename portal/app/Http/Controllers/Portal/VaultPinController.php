<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Services\TelegramNotificationService;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Redis;

class VaultPinController extends Controller
{
    use ApiResponse;

    /**
     * POST /api/auth/vault-pin/setup
     * Set up a new Vault PIN (only if not already set).
     */
    public function setup(Request $request)
    {
        $request->validate([
            'pin' => 'required|string|size:6|regex:/^\d{6}$/|confirmed',
        ], [
            'pin.regex' => 'The PIN must contain only digits.',
        ]);

        $user = $request->user();

        if (!is_null($user->vault_pin_hash)) {
            return $this->errorResponse('Vault PIN is already set up.', 409);
        }

        $user->vault_pin_hash = Hash::make($request->pin, ['rounds' => 12]);
        $user->save();

        return $this->successResponse(null, 'Vault PIN set up successfully');
    }

    /**
     * POST /api/auth/vault-pin/change
     * Change an existing Vault PIN.
     */
    public function change(Request $request)
    {
        $request->validate([
            'current_pin' => 'required|string',
            'new_pin' => 'required|string|size:6|regex:/^\d{6}$/|confirmed',
        ], [
            'new_pin.regex' => 'The PIN must contain only digits.',
        ]);

        $user = $request->user();

        if (is_null($user->vault_pin_hash)) {
            return $this->errorResponse('Vault PIN is not set up yet.', 400);
        }

        // Check lockout
        $lockoutResponse = $this->checkLockout($user);
        if ($lockoutResponse) {
            return $lockoutResponse;
        }

        // Verify current PIN
        if (!Hash::check($request->current_pin, $user->vault_pin_hash)) {
            return $this->handleFailedAttempt($user, $request);
        }

        // Clear attempts on successful verification
        Redis::del("vault_pin_attempts:{$user->id}");

        // Hash and save new PIN
        $user->vault_pin_hash = Hash::make($request->new_pin, ['rounds' => 12]);
        $user->save();

        return $this->successResponse(null, 'Vault PIN changed successfully');
    }

    /**
     * POST /api/auth/vault-pin/verify
     * Verify the Vault PIN.
     */
    public function verify(Request $request)
    {
        $request->validate([
            'pin' => 'required|string',
        ]);

        $user = $request->user();

        if (is_null($user->vault_pin_hash)) {
            return $this->errorResponse('Vault PIN is not set up yet.', 400);
        }

        // Check lockout
        $lockoutResponse = $this->checkLockout($user);
        if ($lockoutResponse) {
            return $lockoutResponse;
        }

        // Verify PIN
        if (!Hash::check($request->pin, $user->vault_pin_hash)) {
            return $this->handleFailedAttempt($user, $request);
        }

        // Success - clear attempts
        Redis::del("vault_pin_attempts:{$user->id}");

        return $this->successResponse(['verified' => true]);
    }

    /**
     * Check if the user is currently locked out.
     */
    private function checkLockout($user)
    {
        $lockout = Redis::get("vault_pin_lockout:{$user->id}");

        if ($lockout) {
            return response()->json([
                'success' => false,
                'message' => 'Vault locked for 15 minutes',
                'locked_until' => $lockout,
            ], 423);
        }

        return null;
    }

    /**
     * Handle a failed PIN attempt with lockout logic.
     */
    private function handleFailedAttempt($user, Request $request)
    {
        $attemptsKey = "vault_pin_attempts:{$user->id}";

        $attempts = Redis::incr($attemptsKey);
        if ($attempts === 1) {
            Redis::expire($attemptsKey, 900);
        }

        if ($attempts >= 3) {
            // Set lockout
            $lockedUntil = now()->addMinutes(15)->toISOString();
            Redis::setex("vault_pin_lockout:{$user->id}", 900, $lockedUntil);

            // Send Telegram notification
            $this->sendLockoutNotification($user, $request);

            return response()->json([
                'success' => false,
                'message' => 'Vault locked for 15 minutes',
                'locked_until' => $lockedUntil,
            ], 423);
        }

        return response()->json([
            'success' => false,
            'message' => 'Invalid PIN',
            'attempts_remaining' => 3 - $attempts,
        ], 401);
    }

    /**
     * Send a Telegram notification when vault is locked out.
     */
    private function sendLockoutNotification($user, Request $request)
    {
        $ip = $request->ip();
        $message = "🔒 Vault PIN locked for user {$user->name} ({$user->email}) after 3 failed attempts. IP: {$ip}";

        TelegramNotificationService::notifyAdminChannel($message);
    }
}
