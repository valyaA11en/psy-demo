<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

class AdminSession
{
    private const SESSION_KEY = 'admin_panel.user_id';

    public function currentUser(Request $request): ?User
    {
        $userId = $request->session()->get(self::SESSION_KEY);

        if (! is_string($userId) || $userId === '') {
            return null;
        }

        $user = User::query()
            ->withAdminRelations()
            ->find($userId);

        if (! $user || $user->status !== 'active' || ! $user->isAdmin()) {
            $this->logout($request);

            return null;
        }

        return $user;
    }

    public function login(Request $request, User $user): void
    {
        $request->session()->regenerate();
        $request->session()->put(self::SESSION_KEY, $user->id);
    }

    public function logout(Request $request): void
    {
        $request->session()->forget(self::SESSION_KEY);
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
