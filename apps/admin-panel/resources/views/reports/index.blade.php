@php
    $consultationStatusLabels = [
        'scheduled' => 'Запланированы',
        'completed' => 'Завершены',
        'cancelled' => 'Отменены',
        'in_progress' => 'В процессе',
        'pending_payment' => 'Ожидают оплату',
    ];
    $paymentStatusLabels = [
        'pending' => 'Ожидает',
        'paid' => 'Оплачен',
        'failed' => 'Ошибка',
        'cancelled' => 'Отменён',
        'refunded' => 'Возврат',
    ];
@endphp

@extends('layouts.admin', ['title' => 'Отчёты'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">операционные отчёты</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Отчёты платформы</h1>
            </div>
        </div>

        <form class="panel" method="get" style="padding: 18px;">
            <div class="toolbar" style="grid-template-columns: 1fr 1fr auto;">
                <div class="field">
                    <label for="from">С</label>
                    <input id="from" name="from" type="date" value="{{ $filters['from'] }}">
                </div>
                <div class="field">
                    <label for="to">По</label>
                    <input id="to" name="to" type="date" value="{{ $filters['to'] }}">
                </div>
                <div class="inline-actions" style="align-items: end;">
                    <button class="button primary" type="submit">Обновить</button>
                </div>
            </div>
        </form>

        <div class="cards">
            <div class="metric panel"><span class="small">Консультации</span><strong>{{ $stats['consultationsTotal'] }}</strong></div>
            <div class="metric panel"><span class="small">Завершены</span><strong>{{ $stats['consultationsCompleted'] }}</strong></div>
            <div class="metric panel"><span class="small">Отменены</span><strong>{{ $stats['consultationsCancelled'] }}</strong></div>
            <div class="metric panel"><span class="small">Успешные платежи</span><strong>{{ $stats['paymentsPaidCount'] }}</strong></div>
            <div class="metric panel"><span class="small">Выручка</span><strong>{{ number_format($stats['paymentsPaidAmount'] / 100, 0, '.', ' ') }} ₽</strong></div>
            <div class="metric panel"><span class="small">Новые клиенты</span><strong>{{ $stats['newClients'] }}</strong></div>
            <div class="metric panel"><span class="small">Новые психологи</span><strong>{{ $stats['newPsychologists'] }}</strong></div>
            <div class="metric panel"><span class="small">Новые жалобы</span><strong>{{ $stats['complaintsCreated'] }}</strong></div>
        </div>

        <div class="two-col">
            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Статусы консультаций</h2>
                <div class="stack">
                    @forelse ($consultationStatusBreakdown as $status => $count)
                        <div class="panel soft" style="padding: 14px;">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <span>{{ $consultationStatusLabels[$status] ?? $status }}</span>
                                <strong>{{ $count }}</strong>
                            </div>
                        </div>
                    @empty
                        <div class="panel soft" style="padding: 14px;">
                            <span class="small">За выбранный период консультаций нет.</span>
                        </div>
                    @endforelse
                </div>
            </section>

            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Статусы платежей</h2>
                <div class="stack">
                    @forelse ($paymentStatusBreakdown as $status => $row)
                        <div class="panel soft" style="padding: 14px;">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <span>{{ $paymentStatusLabels[$status] ?? $status }}</span>
                                <strong>{{ $row['count'] }} / {{ number_format($row['amount'] / 100, 0, '.', ' ') }} ₽</strong>
                            </div>
                        </div>
                    @empty
                        <div class="panel soft" style="padding: 14px;">
                            <span class="small">За выбранный период платежей нет.</span>
                        </div>
                    @endforelse
                </div>
            </section>
        </div>

        <div class="two-col">
            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Выручка по месяцам</h2>
                <div class="stack">
                    @foreach ($monthlyRevenue as $row)
                        <div class="panel soft" style="padding: 14px;">
                            <div class="inline-actions" style="justify-content: space-between; width: 100%;">
                                <span>{{ $row['month'] }}</span>
                                <strong>{{ number_format($row['revenue'] / 100, 0, '.', ' ') }} ₽</strong>
                            </div>
                            <div class="small" style="margin-top: 8px;">Оплат: {{ $row['paymentsCount'] }}</div>
                        </div>
                    @endforeach
                </div>
            </section>

            <section class="panel" style="padding: 20px;">
                <h2 style="margin: 0 0 14px;">Топ психологов</h2>
                <div class="stack">
                    @forelse ($topPsychologists as $row)
                        <div class="panel soft" style="padding: 14px;">
                            <strong>{{ $row['name'] }}</strong>
                            <div class="small" style="margin-top: 8px;">{{ $row['email'] }}{{ $row['publicSlug'] ? ' · '.$row['publicSlug'] : '' }}</div>
                            <div class="small">Консультаций: {{ $row['consultationsTotal'] }} · Завершено: {{ $row['consultationsCompleted'] }}</div>
                            <div class="small">Успешных платежей: {{ $row['paidPaymentsCount'] }} · Выручка: {{ number_format($row['paidRevenue'] / 100, 0, '.', ' ') }} ₽</div>
                        </div>
                    @empty
                        <div class="panel soft" style="padding: 14px;">
                            <span class="small">Недостаточно данных для отчёта.</span>
                        </div>
                    @endforelse
                </div>
            </section>
        </div>
    </section>
@endsection
