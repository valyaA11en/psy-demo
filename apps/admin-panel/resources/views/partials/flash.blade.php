@if (session('success'))
    <div class="flash success">{{ session('success') }}</div>
@endif

@if (session('error'))
    <div class="flash error">{{ session('error') }}</div>
@endif

@if ($errors->any())
    <div class="flash error">
        <strong>Ошибка валидации</strong>
        <ul style="margin-top: 8px; padding-left: 18px;">
            @foreach ($errors->all() as $error)
                <li>{{ $error }}</li>
            @endforeach
        </ul>
    </div>
@endif
