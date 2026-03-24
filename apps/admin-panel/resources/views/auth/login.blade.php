@extends('layouts.admin', ['title' => 'Вход в админ-панель'])

@section('content')
    <section class="panel auth-card" style="display: flex; flex-direction: column; gap: 20px;">
        <div>
            <p class="small">приватный backoffice</p>
            <h1 style="margin: 8px 0 0; font-size: 2rem;">Вход администратора</h1>
            <p class="small" style="margin-top: 10px;">Доступ открыт только активным пользователям с ролью admin или superadmin.</p>
        </div>

        <form action="{{ route('login.store') }}" method="post" style="display: flex; flex-direction: column; gap: 16px;">
            @csrf
            <div class="field">
                <label for="email">Email</label>
                <input id="email" name="email" type="email" value="{{ old('email') }}" required>
            </div>
            <div class="field">
                <label for="password">Пароль</label>
                <input id="password" name="password" type="password" required>
            </div>
            <button class="button primary" type="submit">Войти</button>
        </form>

        <div class="panel soft" style="padding: 16px;">
            <p class="small">Демо-аккаунт администратора</p>
            <strong>admin@example.com / Admin12345!</strong>
        </div>
    </section>
@endsection
