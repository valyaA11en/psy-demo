@extends('layouts.admin', ['title' => 'Безопасность'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">безопасность админ-аккаунта</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Двухфакторная аутентификация</h1>
            </div>
        </div>

        <div class="two-col">
            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Текущее состояние</h2>
                <div class="panel soft" style="padding: 14px;">
                    <div class="small">Аккаунт: {{ $admin->email }}</div>
                    <div class="small">2FA: {{ $isEnabled ? 'включена' : 'выключена' }}</div>
                    @if ($isEnabled)
                        <div class="small">Последняя конфигурация активна и будет запрашиваться при каждом входе.</div>
                    @else
                        <div class="small">Рекомендуется включить TOTP для защиты backoffice и audit-sensitive операций.</div>
                    @endif
                </div>

                @if (session('admin_2fa_recovery_codes'))
                    <div class="panel soft" style="padding: 14px; margin-top: 16px;">
                        <strong>Recovery codes</strong>
                        <p class="small" style="margin-top: 8px;">Показываются один раз после включения 2FA. Сохраните их офлайн.</p>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 12px;">
                            @foreach (session('admin_2fa_recovery_codes') as $code)
                                <div class="panel" style="padding: 12px; text-align: center;"><strong>{{ $code }}</strong></div>
                            @endforeach
                        </div>
                    </div>
                @endif
            </section>

            <section class="panel soft" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Рекомендации</h2>
                <ul style="margin: 0; padding-left: 18px; line-height: 1.8; color: #5f6b7a;">
                    <li>Подключайте приложение-аутентификатор локально, без внешних QR-сервисов.</li>
                    <li>Recovery codes храните отдельно от основного устройства.</li>
                    <li>При компрометации recovery codes отключите и включите 2FA заново.</li>
                </ul>
            </section>
        </div>

        @if (! $isEnabled)
            <div class="two-col">
                <section class="panel" style="padding: 20px;">
                    <h2 style="margin: 0 0 14px;">Шаг 1. Сгенерировать секрет</h2>

                    <form action="{{ route('admin.security.2fa.setup') }}" method="post">
                        @csrf
                        <button class="button primary" type="submit">{{ $setupSecret ? 'Сгенерировать заново' : 'Сгенерировать секрет' }}</button>
                    </form>

                    @if ($setupSecret)
                        <div class="panel soft" style="padding: 14px; margin-top: 16px;">
                            <strong>Manual entry secret</strong>
                            <div class="small" style="margin-top: 8px;">{{ $setupSecretDisplay }}</div>
                            <div class="field" style="margin-top: 12px;">
                                <label for="otpauth_uri">OTPAuth URI</label>
                                <textarea id="otpauth_uri" readonly>{{ $otpauthUri }}</textarea>
                            </div>
                        </div>
                    @endif
                </section>

                <section class="panel" style="padding: 20px;">
                    <h2 style="margin: 0 0 14px;">Шаг 2. Подтвердить и включить</h2>

                    <form class="stack" action="{{ route('admin.security.2fa.enable') }}" method="post">
                        @csrf
                        <div class="field">
                            <label for="current_password">Текущий пароль</label>
                            <input id="current_password" name="current_password" type="password" required>
                        </div>
                        <div class="field">
                            <label for="code">TOTP-код</label>
                            <input id="code" name="code" type="text" inputmode="numeric" placeholder="123456" required>
                        </div>
                        <div class="inline-actions">
                            <button class="button primary" type="submit">Включить 2FA</button>
                        </div>
                    </form>
                </section>
            </div>
        @else
            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Отключить 2FA</h2>
                <p class="small">Для отключения подтвердите действие текущим паролем и TOTP-кодом или recovery code.</p>

                <form class="stack" action="{{ route('admin.security.2fa.disable') }}" method="post" style="margin-top: 16px;">
                    @csrf
                    <div class="field">
                        <label for="disable_current_password">Текущий пароль</label>
                        <input id="disable_current_password" name="current_password" type="password" required>
                    </div>
                    <div class="field">
                        <label for="disable_code">TOTP-код</label>
                        <input id="disable_code" name="code" type="text" inputmode="numeric" placeholder="123456">
                    </div>
                    <div class="field">
                        <label for="disable_recovery_code">Recovery code</label>
                        <input id="disable_recovery_code" name="recovery_code" type="text" placeholder="ABCD-EFGH">
                    </div>
                    <div class="inline-actions">
                        <button class="button danger" type="submit">Отключить 2FA</button>
                    </div>
                </form>
            </section>
        @endif
    </section>
@endsection
