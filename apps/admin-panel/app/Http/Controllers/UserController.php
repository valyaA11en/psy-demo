<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\AdminAuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class UserController extends Controller
{
    public function __construct(private readonly AdminAuditLogger $auditLogger)
    {
    }

    public function index(Request $request): View
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', 'max:64'],
            'role' => ['nullable', 'string', 'max:64'],
        ]);

        $query = User::query()->withAdminRelations();

        if (! empty($filters['q'])) {
            $search = trim($filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('email', 'ilike', "%{$search}%")
                    ->orWhereHas('clientProfile', fn ($profile) => $profile->where('display_name', 'ilike', "%{$search}%"))
                    ->orWhereHas('psychologistProfile', fn ($profile) => $profile
                        ->where('first_name', 'ilike', "%{$search}%")
                        ->orWhere('last_name', 'ilike', "%{$search}%")
                        ->orWhere('public_slug', 'ilike', "%{$search}%"));
            });
        }

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['role'])) {
            $query->whereHas('roles', fn ($roleQuery) => $roleQuery->where('code', $filters['role']));
        }

        return view('users.index', [
            'users' => $query
                ->latest('created_at')
                ->paginate(15)
                ->withQueryString(),
            'filters' => $filters,
        ]);
    }

    public function updateStatus(Request $request, User $user): RedirectResponse
    {
        $payload = $request->validate([
            'status' => ['required', 'in:active,blocked'],
        ]);

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        if ($admin->id === $user->id && $payload['status'] === 'blocked') {
            return back()->with('error', 'Нельзя заблокировать собственную админскую учётную запись.');
        }

        $previousStatus = $user->status;
        $user->status = $payload['status'];
        $user->save();

        $this->auditLogger->log(
            $admin,
            'admin.users.status_update',
            'user',
            $user->id,
            [
                'from' => $previousStatus,
                'to' => $user->status,
            ],
            $request,
        );

        return back()->with('success', 'Статус пользователя обновлён.');
    }
}
