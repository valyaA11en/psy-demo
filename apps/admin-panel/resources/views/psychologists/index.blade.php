@php
    $approvalLabels = [
        'draft' => 'черновик',
        'pending_review' => 'на модерации',
        'approved' => 'одобрен',
        'rejected' => 'отклонён',
    ];
@endphp

@extends('layouts.admin', ['title' => 'Модерация психологов'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">модерация</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Психологи</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar" style="grid-template-columns: 2fr 1fr auto;">
                <div class="field">
                    <label for="q">Поиск</label>
                    <input id="q" name="q" type="text" value="{{ $filters['q'] ?? '' }}" placeholder="имя, email, slug">
                </div>
                <div class="field">
                    <label for="approval_status">Статус модерации</label>
                    <select id="approval_status" name="approval_status">
                        <option value="">Все</option>
                        @foreach (['draft', 'pending_review', 'approved', 'rejected'] as $status)
                            <option value="{{ $status }}" @selected(($filters['approval_status'] ?? '') === $status)>{{ $approvalLabels[$status] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.psychologists.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <div class="stack">
            @forelse ($profiles as $profile)
                @php
                    $tone = match($profile->approval_status) {
                        'approved' => 'success',
                        'rejected' => 'danger',
                        'pending_review' => 'warn',
                        default => '',
                    };
                @endphp
                <article class="panel" style="padding: 20px;">
                    <div class="two-col">
                        <div class="stack">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <div>
                                    <strong style="font-size: 1.1rem;">{{ trim($profile->first_name.' '.$profile->last_name) }}</strong>
                                    <div class="small">{{ $profile->user?->email }} · {{ $profile->public_slug }}</div>
                                </div>
                                <span class="badge {{ $tone }}">{{ $approvalLabels[$profile->approval_status] ?? $profile->approval_status }}</span>
                            </div>
                            <div class="small">
                                {{ $profile->public_title ?: 'Публичное описание не заполнено' }} · {{ $profile->experience_years }} лет ·
                                {{ $profile->specializations->pluck('name')->join(', ') ?: 'Специализации не указаны' }}
                            </div>
                            <div class="panel soft" style="padding: 14px;">
                                <strong>Публичное описание</strong>
                                <p class="small" style="margin-top: 8px;">{{ $profile->bio ? \Illuminate\Support\Str::limit($profile->bio, 260) : 'Описание пока отсутствует.' }}</p>
                            </div>
                        </div>

                        <form class="stack" action="{{ route('admin.psychologists.update', $profile) }}" method="post">
                            @csrf
                            @method('PATCH')
                            <div class="field">
                                <label for="approval_status_{{ $profile->user_id }}">Статус модерации</label>
                                <select id="approval_status_{{ $profile->user_id }}" name="approval_status">
                                    @foreach (['pending_review', 'approved', 'rejected'] as $status)
                                        <option value="{{ $status }}" @selected($profile->approval_status === $status)>{{ $approvalLabels[$status] }}</option>
                                    @endforeach
                                </select>
                            </div>
                            <div class="field">
                                <label for="moderation_note_{{ $profile->user_id }}">Комментарий модератора</label>
                                <textarea id="moderation_note_{{ $profile->user_id }}" name="moderation_note">{{ $profile->moderation_note }}</textarea>
                            </div>
                            <div class="inline-actions">
                                <button class="button primary" type="submit">Сохранить</button>
                            </div>
                        </form>
                    </div>
                </article>
            @empty
                <div class="panel empty">По текущим фильтрам профили психологов не найдены.</div>
            @endforelse
        </div>

        @include('partials.pagination', ['paginator' => $profiles])
    </section>
@endsection
