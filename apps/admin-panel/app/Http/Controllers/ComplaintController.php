<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Support\AdminAuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class ComplaintController extends Controller
{
    public function __construct(private readonly AdminAuditLogger $auditLogger)
    {
    }

    public function index(Request $request): View
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'max:64'],
            'type' => ['nullable', 'string', 'max:64'],
            'q' => ['nullable', 'string', 'max:255'],
        ]);

        $query = Complaint::query()->with(['author', 'target', 'assignedAdmin']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (! empty($filters['q'])) {
            $search = trim($filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('text', 'ilike', "%{$search}%")
                    ->orWhereHas('author', fn ($authorQuery) => $authorQuery->where('email', 'ilike', "%{$search}%"))
                    ->orWhereHas('target', fn ($targetQuery) => $targetQuery->where('email', 'ilike', "%{$search}%"));
            });
        }

        return view('complaints.index', [
            'complaints' => $query
                ->latest('created_at')
                ->paginate(12)
                ->withQueryString(),
            'filters' => $filters,
        ]);
    }

    public function update(Request $request, Complaint $complaint): RedirectResponse
    {
        $payload = $request->validate([
            'status' => ['required', 'in:new,open,in_review,resolved,rejected'],
            'resolution_note' => ['nullable', 'string', 'max:2000'],
            'assign_to_me' => ['nullable', 'in:1'],
        ]);

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $previousStatus = $complaint->status;
        $complaint->status = $payload['status'];
        $complaint->resolution_note = $payload['resolution_note'] ?: null;

        if (($payload['assign_to_me'] ?? null) === '1') {
            $complaint->assigned_admin_id = $admin->id;
        }

        $complaint->save();

        $this->auditLogger->log(
            $admin,
            'admin.complaints.update',
            'complaint',
            $complaint->id,
            [
                'from' => $previousStatus,
                'to' => $complaint->status,
                'assigned_admin_id' => $complaint->assigned_admin_id,
            ],
            $request,
        );

        return back()->with('success', 'Жалоба обновлена.');
    }
}
