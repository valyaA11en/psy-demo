@extends('layouts.admin', ['title' => 'Аудит'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">трассируемость</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Журнал аудита</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar" style="grid-template-columns: repeat(3, minmax(0, 1fr)) auto;">
                <div class="field">
                    <label for="action">Действие</label>
                    <input id="action" name="action" type="text" value="{{ $filters['action'] ?? '' }}" placeholder="auth.login или admin.users.status_update">
                </div>
                <div class="field">
                    <label for="entity_type">Тип сущности</label>
                    <input id="entity_type" name="entity_type" type="text" value="{{ $filters['entity_type'] ?? '' }}" placeholder="user, payment, complaint">
                </div>
                <div class="field">
                    <label for="actor">Email инициатора</label>
                    <input id="actor" name="actor" type="text" value="{{ $filters['actor'] ?? '' }}" placeholder="admin@example.com">
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.audit.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <section class="panel">
            <div class="table-wrap">
                <table>
                    <thead>
                    <tr><th>Когда</th><th>Действие</th><th>Кто</th><th>Сущность</th><th>Метаданные</th></tr>
                    </thead>
                    <tbody>
                    @forelse ($logs as $log)
                        <tr>
                            <td>{{ optional($log->created_at)->format('d.m.Y H:i:s') }}</td>
                            <td>{{ $log->action }}</td>
                            <td>{{ $log->actor?->email ?? $log->actor_role ?? 'система' }}</td>
                            <td>{{ $log->entity_type }} / {{ $log->entity_id }}</td>
                            <td class="small">{{ $log->metadata_json ? json_encode($log->metadata_json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '-' }}</td>
                        </tr>
                    @empty
                        <tr><td class="empty" colspan="5">События аудита не найдены.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            </div>

            @include('partials.pagination', ['paginator' => $logs])
        </section>
    </section>
@endsection
