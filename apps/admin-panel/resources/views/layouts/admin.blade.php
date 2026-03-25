<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? 'Админ-панель' }}</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #f2f4f7;
            --panel: #ffffff;
            --panel-soft: #f8fafc;
            --line: #d8dee7;
            --text: #1f2937;
            --text-soft: #5f6b7a;
            --accent: #1d4ed8;
            --warn-soft: #fff0c2;
            --danger-soft: #fee2e2;
            --success-soft: #dcfce7;
            --radius: 16px;
            --shadow: 0 12px 40px rgba(15, 23, 42, 0.06);
        }

        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); }
        a { color: inherit; text-decoration: none; }
        input, select, textarea, button { font: inherit; }
        input, select, textarea {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #fff;
            color: var(--text);
        }
        textarea { min-height: 96px; resize: vertical; }
        .shell { display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: 100vh; }
        .sidebar { padding: 24px; border-right: 1px solid var(--line); background: #eef2f7; }
        .main { padding: 24px; }
        .page { width: min(100%, 1360px); margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .brand { display: flex; flex-direction: column; gap: 4px; margin-bottom: 28px; }
        .brand strong { font-size: 1.2rem; }
        .muted, .small { color: var(--text-soft); font-size: .92rem; }
        .nav { display: flex; flex-direction: column; gap: 8px; }
        .nav a { padding: 12px 14px; border-radius: 12px; color: var(--text-soft); }
        .nav a.active, .nav a:hover { background: var(--panel); color: var(--text); box-shadow: var(--shadow); }
        .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
        .panel.soft { background: var(--panel-soft); box-shadow: none; }
        .section-head, .toolbar, .cards, .two-col, .inline-actions, .stack { display: grid; gap: 16px; }
        .section-head { grid-template-columns: 1fr auto; align-items: end; }
        .cards { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .two-col { grid-template-columns: 1.2fr .8fr; }
        .stack { grid-template-columns: 1fr; }
        .toolbar { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .inline-actions { grid-auto-flow: column; justify-content: start; align-items: center; width: fit-content; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field label { color: var(--text-soft); font-size: .84rem; text-transform: uppercase; letter-spacing: .06em; }
        .button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            padding: 0 14px;
            border: 1px solid transparent;
            border-radius: 999px;
            background: var(--panel-soft);
            color: var(--text);
            cursor: pointer;
        }
        .button.primary { background: var(--accent); color: #fff; }
        .button.ghost { border-color: var(--line); background: transparent; color: var(--text-soft); }
        .button.danger { background: #dc2626; color: #fff; }
        .metric, .card { padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
        .metric strong { display: block; margin-top: 6px; font-size: 1.8rem; }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
        th { color: var(--text-soft); font-size: .82rem; text-transform: uppercase; letter-spacing: .05em; }
        .badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: .8rem;
            background: #edf2f7;
            color: #475569;
        }
        .badge.success { background: var(--success-soft); color: #166534; }
        .badge.warn { background: var(--warn-soft); color: #92400e; }
        .badge.danger { background: var(--danger-soft); color: #991b1b; }
        .flash { padding: 14px 16px; border-radius: 14px; border: 1px solid var(--line); }
        .flash.success { background: var(--success-soft); }
        .flash.error { background: var(--danger-soft); }
        .pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; }
        .empty { padding: 28px; text-align: center; color: var(--text-soft); }
        .auth-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
        .auth-card { width: min(100%, 460px); padding: 28px; }

        @media (max-width: 1100px) {
            .shell, .cards, .toolbar, .two-col, .section-head { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
@if(($currentAdmin ?? null) instanceof \App\Models\User)
    <div class="shell">
        <aside class="sidebar">
            <div class="brand">
                <span class="muted">консультации с психологом</span>
                <strong>Админ-панель</strong>
                <span class="muted">{{ $currentAdmin->email }}</span>
            </div>
            <nav class="nav">
                <a class="{{ request()->routeIs('admin.dashboard') ? 'active' : '' }}" href="{{ route('admin.dashboard') }}">Обзор</a>
                <a class="{{ request()->routeIs('admin.users.*') ? 'active' : '' }}" href="{{ route('admin.users.index') }}">Пользователи</a>
                <a class="{{ request()->routeIs('admin.psychologists.*') ? 'active' : '' }}" href="{{ route('admin.psychologists.index') }}">Психологи</a>
                <a class="{{ request()->routeIs('admin.specializations.*') ? 'active' : '' }}" href="{{ route('admin.specializations.index') }}">Специализации</a>
                <a class="{{ request()->routeIs('admin.reviews.*') ? 'active' : '' }}" href="{{ route('admin.reviews.index') }}">Отзывы</a>
                <a class="{{ request()->routeIs('admin.reports.*') ? 'active' : '' }}" href="{{ route('admin.reports.index') }}">Отчёты</a>
                <a class="{{ request()->routeIs('admin.complaints.*') ? 'active' : '' }}" href="{{ route('admin.complaints.index') }}">Жалобы</a>
                <a class="{{ request()->routeIs('admin.payments.*') ? 'active' : '' }}" href="{{ route('admin.payments.index') }}">Платежи</a>
                <a class="{{ request()->routeIs('admin.audit.*') ? 'active' : '' }}" href="{{ route('admin.audit.index') }}">Аудит</a>
            </nav>
            <form action="{{ route('logout') }}" method="post" style="margin-top: 24px;">
                @csrf
                <button class="button ghost" type="submit">Выйти</button>
            </form>
        </aside>
        <main class="main">
            <div class="page">
                @include('partials.flash')
                @yield('content')
            </div>
        </main>
    </div>
@else
    <main class="auth-shell">
        @include('partials.flash')
        @yield('content')
    </main>
@endif
</body>
</html>
