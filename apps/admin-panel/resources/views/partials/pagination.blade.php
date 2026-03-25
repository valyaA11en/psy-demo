@if ($paginator->hasPages())
    <div class="pagination panel soft">
        <span class="small">Страница {{ $paginator->currentPage() }} из {{ $paginator->lastPage() }}</span>
        <div class="inline-actions">
            @if ($paginator->onFirstPage())
                <span class="button ghost" aria-disabled="true">Назад</span>
            @else
                <a class="button ghost" href="{{ $paginator->previousPageUrl() }}">Назад</a>
            @endif

            @if ($paginator->hasMorePages())
                <a class="button ghost" href="{{ $paginator->nextPageUrl() }}">Дальше</a>
            @else
                <span class="button ghost" aria-disabled="true">Дальше</span>
            @endif
        </div>
    </div>
@endif
