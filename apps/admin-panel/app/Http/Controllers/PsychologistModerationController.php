<?php

namespace App\Http\Controllers;

use App\Models\PsychologistProfile;
use App\Support\AdminAuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PsychologistModerationController extends Controller
{
    public function __construct(private readonly AdminAuditLogger $auditLogger)
    {
    }

    public function index(Request $request): View
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'approval_status' => ['nullable', 'string', 'max:64'],
        ]);

        $query = PsychologistProfile::query()
            ->with(['user.roles', 'specializations', 'moderatedBy']);

        if (! empty($filters['q'])) {
            $search = trim($filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('public_slug', 'ilike', "%{$search}%")
                    ->orWhere('first_name', 'ilike', "%{$search}%")
                    ->orWhere('last_name', 'ilike', "%{$search}%")
                    ->orWhereHas('user', fn ($userQuery) => $userQuery->where('email', 'ilike', "%{$search}%"));
            });
        }

        if (! empty($filters['approval_status'])) {
            $query->where('approval_status', $filters['approval_status']);
        }

        return view('psychologists.index', [
            'profiles' => $query
                ->orderByRaw("CASE WHEN approval_status = 'pending_review' THEN 0 ELSE 1 END")
                ->latest('updated_at')
                ->paginate(12)
                ->withQueryString(),
            'filters' => $filters,
        ]);
    }

    public function update(Request $request, PsychologistProfile $psychologistProfile): RedirectResponse
    {
        $payload = $request->validate([
            'approval_status' => ['required', 'in:pending_review,approved,rejected'],
            'moderation_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $previousStatus = $psychologistProfile->approval_status;
        $psychologistProfile->approval_status = $payload['approval_status'];
        $psychologistProfile->moderation_note = $payload['moderation_note'] ?: null;
        $psychologistProfile->moderated_by_user_id = $admin->id;
        $psychologistProfile->save();

        $this->auditLogger->log(
            $admin,
            'admin.psychologists.moderate',
            'psychologist_profile',
            $psychologistProfile->user_id,
            [
                'from' => $previousStatus,
                'to' => $psychologistProfile->approval_status,
            ],
            $request,
        );

        return back()->with('success', 'Статус модерации психолога обновлён.');
    }
}
