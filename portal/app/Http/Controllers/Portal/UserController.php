<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
use App\Models\Site;
use App\Models\User;
use App\Traits\ApiResponse;
use App\Http\Requests\User\StoreUserRequest;
use App\Http\Requests\User\UpdateUserRequest;
use App\Services\ActivityLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/users
     */
    public function index()
    {
        $users = User::select(['id', 'name', 'email', 'role', 'telegram_chat_id', 'is_active', 'created_at', 'updated_at'])
            ->orderBy('created_at', 'desc')
            ->get();

        return $this->successResponse($users);
    }

    /**
     * POST /api/users
     */
    public function store(StoreUserRequest $request)
    {
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role,
            'is_active' => $request->input('is_active', true),
            'telegram_chat_id' => $request->telegram_chat_id,
        ]);

        // Assign Spatie role
        $user->assignRole($request->role);

        // Open-by-default policy: dev/mkt members see every site. Attach
        // the new user to every existing site so they don't miss content
        // that was created before their account existed.
        self::attachUserToAllSitesIfApplicable($user);

        ActivityLogService::log(
            'user.created',
            $user,
            $request->user(),
            $request->ip(),
            ['role' => $request->role]
        );

        return $this->successResponse([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'telegram_chat_id' => $user->telegram_chat_id,
            'is_active' => $user->is_active,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ], 'User created successfully.', 201);
    }

    /**
     * PUT /api/users/{user}
     */
    public function update(UpdateUserRequest $request, User $user)
    {
        $oldRole = $user->role;
        $wasInactive = !$user->is_active;

        $data = $request->only(['name', 'email', 'role', 'is_active', 'telegram_chat_id']);

        if ($request->has('password') && $request->password) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);

        // Update Spatie role if role changed
        if ($request->has('role') && $request->role !== $oldRole) {
            $user->syncRoles([$request->role]);

            ActivityLogService::log(
                'user.role_changed',
                $user,
                $request->user(),
                $request->ip(),
                ['old_role' => $oldRole, 'new_role' => $request->role]
            );
        }

        // Re-apply the open-by-default policy if either:
        //   - the user just transitioned to dev/mkt from another role, or
        //   - the user was reactivated after being disabled.
        // Both events can leave the user missing from sites created during
        // the gap. attachUserToAllSitesIfApplicable() is idempotent.
        $roleChangedToDevOrMkt = $request->has('role')
            && $request->role !== $oldRole
            && in_array($request->role, ['dev', 'mkt'], true);
        $justReactivated = $wasInactive && $user->fresh()->is_active;

        if ($roleChangedToDevOrMkt || $justReactivated) {
            self::attachUserToAllSitesIfApplicable($user->fresh());
        }

        ActivityLogService::log(
            'user.updated',
            $user,
            $request->user(),
            $request->ip()
        );

        return $this->successResponse([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'telegram_chat_id' => $user->telegram_chat_id,
            'is_active' => $user->is_active,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ], 'User updated successfully.');
    }

    /**
     * DELETE /api/users/{user}
     */
    public function destroy(Request $request, User $user)
    {
        // Prevent admin from deleting themselves
        if ($user->id === $request->user()->id) {
            return $this->errorResponse('You cannot delete your own account.', 400);
        }

        ActivityLogService::log(
            'user.deleted',
            $user,
            $request->user(),
            $request->ip(),
            ['deleted_user_email' => $user->email]
        );

        $user->delete();

        return $this->successResponse(null, 'User deleted successfully.');
    }

    /**
     * Open-by-default site visibility for the dev/mkt teams.
     *
     * Attaches the given user to every site that exists, but only when the
     * user is an active dev/mkt member. Idempotent — uses
     * syncWithoutDetaching so previously-assigned sites aren't disturbed
     * and we don't fight an admin who explicitly curated assignments.
     * Admins are skipped (they already see everything via the
     * Site::accessibleBy scope).
     */
    private static function attachUserToAllSitesIfApplicable(User $user): void
    {
        if (!$user->is_active || !in_array($user->role, ['dev', 'mkt'], true)) {
            return;
        }

        $siteIds = Site::query()->pluck('id')->all();
        if (empty($siteIds)) {
            return;
        }

        // Reach back through Site::users() since User doesn't expose the
        // inverse relation in this codebase. Group into one attach per site
        // for transactional cleanliness on Postgres.
        Site::whereIn('id', $siteIds)
            ->get()
            ->each(fn (Site $s) => $s->users()->syncWithoutDetaching([$user->id]));
    }
}
