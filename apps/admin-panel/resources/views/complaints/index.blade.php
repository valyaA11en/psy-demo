@php
    $statusLabels = [
        'new' => 'новая',
        'open' => 'открыта',
        'in_review' => 'в работе',
        'resolved' => 'решена',
        'rejected' => 'отклонена',
    ];
@endphp

@extends('layouts.admin', ['title' => 'Жалобы'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">очередь безопасности</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Жалобы</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar">
                <div class="field">
                    <label for="q">Поиск</label>
                    <input id="q" name="q" type="text" value="{{ $filters['q'] ?? '' }}" placeholder="текст жалобы или email">
                </div>
                <div class="field">
                    <label for="status">Статус</label>
                    <select id="status" name="status">
                        <option value="">Все</option>
                        @foreach (['new', 'open', 'in_review', 'resolved', 'rejected'] as $status)
                            <option value="{{ $status }}" @selected(($filters['status'] ?? '') === $status)>{{ $statusLabels[$status] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="type">Тип</label>
                    <input id="type" name="type" type="text" value="{{ $filters['type'] ?? '' }}" placeholder="abuse, refund, privacy">
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.complaints.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <div class="stack">
            @forelse ($complaints as $complaint)
                @php
                    $tone = match($complaint->status) {
                        'resolved' => 'success',
                        'rejected' => 'danger',
                        'new', 'open', 'in_review' => 'warn',
                        default => '',
                    };
                @endphp
                <article class="panel" style="padding: 20px;">
                    <div class="two-col">
                        <div class="stack">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <div>
                                    <strong>{{ $complaint->type }}</strong>
                                    <div class="small">Автор: {{ $complaint->author?->email ?? 'неизвестен' }}</div>
                                    <div class="small">Цель: {{ $complaint->target?->email ?? 'не указана' }}</div>
                                    <div class="small">
                                        Консультация:
                                        @if ($complaint->consultation)
                                            {{ $complaint->consultation->scheduled_at?->format('d.m.Y H:i') ?? $complaint->consultation->id }}
                                            / {{ $complaint->consultation->status }}
                                        @else
                                            не указана
                                        @endif
                                    </div>
                                </div>
                                <span class="badge {{ $tone }}">{{ $statusLabels[$complaint->status] ?? $complaint->status }}</span>
                            </div>
                            <div class="panel soft" style="padding: 14px;">
                                <strong>Текст жалобы</strong>
                                <p class="small" style="margin-top: 8px; line-height: 1.7;">{{ \Illuminate\Support\Str::limit($complaint->text, 420) }}</p>
                            </div>
                        </div>

                        <form class="stack" action="{{ route('admin.complaints.update', $complaint) }}" method="post">
                            @csrf
                            @method('PATCH')
                            <div class="field">
                                <label for="status_{{ $complaint->id }}">Статус</label>
                                <select id="status_{{ $complaint->id }}" name="status">
                                    @foreach (['new', 'open', 'in_review', 'resolved', 'rejected'] as $status)
                                        <option value="{{ $status }}" @selected($complaint->status === $status)>{{ $statusLabels[$status] }}</option>
                                    @endforeach
                                </select>
                            </div>
                            <div class="field">
                                <label for="resolution_note_{{ $complaint->id }}">Комментарий по решению</label>
                                <textarea id="resolution_note_{{ $complaint->id }}" name="resolution_note">{{ $complaint->resolution_note }}</textarea>
                            </div>
                            <div class="inline-actions">
                                <label class="small" style="display: inline-flex; align-items: center; gap: 8px;">
                                    <input name="assign_to_me" type="checkbox" value="1"> Назначить мне
                                </label>
                                <button class="button primary" type="submit">Сохранить</button>
                            </div>
                            <div class="small">Назначенный админ: {{ $complaint->assignedAdmin?->email ?? 'никто' }}</div>
                        </form>
                    </div>
                </article>
            @empty
                <div class="panel empty">Жалобы не найдены.</div>
            @endforelse
        </div>

        @include('partials.pagination', ['paginator' => $complaints])
    </section>
@endsection
