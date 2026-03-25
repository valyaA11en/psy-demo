@extends('layouts.admin', ['title' => 'Кейс жалобы'])

@php
    $badgeTone = match($complaint->status) {
        'resolved' => 'success',
        'rejected' => 'danger',
        default => 'warn',
    };
@endphp

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">детали кейса и рабочий процесс</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Жалоба {{ $complaint->id }}</h1>
            </div>
            <a class="button ghost" href="{{ route('admin.complaints.index') }}">Назад к списку</a>
        </div>

        <div class="two-col">
            <div class="stack">
                <article class="panel" style="padding: 20px;">
                    <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                        <div>
                            <strong>{{ $complaint->type }}</strong>
                            <div class="small">Создано: {{ $complaint->created_at?->format('d.m.Y H:i') ?? '—' }}</div>
                        </div>
                        <span class="badge {{ $badgeTone }}">{{ $statusOptions[$complaint->status] ?? $complaint->status }}</span>
                    </div>

                    <div class="stack" style="margin-top: 16px;">
                        <div class="panel soft" style="padding: 14px;">
                            <strong>Автор</strong>
                            <div class="small">{{ $complaint->author?->email ?? 'неизвестен' }}</div>
                            <div class="small">{{ $complaint->author?->displayName() ?? '—' }}</div>
                        </div>

                        <div class="panel soft" style="padding: 14px;">
                            <strong>Цель жалобы</strong>
                            <div class="small">{{ $complaint->target?->email ?? 'не указана' }}</div>
                            <div class="small">{{ $complaint->target?->displayName() ?? '—' }}</div>
                        </div>

                        <div class="panel soft" style="padding: 14px;">
                            <strong>Текст жалобы</strong>
                            <p class="small" style="margin-top: 8px; line-height: 1.8;">{{ $complaint->text }}</p>
                        </div>
                    </div>
                </article>

                <article class="panel" style="padding: 20px;">
                    <strong>Контекст консультации</strong>
                    @if ($complaint->consultation)
                        <div class="stack" style="margin-top: 16px;">
                            <div class="panel soft" style="padding: 14px;">
                                <div class="small">Статус: {{ $complaint->consultation->status }}</div>
                                <div class="small">Дата: {{ $complaint->consultation->scheduled_at?->format('d.m.Y H:i') ?? '—' }}</div>
                                <div class="small">Клиент: {{ $complaint->consultation->client?->email ?? '—' }}</div>
                                <div class="small">Психолог: {{ $complaint->consultation->psychologist?->email ?? '—' }}</div>
                            </div>
                        </div>
                    @else
                        <p class="small" style="margin-top: 12px;">Жалоба не привязана к конкретной консультации.</p>
                    @endif
                </article>
            </div>

            <aside class="stack">
                <article class="panel" style="padding: 20px;">
                    <strong>Ведение кейса</strong>

                    <form class="stack" action="{{ route('admin.complaints.update', $complaint) }}" method="post" style="margin-top: 16px;">
                        @csrf
                        @method('PATCH')

                        <div class="field">
                            <label for="status">Статус</label>
                            <select id="status" name="status">
                                @foreach ($statusOptions as $statusCode => $statusLabel)
                                    <option value="{{ $statusCode }}" @selected($complaint->status === $statusCode)>{{ $statusLabel }}</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="field">
                            <label for="assigned_admin_id">Назначенный администратор</label>
                            <select id="assigned_admin_id" name="assigned_admin_id">
                                <option value="">Не назначен</option>
                                @foreach ($admins as $admin)
                                    <option value="{{ $admin->id }}" @selected($complaint->assigned_admin_id === $admin->id)>
                                        {{ $admin->email }}
                                    </option>
                                @endforeach
                            </select>
                        </div>

                        <div class="field">
                            <label for="resolution_note">Resolution note</label>
                            <textarea id="resolution_note" name="resolution_note" placeholder="Кратко зафиксируйте принятое решение и следующий шаг.">{{ old('resolution_note', $complaint->resolution_note) }}</textarea>
                        </div>

                        <div class="inline-actions">
                            <button class="button primary" name="action" type="submit" value="save">Сохранить</button>
                            <button class="button ghost" name="action" type="submit" value="take_ownership">Назначить мне</button>
                        </div>

                        <div class="inline-actions">
                            <button class="button primary" name="action" type="submit" value="resolve_case">Закрыть как решенную</button>
                            <button class="button danger" name="action" type="submit" value="reject_case">Отклонить кейс</button>
                        </div>
                    </form>
                </article>

                <article class="panel" style="padding: 20px;">
                    <strong>Текущее состояние</strong>
                    <div class="stack" style="margin-top: 16px;">
                        <div class="panel soft" style="padding: 14px;">
                            <div class="small">Статус: {{ $statusOptions[$complaint->status] ?? $complaint->status }}</div>
                            <div class="small">Назначен: {{ $complaint->assignedAdmin?->email ?? 'никто' }}</div>
                            <div class="small">Resolution note: {{ $complaint->resolution_note ?: 'не заполнен' }}</div>
                        </div>
                    </div>
                </article>
            </aside>
        </div>
    </section>
@endsection
