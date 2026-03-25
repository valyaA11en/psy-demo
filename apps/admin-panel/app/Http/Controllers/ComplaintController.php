<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Models\User;
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

        $query = Complaint::query()->with([
            'author',
            'target',
            'assignedAdmin',
            'consultation',
        ]);

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
            'statusOptions' => $this->statusOptions(),
        ]);
    }

    public function show(Complaint $complaint): View
    {
        $complaint->load([
            'author.roles',
            'author.clientProfile',
            'target.roles',
            'target.clientProfile',
            'assignedAdmin.roles',
            'consultation.client.clientProfile',
            'consultation.psychologist.psychologistProfile',
        ]);

        return view('complaints.show', [
            'complaint' => $complaint,
            'admins' => $this->adminUsers(),
            'statusOptions' => $this->statusOptions(),
        ]);
    }

    public function update(Request $request, Complaint $complaint): RedirectResponse
    {
        $request->merge([
            'assigned_admin_id' => $request->input('assigned_admin_id') ?: null,
            'resolution_note' => is_string($request->input('resolution_note'))
                ? trim($request->input('resolution_note'))
                : null,
        ]);

        $payload = $request->validate([
            'status' => ['required', 'in:new,open,in_review,resolved,rejected'],
            'resolution_note' => ['nullable', 'string', 'max:2000'],
            'assigned_admin_id' => ['nullable', 'uuid', 'exists:users,id'],
            'assign_to_me' => ['nullable', 'in:1'],
            'action' => ['nullable', 'in:save,take_ownership,resolve_case,reject_case'],
        ]);

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $action = $payload['action'] ?? 'save';
        $previousStatus = $complaint->status;
        $nextStatus = $payload['status'];
        $assignedAdminId = $payload['assigned_admin_id'] ?? $complaint->assigned_admin_id;

        if (($payload['assign_to_me'] ?? null) === '1' || $action === 'take_ownership') {
            $assignedAdminId = $admin->id;
        }

        if ($action === 'take_ownership' && $complaint->status === 'new') {
            $nextStatus = 'open';
        }

        if ($action === 'resolve_case') {
            $nextStatus = 'resolved';
        }

        if ($action === 'reject_case') {
            $nextStatus = 'rejected';
        }

        if (in_array($nextStatus, ['resolved', 'rejected'], true) && empty($payload['resolution_note'])) {
            return back()
                ->withInput()
                ->withErrors([
                    'resolution_note' => 'Для закрытия кейса нужен комментарий по решению.',
                ]);
        }

        $complaint->status = $nextStatus;
        $complaint->resolution_note = $payload['resolution_note'] ?: null;
        $complaint->assigned_admin_id = $assignedAdminId;
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
                'action' => $action,
            ],
            $request,
        );

        return back()->with('success', 'Жалоба обновлена.');
    }

    /**
     * @return array<string, string>
     */
    private function statusOptions(): array
    {
        return [
            'new' => 'Новая',
            'open' => 'Открыта',
            'in_review' => 'В работе',
            'resolved' => 'Решена',
            'rejected' => 'Отклонена',
        ];
    }

    /**
     * @return \Illuminate\Database\Eloquent\Collection<int, User>
     */
    private function adminUsers()
    {
        return User::query()
            ->with('roles')
            ->whereHas('roles', fn ($query) => $query->whereIn('code', ['admin', 'superadmin']))
            ->orderBy('email')
            ->get();
    }
}
