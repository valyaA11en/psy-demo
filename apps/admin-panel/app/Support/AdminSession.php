<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AdminSession
{
    private const SESSION_KEY = 'admin_panel.user_id';
    private const PENDING_2FA_USER_ID_KEY = 'admin_panel.pending_2fa.user_id';
    private const PENDING_2FA_STARTED_AT_KEY = 'admin_panel.pending_2fa.started_at';
    private const PENDING_2FA_SETUP_SECRET_KEY = 'admin_panel.pending_2fa.setup_secret';
    private const PENDING_2FA_SETUP_STARTED_AT_KEY = 'admin_panel.pending_2fa.setup_started_at';

    public function currentUser(Request $request): ?User
    {
        $userId = $request->session()->get(self::SESSION_KEY);

        if (! is_string($userId) || $userId === '') {
            return null;
        }

        $user = $this->loadAdminUser($userId);

        if (! $user || $user->status !== 'active' || ! $user->isAdmin()) {
            $this->logout($request);

            return null;
        }

        return $user;
    }

    public function pendingTwoFactorUser(Request $request): ?User
    {
        $userId = $request->session()->get(self::PENDING_2FA_USER_ID_KEY);

        if (! is_string($userId) || $userId === '') {
            return null;
        }

        $user = $this->loadAdminUser($userId);

        if (! $user || $user->status !== 'active' || ! $user->isAdmin()) {
            $this->clearPendingTwoFactorChallenge($request);

            return null;
        }

        return $user;
    }

    public function pendingTwoFactorStartedAt(Request $request): ?Carbon
    {
        $value = $request->session()->get(self::PENDING_2FA_STARTED_AT_KEY);

        if (! is_string($value) || $value === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            $this->clearPendingTwoFactorChallenge($request);

            return null;
        }
    }

    public function beginTwoFactorChallenge(Request $request, User $user): void
    {
        $request->session()->regenerate();
        $request->session()->forget(self::SESSION_KEY);
        $request->session()->put(self::PENDING_2FA_USER_ID_KEY, $user->id);
        $request->session()->put(self::PENDING_2FA_STARTED_AT_KEY, now()->toIso8601String());
    }

    public function completeTwoFactorChallenge(Request $request, User $user): void
    {
        $this->clearPendingTwoFactorChallenge($request);
        $this->login($request, $user);
    }

    public function clearPendingTwoFactorChallenge(Request $request): void
    {
        $request->session()->forget([
            self::PENDING_2FA_USER_ID_KEY,
            self::PENDING_2FA_STARTED_AT_KEY,
        ]);
    }

    public function login(Request $request, User $user): void
    {
        $request->session()->regenerate();
        $request->session()->put(self::SESSION_KEY, $user->id);
        $this->clearPendingTwoFactorChallenge($request);
        $this->clearPendingTwoFactorSetup($request);

        User::query()->whereKey($user->id)->update([
            'last_login_at' => now(),
        ]);
    }

    public function storePendingTwoFactorSetup(Request $request, string $secret): void
    {
        $request->session()->put(self::PENDING_2FA_SETUP_SECRET_KEY, $secret);
        $request->session()->put(self::PENDING_2FA_SETUP_STARTED_AT_KEY, now()->toIso8601String());
    }

    public function pendingTwoFactorSetupSecret(Request $request): ?string
    {
        $secret = $request->session()->get(self::PENDING_2FA_SETUP_SECRET_KEY);

        return is_string($secret) && $secret !== '' ? $secret : null;
    }

    public function clearPendingTwoFactorSetup(Request $request): void
    {
        $request->session()->forget([
            self::PENDING_2FA_SETUP_SECRET_KEY,
            self::PENDING_2FA_SETUP_STARTED_AT_KEY,
        ]);
    }

    public function logout(Request $request): void
    {
        $request->session()->forget([
            self::SESSION_KEY,
            self::PENDING_2FA_USER_ID_KEY,
            self::PENDING_2FA_STARTED_AT_KEY,
            self::PENDING_2FA_SETUP_SECRET_KEY,
            self::PENDING_2FA_SETUP_STARTED_AT_KEY,
        ]);
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }

    private function loadAdminUser(string $userId): ?User
    {
        return User::query()
            ->withAdminRelations()
            ->find($userId);
    }
}
