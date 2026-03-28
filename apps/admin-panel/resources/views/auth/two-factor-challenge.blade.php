@extends('layouts.admin', ['title' => 'Подтверждение 2FA'])

@section('content')
    <section class="panel auth-card" style="display: flex; flex-direction: column; gap: 20px;">
        <div>
            <p class="small">второй фактор</p>
            <h1 style="margin: 8px 0 0; font-size: 2rem;">Подтвердите вход</h1>
            <p class="small" style="margin-top: 10px;">Для аккаунта <strong>{{ $email }}</strong> включена 2FA. Введите код из приложения-аутентификатора или один из recovery codes.</p>
        </div>

        <form action="{{ route('admin.2fa.verify') }}" method="post" style="display: flex; flex-direction: column; gap: 16px;">
            @csrf
            <div class="field">
                <label for="code">TOTP-код</label>
                <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
            </div>
            <div class="field">
                <label for="recovery_code">Recovery code</label>
                <input id="recovery_code" name="recovery_code" type="text" placeholder="ABCD-EFGH">
            </div>
            <button class="button primary" type="submit">Подтвердить</button>
        </form>

        <p class="small">Используйте только один вариант подтверждения за раз. Challenge живёт ограниченное время.</p>
    </section>
@endsection
