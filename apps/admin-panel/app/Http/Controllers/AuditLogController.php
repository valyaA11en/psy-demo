<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\View\View;

class AuditLogController extends Controller
{
    public function index(Request $request): View
    {
        $filters = $request->validate([
            'action' => ['nullable', 'string', 'max:128'],
            'entity_type' => ['nullable', 'string', 'max:128'],
            'actor' => ['nullable', 'string', 'max:255'],
        ]);

        $query = AuditLog::query()->with('actor');

        if (! empty($filters['action'])) {
            $query->where('action', 'ilike', "%{$filters['action']}%");
        }

        if (! empty($filters['entity_type'])) {
            $query->where('entity_type', $filters['entity_type']);
        }

        if (! empty($filters['actor'])) {
            $query->whereHas('actor', fn ($actorQuery) => $actorQuery->where('email', 'ilike', "%{$filters['actor']}%"));
        }

        return view('audit-logs.index', [
            'logs' => $query
                ->latest('created_at')
                ->paginate(20)
                ->withQueryString(),
            'filters' => $filters,
        ]);
    }
}
