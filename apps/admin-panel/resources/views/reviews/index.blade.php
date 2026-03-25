@extends('layouts.admin', ['title' => 'Отзывы'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">модерация публичного контента</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Отзывы</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar">
                <div class="field">
                    <label for="q">Поиск</label>
                    <input id="q" name="q" type="text" value="{{ $filters['q'] ?? '' }}" placeholder="id, текст, email, slug">
                </div>
                <div class="field">
                    <label for="status">Статус</label>
                    <select id="status" name="status">
                        <option value="">Все</option>
                        @foreach ($statusLabels as $status => $label)
                            <option value="{{ $status }}" @selected(($filters['status'] ?? '') === $status)>{{ $label }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="rating">Оценка</label>
                    <select id="rating" name="rating">
                        <option value="">Все</option>
                        @foreach ([5, 4, 3, 2, 1] as $rating)
                            <option value="{{ $rating }}" @selected((string) ($filters['rating'] ?? '') === (string) $rating)>{{ $rating }}/5</option>
                        @endforeach
                    </select>
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.reviews.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <div class="stack">
            @forelse ($reviews as $review)
                @php
                    $tone = match($review->status) {
                        'published' => 'success',
                        'hidden' => 'danger',
                        'flagged' => 'warn',
                        default => '',
                    };
                    $psychologistName = $review->psychologist?->psychologistProfile
                        ? trim($review->psychologist->psychologistProfile->first_name.' '.$review->psychologist->psychologistProfile->last_name)
                        : ($review->psychologist?->email ?? 'Психолог удалён');
                @endphp
                <article class="panel" style="padding: 20px;">
                    <div class="two-col">
                        <div class="stack">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <div>
                                    <strong style="font-size: 1.05rem;">{{ $psychologistName }}</strong>
                                    <div class="small">
                                        Автор: {{ $review->author?->clientProfile?->display_name ?: ($review->author?->email ?? 'Клиент удалён') }}
                                        · Оценка {{ $review->rating }}/5
                                        · {{ optional($review->created_at)->format('d.m.Y H:i') }}
                                    </div>
                                </div>
                                <span class="badge {{ $tone }}">{{ $statusLabels[$review->status] ?? $review->status }}</span>
                            </div>

                            <div class="panel soft" style="padding: 14px;">
                                <strong>Текст отзыва</strong>
                                <p class="small" style="margin-top: 8px;">
                                    {{ $review->text ?: 'Текстовый комментарий не указан.' }}
                                </p>
                            </div>

                            <div class="small">
                                Review ID: {{ $review->id }}
                                @if ($review->consultation)
                                    · Consultation: {{ $review->consultation->id }}
                                    · Слот: {{ optional($review->consultation->scheduled_at)->format('d.m.Y H:i') ?? 'не указан' }}
                                @endif
                            </div>
                        </div>

                        <form class="stack" action="{{ route('admin.reviews.update', $review) }}" method="post">
                            @csrf
                            @method('PATCH')
                            <div class="field">
                                <label for="status_{{ $review->id }}">Статус публикации</label>
                                <select id="status_{{ $review->id }}" name="status">
                                    @foreach ($statusLabels as $status => $label)
                                        <option value="{{ $status }}" @selected($review->status === $status)>{{ $label }}</option>
                                    @endforeach
                                </select>
                            </div>
                            <div class="panel soft" style="padding: 14px;">
                                <strong>Что делает модерация</strong>
                                <ul style="margin: 10px 0 0; padding-left: 18px; line-height: 1.7; color: #5f6b7a;">
                                    <li><strong>Опубликован</strong> участвует в публичном рейтинге и счётчике отзывов.</li>
                                    <li><strong>Скрыт</strong> исчезает из каталога и исключается из агрегатов.</li>
                                    <li><strong>Помечен</strong> скрыт из каталога и остаётся в очереди на ручной разбор.</li>
                                </ul>
                            </div>
                            <div class="inline-actions">
                                <button class="button primary" type="submit">Сохранить</button>
                            </div>
                        </form>
                    </div>
                </article>
            @empty
                <div class="panel empty">Отзывы по текущим фильтрам не найдены.</div>
            @endforelse
        </div>

        @include('partials.pagination', ['paginator' => $reviews])
    </section>
@endsection
