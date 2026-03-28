<?php

namespace App\Http\Controllers;

use App\Models\UserTwoFactorCredential;
use App\Support\AdminAuditLogger;
use App\Support\AdminSession;
use App\Support\AdminTwoFactorService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

class AdminTwoFactorController extends Controller
{
    private const CHALLENGE_TTL_SECONDS = 600;

    public function __construct(
        private readonly AdminSession $adminSession,
        private readonly AdminTwoFactorService $twoFactorService,
        private readonly AdminAuditLogger $auditLogger,
    ) {
    }

    public function challenge(Request $request): View|RedirectResponse
    {
        $user = $this->adminSession->pendingTwoFactorUser($request);

        if (! $user) {
            return redirect()->route('login');
        }

        if ($this->challengeExpired($request)) {
            $this->adminSession->clearPendingTwoFactorChallenge($request);

            return redirect()
                ->route('login')
                ->with('error', 'Срок действия 2FA challenge истёк. Войдите заново.');
        }

        return view('auth.two-factor-challenge', [
            'email' => $user->email,
        ]);
    }

    public function verifyChallenge(Request $request): RedirectResponse
    {
        $payload = $request->validate([
            'code' => ['nullable', 'string', 'max:32'],
            'recovery_code' => ['nullable', 'string', 'max:32'],
        ]);

        if (blank($payload['code'] ?? null) && blank($payload['recovery_code'] ?? null)) {
            return back()->withErrors([
                'code' => 'Введите TOTP-код или recovery code.',
            ]);
        }

        $user = $this->adminSession->pendingTwoFactorUser($request);

        if (! $user) {
            return redirect()->route('login');
        }

        if ($this->challengeExpired($request)) {
            $this->adminSession->clearPendingTwoFactorChallenge($request);

            return redirect()
                ->route('login')
                ->with('error', 'Срок действия 2FA challenge истёк. Войдите заново.');
        }

        if (! $user->isTwoFactorProtected()) {
            $this->adminSession->completeTwoFactorChallenge($request, $user);

            return redirect()->route('admin.dashboard');
        }

        $credential = $user->twoFactorCredential;

        if (! $credential) {
            return redirect()->route('login');
        }

        $usedRecoveryCode = false;
        $verified = false;

        if (filled($payload['code'] ?? null)) {
            $verified = $this->twoFactorService->verifyTotp(
                $this->twoFactorService->decryptSecret($credential->totp_secret_encrypted),
                (string) $payload['code'],
            );
        } elseif (filled($payload['recovery_code'] ?? null)) {
            $verified = $this->consumeRecoveryCode($credential, (string) $payload['recovery_code']);
            $usedRecoveryCode = $verified;
        }

        if (! $verified) {
            return back()->withErrors([
                'code' => 'Неверный код подтверждения.',
            ]);
        }

        $this->adminSession->completeTwoFactorChallenge($request, $user);

        $this->auditLogger->log(
            $user,
            'admin.auth.2fa_challenge_completed',
            'user',
            $user->id,
            [
                'used_recovery_code' => $usedRecoveryCode,
            ],
            $request,
        );

        $this->auditLogger->log(
            $user,
            'admin.auth.login',
            'user',
            $user->id,
            ['roles' => $user->roles->pluck('code')->all()],
            $request,
        );

        return redirect()
            ->route('admin.dashboard')
            ->with('success', $usedRecoveryCode
                ? 'Вход подтверждён через recovery code.'
                : 'Вход подтверждён.');
    }

    public function security(Request $request): View
    {
        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $setupSecret = $this->adminSession->pendingTwoFactorSetupSecret($request);

        return view('security.two-factor', [
            'admin' => $admin,
            'isEnabled' => $admin->isTwoFactorProtected(),
            'setupSecret' => $setupSecret,
            'setupSecretDisplay' => $setupSecret ? $this->twoFactorService->formatSecretForDisplay($setupSecret) : null,
            'otpauthUri' => $setupSecret ? $this->twoFactorService->buildOtpAuthUri($admin, $setupSecret) : null,
        ]);
    }

    public function beginSetup(Request $request): RedirectResponse
    {
        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $secret = $this->twoFactorService->generateSecret();
        $this->adminSession->storePendingTwoFactorSetup($request, $secret);

        $this->auditLogger->log(
            $admin,
            'admin.auth.2fa_setup_started',
            'user',
            $admin->id,
            [],
            $request,
        );

        return back()->with('success', 'Секрет для подключения 2FA сгенерирован.');
    }

    public function enable(Request $request): RedirectResponse
    {
        $payload = $request->validate([
            'current_password' => ['required', 'string'],
            'code' => ['required', 'string', 'max:32'],
        ]);

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $secret = $this->adminSession->pendingTwoFactorSetupSecret($request);

        if (! $secret) {
            return back()->with('error', 'Сначала сгенерируйте секрет для 2FA.');
        }

        if (! Hash::check($payload['current_password'], $admin->password_hash)) {
            return back()->withErrors([
                'current_password' => 'Неверный текущий пароль.',
            ]);
        }

        if (! $this->twoFactorService->verifyTotp($secret, $payload['code'])) {
            return back()->withErrors([
                'code' => 'Неверный TOTP-код.',
            ]);
        }

        $recoveryCodes = $this->twoFactorService->generateRecoveryCodes();

        UserTwoFactorCredential::query()->updateOrCreate(
            ['user_id' => $admin->id],
            [
                'totp_secret_encrypted' => $this->twoFactorService->encryptSecret($secret),
                'recovery_codes_json' => array_map(
                    fn (string $code) => $this->twoFactorService->hashRecoveryCode($code),
                    $recoveryCodes,
                ),
                'enabled_at' => now(),
            ],
        );

        $admin->forceFill([
            'is_2fa_enabled' => true,
        ])->save();

        $this->adminSession->clearPendingTwoFactorSetup($request);

        $this->auditLogger->log(
            $admin,
            'admin.auth.2fa_enabled',
            'user',
            $admin->id,
            ['recovery_codes_count' => count($recoveryCodes)],
            $request,
        );

        return redirect()
            ->route('admin.security.2fa')
            ->with('success', '2FA включена. Сохраните recovery codes в безопасном месте.')
            ->with('admin_2fa_recovery_codes', $recoveryCodes);
    }

    public function disable(Request $request): RedirectResponse
    {
        $payload = $request->validate([
            'current_password' => ['required', 'string'],
            'code' => ['nullable', 'string', 'max:32'],
            'recovery_code' => ['nullable', 'string', 'max:32'],
        ]);

        if (blank($payload['code'] ?? null) && blank($payload['recovery_code'] ?? null)) {
            return back()->withErrors([
                'code' => 'Введите TOTP-код или recovery code для отключения 2FA.',
            ]);
        }

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        if (! Hash::check($payload['current_password'], $admin->password_hash)) {
            return back()->withErrors([
                'current_password' => 'Неверный текущий пароль.',
            ]);
        }

        $credential = $admin->twoFactorCredential;

        if (! $admin->isTwoFactorProtected() || ! $credential) {
            return back()->with('error', '2FA уже отключена.');
        }

        $verified = false;

        if (filled($payload['code'] ?? null)) {
            $verified = $this->twoFactorService->verifyTotp(
                $this->twoFactorService->decryptSecret($credential->totp_secret_encrypted),
                (string) $payload['code'],
            );
        } elseif (filled($payload['recovery_code'] ?? null)) {
            $verified = $this->consumeRecoveryCode($credential, (string) $payload['recovery_code']);
        }

        if (! $verified) {
            return back()->withErrors([
                'code' => 'Неверный код подтверждения.',
            ]);
        }

        $credential->delete();
        $admin->forceFill([
            'is_2fa_enabled' => false,
        ])->save();

        $this->adminSession->clearPendingTwoFactorSetup($request);

        $this->auditLogger->log(
            $admin,
            'admin.auth.2fa_disabled',
            'user',
            $admin->id,
            [],
            $request,
        );

        return redirect()
            ->route('admin.security.2fa')
            ->with('success', '2FA отключена.');
    }

    private function challengeExpired(Request $request): bool
    {
        $startedAt = $this->adminSession->pendingTwoFactorStartedAt($request);

        return ! $startedAt || $startedAt->diffInSeconds(now()) > self::CHALLENGE_TTL_SECONDS;
    }

    private function consumeRecoveryCode(UserTwoFactorCredential $credential, string $code): bool
    {
        $hash = $this->twoFactorService->hashRecoveryCode($code);
        $recoveryCodes = $credential->recovery_codes_json ?? [];
        $matchedIndex = null;

        foreach ($recoveryCodes as $index => $candidate) {
            if (is_string($candidate) && hash_equals($candidate, $hash)) {
                $matchedIndex = $index;
                break;
            }
        }

        if ($matchedIndex === null) {
            return false;
        }

        unset($recoveryCodes[$matchedIndex]);
        $credential->recovery_codes_json = array_values($recoveryCodes);
        $credential->save();

        return true;
    }
}
