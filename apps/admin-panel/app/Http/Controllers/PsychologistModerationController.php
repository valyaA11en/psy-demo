<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Models\Consultation;
use App\Models\PsychologistProfile;
use App\Models\Review;
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
            ->with(['user.roles', 'specializations', 'moderatedBy'])
            ->withCount([
                'files as uploaded_files_count' => fn ($builder) => $builder->where('status', 'uploaded'),
            ]);

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
            'approvalLabels' => $this->approvalLabels(),
        ]);
    }

    public function show(PsychologistProfile $psychologistProfile): View
    {
        $psychologistProfile->load([
            'user.roles',
            'specializations',
            'moderatedBy.roles',
            'files' => fn ($builder) => $builder
                ->where('status', '!=', 'deleted')
                ->latest('created_at'),
        ]);

        $userId = $psychologistProfile->user_id;

        $stats = [
            'consultationsTotal' => Consultation::query()
                ->where('psychologist_user_id', $userId)
                ->count(),
            'consultationsCompleted' => Consultation::query()
                ->where('psychologist_user_id', $userId)
                ->where('status', 'completed')
                ->count(),
            'consultationsUpcoming' => Consultation::query()
                ->where('psychologist_user_id', $userId)
                ->where('status', 'scheduled')
                ->count(),
            'reviewsPublished' => Review::query()
                ->where('psychologist_user_id', $userId)
                ->where('status', 'published')
                ->count(),
            'complaintsOpen' => Complaint::query()
                ->where('target_user_id', $userId)
                ->whereIn('status', ['new', 'open', 'in_review'])
                ->count(),
            'documentsUploaded' => $psychologistProfile->files
                ->where('status', 'uploaded')
                ->count(),
        ];

        $recentReviews = Review::query()
            ->with(['author.clientProfile', 'consultation'])
            ->where('psychologist_user_id', $userId)
            ->latest('created_at')
            ->limit(5)
            ->get();

        $recentComplaints = Complaint::query()
            ->with(['author.clientProfile', 'assignedAdmin', 'consultation'])
            ->where('target_user_id', $userId)
            ->latest('created_at')
            ->limit(5)
            ->get();

        return view('psychologists.show', [
            'profile' => $psychologistProfile,
            'stats' => $stats,
            'recentReviews' => $recentReviews,
            'recentComplaints' => $recentComplaints,
            'approvalLabels' => $this->approvalLabels(),
            'reviewStatusLabels' => [
                'published' => 'Опубликован',
                'hidden' => 'Скрыт',
                'flagged' => 'Помечен',
            ],
            'complaintStatusLabels' => [
                'new' => 'Новая',
                'open' => 'Открыта',
                'in_review' => 'В работе',
                'resolved' => 'Решена',
                'rejected' => 'Отклонена',
            ],
            'filePurposeLabels' => [
                'psychologist_verification_document' => 'Документ для верификации',
                'psychologist_certificate' => 'Сертификат',
                'psychologist_diploma' => 'Диплом',
                'psychologist_additional_document' => 'Дополнительный документ',
                'psychologist_public_photo' => 'Публичное фото',
            ],
            'fileStatusLabels' => [
                'pending' => 'Ожидает загрузки',
                'uploaded' => 'Загружен',
                'deleted' => 'Удалён',
            ],
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

    /**
     * @return array<string, string>
     */
    private function approvalLabels(): array
    {
        return [
            'draft' => 'Черновик',
            'pending_review' => 'На модерации',
            'approved' => 'Одобрен',
            'rejected' => 'Отклонён',
        ];
    }
}
