@php
    $statusLabels = [
        'pending' => 'ожидает',
        'active' => 'активен',
        'blocked' => 'заблокирован',
        'deleted' => 'удалён',
    ];
    $roleLabels = [
        'client' => 'клиент',
        'psychologist' => 'психолог',
        'admin' => 'администратор',
        'superadmin' => 'суперадмин',
    ];
@endphp

@extends('layouts.admin', ['title' => 'Пользователи'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">управление пользователями</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Пользователи</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar">
                <div class="field">
                    <label for="q">Поиск</label>
                    <input id="q" name="q" type="text" value="{{ $filters['q'] ?? '' }}" placeholder="email или публичный профиль">
                </div>
                <div class="field">
                    <label for="status">Статус</label>
                    <select id="status" name="status">
                        <option value="">Все</option>
                        @foreach (['pending', 'active', 'blocked', 'deleted'] as $status)
                            <option value="{{ $status }}" @selected(($filters['status'] ?? '') === $status)>{{ $statusLabels[$status] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="role">Роль</label>
                    <select id="role" name="role">
                        <option value="">Все</option>
                        @foreach (['client', 'psychologist', 'admin', 'superadmin'] as $role)
                            <option value="{{ $role }}" @selected(($filters['role'] ?? '') === $role)>{{ $roleLabels[$role] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.users.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <section class="panel">
            <div class="table-wrap">
                <table>
                    <thead>
                    <tr><th>Пользователь</th><th>Роли</th><th>Статус</th><th>Последний вход</th><th>Действия</th></tr>
                    </thead>
                    <tbody>
                    @forelse ($users as $user)
                        @php
                            $statusTone = match($user->status) {
                                'active' => 'success',
                                'blocked' => 'danger',
                                'pending' => 'warn',
                                default => '',
                            };
                        @endphp
                        <tr>
                            <td>
                                <strong>{{ $user->displayName() }}</strong>
                                <div class="small">{{ $user->email }}</div>
                            </td>
                            <td>{{ $user->roles->pluck('code')->map(fn ($code) => $roleLabels[$code] ?? $code)->join(', ') }}</td>
                            <td><span class="badge {{ $statusTone }}">{{ $statusLabels[$user->status] ?? $user->status }}</span></td>
                            <td>{{ optional($user->last_login_at)->format('d.m.Y H:i') ?? 'никогда' }}</td>
                            <td>
                                <div class="inline-actions">
                                    <form action="{{ route('admin.users.status', $user) }}" method="post">
                                        @csrf
                                        @method('PATCH')
                                        <input name="status" type="hidden" value="active">
                                        <button class="button" type="submit">Активировать</button>
                                    </form>
                                    <form action="{{ route('admin.users.status', $user) }}" method="post">
                                        @csrf
                                        @method('PATCH')
                                        <input name="status" type="hidden" value="blocked">
                                        <button class="button danger" type="submit">Заблокировать</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    @empty
                        <tr><td class="empty" colspan="5">Пользователи не найдены.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            </div>

            @include('partials.pagination', ['paginator' => $users])
        </section>
    </section>
@endsection
