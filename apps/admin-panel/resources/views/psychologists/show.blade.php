@php
    $approvalTone = match($profile->approval_status) {
        'approved' => 'success',
        'rejected' => 'danger',
        'pending_review' => 'warn',
        default => '',
    };
@endphp

@extends('layouts.admin', ['title' => 'Кейс психолога'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">детали модерации и документов</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">{{ trim($profile->first_name.' '.$profile->last_name) }}</h1>
            </div>
            <a class="button ghost" href="{{ route('admin.psychologists.index') }}">Назад к списку</a>
        </div>

        <div class="cards">
            <div class="metric panel"><span class="small">Всего консультаций</span><strong>{{ $stats['consultationsTotal'] }}</strong></div>
            <div class="metric panel"><span class="small">Завершено</span><strong>{{ $stats['consultationsCompleted'] }}</strong></div>
            <div class="metric panel"><span class="small">Будущие консультации</span><strong>{{ $stats['consultationsUpcoming'] }}</strong></div>
            <div class="metric panel"><span class="small">Опубликованные отзывы</span><strong>{{ $stats['reviewsPublished'] }}</strong></div>
            <div class="metric panel"><span class="small">Открытые жалобы</span><strong>{{ $stats['complaintsOpen'] }}</strong></div>
            <div class="metric panel"><span class="small">Загруженные документы</span><strong>{{ $stats['documentsUploaded'] }}</strong></div>
        </div>

        <div class="two-col">
            <div class="stack">
                <article class="panel" style="padding: 20px;">
                    <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                        <div>
                            <strong>{{ $profile->public_title ?: 'Публичный заголовок не заполнен' }}</strong>
                            <div class="small">{{ $profile->user?->email }} · {{ $profile->public_slug }}</div>
                        </div>
                        <span class="badge {{ $approvalTone }}">{{ $approvalLabels[$profile->approval_status] ?? $profile->approval_status }}</span>
                    </div>

                    <div class="stack" style="margin-top: 16px;">
                        <div class="panel soft" style="padding: 14px;">
                            <strong>Профиль</strong>
                            <div class="small" style="margin-top: 8px;">Опыт: {{ $profile->experience_years }} лет</div>
                            <div class="small">Стоимость: {{ $profile->price_from ? $profile->price_from.' - '.($profile->price_to ?? $profile->price_from).' ₽' : 'не указана' }}</div>
                            <div class="small">Языки: {{ collect($profile->languages_json ?? [])->join(', ') ?: 'не указаны' }}</div>
                            <div class="small">Форматы: {{ collect($profile->formats_json ?? [])->join(', ') ?: 'не указаны' }}</div>
                            <div class="small">Специализации: {{ $profile->specializations->pluck('name')->join(', ') ?: 'не указаны' }}</div>
                            <div class="small">Последний модератор: {{ $profile->moderatedBy?->email ?? 'не назначен' }}</div>
                        </div>

                        <div class="panel soft" style="padding: 14px;">
                            <strong>Публичное описание</strong>
                            <p class="small" style="margin-top: 8px; line-height: 1.8;">{{ $profile->bio ?: 'Описание пока отсутствует.' }}</p>
                        </div>
                    </div>
                </article>

                <article class="panel" style="padding: 20px;">
                    <strong>Документы и файлы</strong>
                    <p class="small" style="margin-top: 8px;">Админка показывает только метаданные файлов. Download URL и прямой доступ к приватному bucket здесь намеренно не выдаются.</p>

                    <div class="stack" style="margin-top: 16px;">
                        @forelse ($profile->files as $file)
                            <div class="panel soft" style="padding: 14px;">
                                <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                    <strong>{{ $filePurposeLabels[$file->purpose] ?? $file->purpose }}</strong>
                                    <span class="badge {{ $file->status === 'uploaded' ? 'success' : 'warn' }}">{{ $fileStatusLabels[$file->status] ?? $file->status }}</span>
                                </div>
                                <div class="small" style="margin-top: 8px;">{{ $file->original_filename ?: 'Имя не указано' }}</div>
                                <div class="small">Mime: {{ $file->mime_type }} · Размер: {{ number_format(($file->size_bytes ?? 0) / 1024, 1, '.', ' ') }} KB</div>
                                <div class="small">Создан: {{ optional($file->created_at)->format('d.m.Y H:i') ?? '—' }}</div>
                                <div class="small">Загружен: {{ optional($file->uploaded_at)->format('d.m.Y H:i') ?? 'ещё нет' }}</div>
                            </div>
                        @empty
                            <div class="panel soft" style="padding: 14px;">
                                <span class="small">Файлы для модерации пока не загружены.</span>
                            </div>
                        @endforelse
                    </div>
                </article>

                <article class="panel" style="padding: 20px;">
                    <strong>Последние отзывы</strong>
                    <div class="stack" style="margin-top: 16px;">
                        @forelse ($recentReviews as $review)
                            @php
                                $reviewTone = match($review->status) {
                                    'published' => 'success',
                                    'hidden' => 'danger',
                                    'flagged' => 'warn',
                                    default => '',
                                };
                            @endphp
                            <div class="panel soft" style="padding: 14px;">
                                <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                    <strong>{{ $review->rating }}/5</strong>
                                    <span class="badge {{ $reviewTone }}">{{ $reviewStatusLabels[$review->status] ?? $review->status }}</span>
                                </div>
                                <div class="small" style="margin-top: 8px;">Автор: {{ $review->author?->clientProfile?->display_name ?: ($review->author?->email ?? 'клиент удалён') }}</div>
                                <div class="small">Дата: {{ optional($review->created_at)->format('d.m.Y H:i') ?? '—' }}</div>
                                <p class="small" style="margin-top: 8px; line-height: 1.7;">{{ $review->text ?: 'Текст отзыва не указан.' }}</p>
                            </div>
                        @empty
                            <div class="panel soft" style="padding: 14px;">
                                <span class="small">Отзывов пока нет.</span>
                            </div>
                        @endforelse
                    </div>
                </article>
            </div>

            <aside class="stack">
                <article class="panel" style="padding: 20px;">
                    <strong>Решение по модерации</strong>

                    <form class="stack" action="{{ route('admin.psychologists.update', $profile) }}" method="post" style="margin-top: 16px;">
                        @csrf
                        @method('PATCH')

                        <div class="field">
                            <label for="approval_status">Статус модерации</label>
                            <select id="approval_status" name="approval_status">
                                @foreach (['pending_review', 'approved', 'rejected'] as $status)
                                    <option value="{{ $status }}" @selected($profile->approval_status === $status)>{{ $approvalLabels[$status] }}</option>
                                @endforeach
                            </select>
                        </div>

                        <div class="field">
                            <label for="moderation_note">Комментарий модератора</label>
                            <textarea id="moderation_note" name="moderation_note" placeholder="Кратко зафиксируйте результат проверки и следующий шаг.">{{ old('moderation_note', $profile->moderation_note) }}</textarea>
                        </div>

                        <div class="inline-actions">
                            <button class="button primary" type="submit">Сохранить</button>
                        </div>
                    </form>
                </article>

                <article class="panel" style="padding: 20px;">
                    <strong>Жалобы по психологу</strong>
                    <div class="stack" style="margin-top: 16px;">
                        @forelse ($recentComplaints as $complaint)
                            @php
                                $complaintTone = match($complaint->status) {
                                    'resolved' => 'success',
                                    'rejected' => 'danger',
                                    default => 'warn',
                                };
                            @endphp
                            <div class="panel soft" style="padding: 14px;">
                                <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                    <strong>{{ $complaint->type }}</strong>
                                    <span class="badge {{ $complaintTone }}">{{ $complaintStatusLabels[$complaint->status] ?? $complaint->status }}</span>
                                </div>
                                <div class="small" style="margin-top: 8px;">Автор: {{ $complaint->author?->clientProfile?->display_name ?: ($complaint->author?->email ?? 'неизвестен') }}</div>
                                <div class="small">Назначен: {{ $complaint->assignedAdmin?->email ?? 'никто' }}</div>
                                <div class="small">Создано: {{ optional($complaint->created_at)->format('d.m.Y H:i') ?? '—' }}</div>
                                <div class="inline-actions" style="margin-top: 10px;">
                                    <a class="button ghost" href="{{ route('admin.complaints.show', $complaint) }}">Открыть жалобу</a>
                                </div>
                            </div>
                        @empty
                            <div class="panel soft" style="padding: 14px;">
                                <span class="small">Жалоб по этому психологу пока нет.</span>
                            </div>
                        @endforelse
                    </div>
                </article>
            </aside>
        </div>
    </section>
@endsection
