<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\AdminAuditLogger;
use App\Support\AdminSession;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

class AdminAuthController extends Controller
{
    public function __construct(
        private readonly AdminSession $adminSession,
        private readonly AdminAuditLogger $auditLogger,
    ) {
    }

    public function create(): View
    {
        return view('auth.login');
    }

    public function store(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()
            ->withAdminRelations()
            ->where('email', strtolower($credentials['email']))
            ->first();

        if (
            ! $user ||
            $user->status !== 'active' ||
            ! $user->isAdmin() ||
            ! Hash::check($credentials['password'], $user->password_hash)
        ) {
            return back()
                ->withInput($request->only('email'))
                ->withErrors([
                    'email' => 'Неверные учётные данные администратора.',
                ]);
        }

        if ($user->isTwoFactorProtected()) {
            $this->adminSession->beginTwoFactorChallenge($request, $user);

            $this->auditLogger->log(
                $user,
                'admin.auth.login_challenge_started',
                'user',
                $user->id,
                ['roles' => $user->roles->pluck('code')->all()],
                $request,
            );

            return redirect()->route('admin.2fa.challenge');
        }

        $this->adminSession->login($request, $user);
        $this->auditLogger->log(
            $user,
            'admin.auth.login',
            'user',
            $user->id,
            ['roles' => $user->roles->pluck('code')->all()],
            $request,
        );

        return redirect()->route('admin.dashboard');
    }

    public function destroy(Request $request): RedirectResponse
    {
        $admin = $this->admin($request);

        if ($admin) {
            $this->auditLogger->log(
                $admin,
                'admin.auth.logout',
                'user',
                $admin->id,
                [],
                $request,
            );
        }

        $this->adminSession->logout($request);

        return redirect()->route('login');
    }
}
