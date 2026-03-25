@extends('layouts.admin', ['title' => 'Жалобы'])

@php
    $toneByStatus = [
        'new' => 'warn',
        'open' => 'warn',
        'in_review' => 'warn',
        'resolved' => 'success',
        'rejected' => 'danger',
    ];
@endphp

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">очередь безопасности и модерации</p>
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
                        @foreach ($statusOptions as $statusCode => $statusLabel)
                            <option value="{{ $statusCode }}" @selected(($filters['status'] ?? '') === $statusCode)>{{ $statusLabel }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="type">Тип</label>
                    <input id="type" name="type" type="text" value="{{ $filters['type'] ?? '' }}" placeholder="privacy, abuse, refund">
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.complaints.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <div class="stack">
            @forelse ($complaints as $complaint)
                <article class="panel" style="padding: 20px;">
                    <div class="two-col">
                        <div class="stack">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <div>
                                    <strong>{{ $complaint->type }}</strong>
                                    <div class="small">Автор: {{ $complaint->author?->email ?? 'неизвестен' }}</div>
                                    <div class="small">Цель: {{ $complaint->target?->email ?? 'не указана' }}</div>
                                    <div class="small">Назначен: {{ $complaint->assignedAdmin?->email ?? 'никто' }}</div>
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
                                <span class="badge {{ $toneByStatus[$complaint->status] ?? '' }}">
                                    {{ $statusOptions[$complaint->status] ?? $complaint->status }}
                                </span>
                            </div>

                            <div class="panel soft" style="padding: 14px;">
                                <strong>Текст жалобы</strong>
                                <p class="small" style="margin-top: 8px; line-height: 1.7;">{{ \Illuminate\Support\Str::limit($complaint->text, 420) }}</p>
                            </div>
                        </div>

                        <div class="stack">
                            <div class="panel soft" style="padding: 14px;">
                                <div class="small">Создано: {{ $complaint->created_at?->format('d.m.Y H:i') ?? '—' }}</div>
                                <div class="small">Resolution note: {{ $complaint->resolution_note ?: 'пока не заполнен' }}</div>
                            </div>

                            <div class="inline-actions">
                                <a class="button primary" href="{{ route('admin.complaints.show', $complaint) }}">Открыть кейс</a>
                                <form action="{{ route('admin.complaints.update', $complaint) }}" method="post">
                                    @csrf
                                    @method('PATCH')
                                    <input name="status" type="hidden" value="{{ $complaint->status }}">
                                    <input name="action" type="hidden" value="take_ownership">
                                    <button class="button ghost" type="submit">Забрать себе</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </article>
            @empty
                <div class="panel empty">Жалобы не найдены.</div>
            @endforelse
        </div>

        @include('partials.pagination', ['paginator' => $complaints])
    </section>
@endsection
