<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? 'Админ-панель' }}</title>
    <style>
        :root {
            color-scheme: light;
            --bg: #eef3ff;
            --panel: rgba(255, 255, 255, 0.74);
            --panel-soft: rgba(244, 247, 255, 0.9);
            --line: rgba(104, 124, 176, 0.18);
            --text: #17233b;
            --text-soft: #62708d;
            --accent: #5b7cff;
            --accent-strong: #3f5dd8;
            --warn-soft: #fff2cc;
            --danger-soft: #fde3e3;
            --success-soft: #ddf2e7;
            --radius: 18px;
            --shadow: 0 18px 40px rgba(52, 78, 138, 0.1);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: "Aptos", "Segoe UI", system-ui, sans-serif;
            background:
                radial-gradient(circle at top left, rgba(215, 228, 255, .88), transparent 36%),
                radial-gradient(circle at top right, rgba(236, 224, 255, .72), transparent 28%),
                linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
            color: var(--text);
            -webkit-font-smoothing: antialiased;
        }

        a {
            color: inherit;
            text-decoration: none;
        }

        input,
        select,
        textarea,
        button {
            font: inherit;
        }

        input,
        select,
        textarea {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #fff;
            color: var(--text);
        }

        textarea {
            min-height: 96px;
            resize: vertical;
        }

        .shell {
            display: grid;
            grid-template-columns: 280px minmax(0, 1fr);
            min-height: 100vh;
        }

        .sidebar {
            padding: 24px;
            border-right: 1px solid var(--line);
            background: rgba(247, 250, 255, .72);
            backdrop-filter: blur(18px);
        }

        .main {
            padding: 24px;
        }

        .page {
            width: min(100%, 1360px);
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .brand {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 28px;
        }

        .brand strong {
            font-size: 1.2rem;
            font-family: "Iowan Old Style", Georgia, serif;
        }

        .muted,
        .small {
            color: var(--text-soft);
            font-size: .92rem;
        }

        .nav {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .nav a {
            padding: 12px 14px;
            border-radius: 12px;
            color: var(--text-soft);
            border: 1px solid transparent;
            transition: .2s ease;
        }

        .nav a.active,
        .nav a:hover {
            background: var(--panel);
            color: var(--accent-strong);
            border-color: var(--line);
            box-shadow: var(--shadow);
        }

        .panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: var(--radius);
            box-shadow: var(--shadow);
            backdrop-filter: blur(18px);
        }

        .panel.soft {
            background: var(--panel-soft);
            box-shadow: none;
        }

        .section-head,
        .toolbar,
        .cards,
        .two-col,
        .inline-actions,
        .stack {
            display: grid;
            gap: 16px;
        }

        .section-head {
            grid-template-columns: 1fr auto;
            align-items: end;
        }

        .cards {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }

        .two-col {
            grid-template-columns: 1.2fr .8fr;
        }

        .stack {
            grid-template-columns: 1fr;
        }

        .toolbar {
            grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .inline-actions {
            grid-auto-flow: column;
            justify-content: start;
            align-items: center;
            width: fit-content;
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .field label {
            color: var(--text-soft);
            font-size: .84rem;
            text-transform: uppercase;
            letter-spacing: .06em;
        }

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

        .button.primary {
            background: linear-gradient(135deg, var(--accent), var(--accent-strong));
            color: #fff;
            box-shadow: 0 12px 24px rgba(63, 93, 216, 0.2);
        }

        .button.ghost {
            border-color: var(--line);
            background: transparent;
            color: var(--text-soft);
        }

        .button.danger {
            background: #dc2626;
            color: #fff;
        }

        .button:hover {
            transform: translateY(-1px);
        }

        .metric,
        .card {
            padding: 18px;
            border: 1px solid var(--line);
            border-radius: 16px;
            background: linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(241, 246, 255, 0.8));
        }

        .hero-note {
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 16px 18px;
            background: linear-gradient(130deg, #edf3ff, #f3edff);
        }

        .metric strong {
            display: block;
            margin-top: 6px;
            font-size: 1.8rem;
        }

        .table-wrap {
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th,
        td {
            padding: 14px;
            text-align: left;
            border-bottom: 1px solid var(--line);
            vertical-align: top;
        }

        th {
            color: var(--text-soft);
            font-size: .82rem;
            text-transform: uppercase;
            letter-spacing: .05em;
        }

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

        .badge.success {
            background: var(--success-soft);
            color: #166534;
        }

        .badge.warn {
            background: var(--warn-soft);
            color: #92400e;
        }

        .badge.danger {
            background: var(--danger-soft);
            color: #991b1b;
        }

        .flash {
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid var(--line);
        }

        .flash.success {
            background: var(--success-soft);
        }

        .flash.error {
            background: var(--danger-soft);
        }

        .pagination {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 16px 18px;
        }

        .empty {
            padding: 28px;
            text-align: center;
            color: var(--text-soft);
        }

        .auth-shell {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
        }

        .auth-card {
            width: min(100%, 460px);
            padding: 28px;
        }

        @media (max-width: 1100px) {

            .shell,
            .cards,
            .toolbar,
            .two-col,
            .section-head {
                grid-template-columns: 1fr;
            }
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
                    <a class="{{ request()->routeIs('admin.dashboard') ? 'active' : '' }}"
                        href="{{ route('admin.dashboard') }}">Обзор</a>
                    <a class="{{ request()->routeIs('admin.users.*') ? 'active' : '' }}"
                        href="{{ route('admin.users.index') }}">Пользователи</a>
                    <a class="{{ request()->routeIs('admin.psychologists.*') ? 'active' : '' }}"
                        href="{{ route('admin.psychologists.index') }}">Психологи</a>
                    <a class="{{ request()->routeIs('admin.specializations.*') ? 'active' : '' }}"
                        href="{{ route('admin.specializations.index') }}">Специализации</a>
                    <a class="{{ request()->routeIs('admin.reviews.*') ? 'active' : '' }}"
                        href="{{ route('admin.reviews.index') }}">Отзывы</a>
                    <a class="{{ request()->routeIs('admin.reports.*') ? 'active' : '' }}"
                        href="{{ route('admin.reports.index') }}">Отчёты</a>
                    <a class="{{ request()->routeIs('admin.security.2fa') ? 'active' : '' }}"
                        href="{{ route('admin.security.2fa') }}">Безопасность</a>
                    <a class="{{ request()->routeIs('admin.complaints.*') ? 'active' : '' }}"
                        href="{{ route('admin.complaints.index') }}">Жалобы</a>
                    <a class="{{ request()->routeIs('admin.payments.*') ? 'active' : '' }}"
                        href="{{ route('admin.payments.index') }}">Платежи</a>
                    <a class="{{ request()->routeIs('admin.audit.*') ? 'active' : '' }}"
                        href="{{ route('admin.audit.index') }}">Аудит</a>
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