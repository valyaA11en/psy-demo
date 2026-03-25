@extends('layouts.admin', ['title' => 'Обзор'])

@section('content')
    <section style="display: flex; flex-direction: column; gap: 20px;">
        <div class="section-head">
            <div>
                <p class="small">операционный обзор</p>
                <h1 style="margin: 8px 0 0; font-size: 2rem;">Операционный дашборд</h1>
            </div>
        </div>

        <div class="cards">
            <div class="metric panel"><span class="small">Психологи на модерации</span><strong>{{ $stats['pendingPsychologists'] }}</strong></div>
            <div class="metric panel"><span class="small">Открытые жалобы</span><strong>{{ $stats['openComplaints'] }}</strong></div>
            <div class="metric panel"><span class="small">Заблокированные пользователи</span><strong>{{ $stats['blockedUsers'] }}</strong></div>
            <div class="metric panel"><span class="small">Платежи в ожидании</span><strong>{{ $stats['pendingPayments'] }}</strong></div>
            <div class="metric panel"><span class="small">Активные специализации</span><strong>{{ $stats['activeSpecializations'] }}</strong></div>
            <div class="metric panel"><span class="small">Скрытые и помеченные отзывы</span><strong>{{ $stats['flaggedReviews'] }}</strong></div>
            <div class="metric panel"><span class="small">Консультации сегодня</span><strong>{{ $stats['consultationsToday'] }}</strong></div>
        </div>

        <div class="two-col">
            <section class="panel">
                <div style="padding: 20px 20px 0;">
                    <h2 style="margin: 0;">Последняя активность аудита</h2>
                    <p class="small" style="margin-top: 8px;">Последние 8 действий из API и admin workflow.</p>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                        <tr><th>Когда</th><th>Действие</th><th>Кто</th><th>Сущность</th></tr>
                        </thead>
                        <tbody>
                        @forelse ($recentAuditLogs as $log)
                            <tr>
                                <td>{{ optional($log->created_at)->format('d.m H:i') }}</td>
                                <td>{{ $log->action }}</td>
                                <td>{{ $log->actor?->email ?? 'система' }}</td>
                                <td>{{ $log->entity_type }} / {{ $log->entity_id }}</td>
                            </tr>
                        @empty
                            <tr><td class="empty" colspan="4">Событий аудита пока нет.</td></tr>
                        @endforelse
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="panel soft" style="padding: 20px;">
                <h2 style="margin: 0;">Заметка о приватности</h2>
                <ul style="margin: 14px 0 0; padding-left: 18px; line-height: 1.7; color: #5f6b7a;">
                    <li>Backoffice не показывает refresh tokens, IP-адреса или приватные ссылки на сессии.</li>
                    <li>Жалобы и moderation notes доступны только в тех экранах, где это нужно для работы.</li>
                    <li>Доступ к видеосессиям для администраторов намеренно отсутствует.</li>
                </ul>
            </section>
        </div>
    </section>
@endsection
