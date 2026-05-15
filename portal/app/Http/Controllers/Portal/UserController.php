<?php

namespace App\Http\Controllers\Portal;

use App\Http\Controllers\Controller;
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
}
