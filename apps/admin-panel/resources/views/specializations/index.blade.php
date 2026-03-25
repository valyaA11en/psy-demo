@extends('layouts.admin', ['title' => 'Специализации'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">справочники каталога</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Специализации</h1>
            </div>
        </div>

        <div class="two-col">
            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 16px;">Новая специализация</h2>
                <form action="{{ route('admin.specializations.store') }}" method="post" style="display: grid; gap: 16px;">
                    @csrf
                    <div class="field">
                        <label for="name">Название</label>
                        <input id="name" name="name" type="text" maxlength="128" value="{{ old('name') }}" placeholder="Например: тревожность">
                    </div>
                    <div class="field">
                        <label for="slug">Slug</label>
                        <input id="slug" name="slug" type="text" maxlength="128" value="{{ old('slug') }}" placeholder="trevozhnost">
                    </div>
                    <div class="field">
                        <label for="is_active">Статус</label>
                        <select id="is_active" name="is_active">
                            <option value="1" @selected(old('is_active', '1') === '1')>Активна</option>
                            <option value="0" @selected(old('is_active') === '0')>Отключена</option>
                        </select>
                    </div>
                    <div class="inline-actions">
                        <button class="button primary" type="submit">Создать</button>
                    </div>
                </form>
            </section>

            <section class="panel soft" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Правила справочника</h2>
                <ul style="margin: 0; padding-left: 18px; line-height: 1.7; color: #5f6b7a;">
                    <li>Активные специализации доступны для выбора в профиле психолога и в каталоге.</li>
                    <li>Slug должен оставаться стабильным, потому что используется в интеграциях и фильтрах.</li>
                    <li>Удаление разрешено только для неиспользуемых записей. Для рабочих значений лучше использовать отключение.</li>
                </ul>
            </section>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar">
                <div class="field">
                    <label for="q">Поиск</label>
                    <input id="q" name="q" type="text" value="{{ $filters['q'] ?? '' }}" placeholder="название или slug">
                </div>
                <div class="field">
                    <label for="status">Статус</label>
                    <select id="status" name="status">
                        <option value="">Все</option>
                        <option value="active" @selected(($filters['status'] ?? '') === 'active')>Только активные</option>
                        <option value="inactive" @selected(($filters['status'] ?? '') === 'inactive')>Только отключенные</option>
                    </select>
                </div>
                <div></div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.specializations.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <section class="stack">
            @forelse ($specializations as $specialization)
                <article class="card">
                    <form action="{{ route('admin.specializations.update', $specialization) }}" method="post" style="display: grid; gap: 16px;">
                        @csrf
                        @method('PATCH')
                        <div style="display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
                            <div class="field">
                                <label for="name-{{ $specialization->id }}">Название</label>
                                <input id="name-{{ $specialization->id }}" name="name" type="text" maxlength="128" value="{{ $specialization->name }}">
                            </div>
                            <div class="field">
                                <label for="slug-{{ $specialization->id }}">Slug</label>
                                <input id="slug-{{ $specialization->id }}" name="slug" type="text" maxlength="128" value="{{ $specialization->slug }}">
                            </div>
                            <div class="field">
                                <label for="is-active-{{ $specialization->id }}">Статус</label>
                                <select id="is-active-{{ $specialization->id }}" name="is_active">
                                    <option value="1" @selected($specialization->is_active)>Активна</option>
                                    <option value="0" @selected(! $specialization->is_active)>Отключена</option>
                                </select>
                            </div>
                            <div class="field">
                                <label>Использование</label>
                                <div style="display: flex; align-items: center; gap: 12px; min-height: 48px;">
                                    <span class="badge {{ $specialization->psychologists_count > 0 ? 'warn' : 'success' }}">
                                        {{ $specialization->psychologists_count }} профилей
                                    </span>
                                    <span class="small">Обновлено {{ optional($specialization->updated_at)->format('d.m.Y H:i') }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="inline-actions">
                            <button class="button primary" type="submit">Сохранить</button>
                        </div>
                    </form>

                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #d8dee7;">
                        <span class="small">
                            ID: {{ $specialization->id }}
                        </span>
                        <form action="{{ route('admin.specializations.destroy', $specialization) }}" method="post">
                            @csrf
                            @method('DELETE')
                            <button class="button danger" type="submit" @disabled($specialization->psychologists_count > 0)>
                                Удалить
                            </button>
                        </form>
                    </div>
                </article>
            @empty
                <section class="panel">
                    <div class="empty">Специализации пока не созданы.</div>
                </section>
            @endforelse
        </section>

        @include('partials.pagination', ['paginator' => $specializations])
    </section>
@endsection
