@php
    $statusLabels = [
        'pending' => 'ожидает',
        'succeeded' => 'успешно',
        'failed' => 'ошибка',
        'cancelled' => 'отменён',
        'refunded' => 'возвращён',
    ];
@endphp

@extends('layouts.admin', ['title' => 'Платежи'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">финансовый обзор</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Платежи</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar">
                <div class="field">
                    <label for="q">Поиск</label>
                    <input id="q" name="q" type="text" value="{{ $filters['q'] ?? '' }}" placeholder="ID платежа или email">
                </div>
                <div class="field">
                    <label for="status">Статус</label>
                    <select id="status" name="status">
                        <option value="">Все</option>
                        @foreach (['pending', 'succeeded', 'failed', 'cancelled', 'refunded'] as $status)
                            <option value="{{ $status }}" @selected(($filters['status'] ?? '') === $status)>{{ $statusLabels[$status] }}</option>
                        @endforeach
                    </select>
                </div>
                <div class="field">
                    <label for="provider">Провайдер</label>
                    <input id="provider" name="provider" type="text" value="{{ $filters['provider'] ?? '' }}" placeholder="mock">
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Применить</button>
                    <a class="button ghost" href="{{ route('admin.payments.index') }}">Сбросить</a>
                </div>
            </div>
        </form>

        <section class="panel">
            <div class="table-wrap">
                <table>
                    <thead>
                    <tr><th>Платёж</th><th>Статус</th><th>Участники</th><th>Расписание</th><th>Ссылка провайдера</th></tr>
                    </thead>
                    <tbody>
                    @forelse ($payments as $payment)
                        @php
                            $tone = match($payment->status) {
                                'succeeded' => 'success',
                                'pending' => 'warn',
                                'failed', 'cancelled', 'refunded' => 'danger',
                                default => '',
                            };
                        @endphp
                        <tr>
                            <td>
                                <strong>{{ number_format($payment->amount / 100, 2, '.', ' ') }} {{ $payment->currency }}</strong>
                                <div class="small">{{ $payment->id }}</div>
                            </td>
                            <td><span class="badge {{ $tone }}">{{ $statusLabels[$payment->status] ?? $payment->status }}</span></td>
                            <td>
                                <div>{{ $payment->consultation?->client?->email ?? 'неизвестный клиент' }}</div>
                                <div class="small">{{ $payment->consultation?->psychologist?->email ?? 'неизвестный психолог' }}</div>
                            </td>
                            <td>{{ optional($payment->consultation?->scheduled_at)->format('d.m.Y H:i') ?? 'н/д' }}</td>
                            <td>
                                <div>{{ $payment->provider }}</div>
                                <div class="small">{{ $payment->provider_payment_id }}</div>
                            </td>
                        </tr>
                    @empty
                        <tr><td class="empty" colspan="5">Платежи не найдены.</td></tr>
                    @endforelse
                    </tbody>
                </table>
            </div>

            @include('partials.pagination', ['paginator' => $payments])
        </section>
    </section>
@endsection
