<?php

namespace App\Http\Controllers;

use App\Models\PsychologistProfile;
use App\Models\Review;
use App\Support\AdminAuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class ReviewController extends Controller
{
    private const PUBLISHED_STATUS = 'published';

    public function __construct(private readonly AdminAuditLogger $auditLogger)
    {
    }

    public function index(Request $request): View
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'max:64'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'q' => ['nullable', 'string', 'max:255'],
        ]);

        $query = Review::query()->with([
            'author.clientProfile',
            'psychologist.psychologistProfile',
            'consultation',
        ]);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['rating'])) {
            $query->where('rating', (int) $filters['rating']);
        }

        if (! empty($filters['q'])) {
            $search = trim($filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('id', 'ilike', "%{$search}%")
                    ->orWhere('text', 'ilike', "%{$search}%")
                    ->orWhereHas('author', fn ($authorQuery) => $authorQuery->where('email', 'ilike', "%{$search}%"))
                    ->orWhereHas('psychologist', fn ($psychologistQuery) => $psychologistQuery
                        ->where('email', 'ilike', "%{$search}%")
                        ->orWhereHas('psychologistProfile', fn ($profileQuery) => $profileQuery->where('public_slug', 'ilike', "%{$search}%")));
            });
        }

        return view('reviews.index', [
            'reviews' => $query
                ->latest('created_at')
                ->paginate(12)
                ->withQueryString(),
            'filters' => $filters,
            'statusLabels' => $this->statusLabels(),
        ]);
    }

    public function update(Request $request, Review $review): RedirectResponse
    {
        $payload = $request->validate([
            'status' => ['required', 'in:published,hidden,flagged'],
        ]);

        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $previousStatus = $review->status;

        DB::transaction(function () use ($review, $payload): void {
            $review->status = $payload['status'];
            $review->save();

            $this->refreshPsychologistAggregates($review->psychologist_user_id);
        });

        $this->auditLogger->log(
            $admin,
            'admin.reviews.moderate',
            'review',
            $review->id,
            [
                'from' => $previousStatus,
                'to' => $review->status,
                'psychologist_user_id' => $review->psychologist_user_id,
            ],
            $request,
        );

        return back()->with('success', 'Статус отзыва обновлён.');
    }

    private function refreshPsychologistAggregates(string $psychologistUserId): void
    {
        $aggregate = Review::query()
            ->where('psychologist_user_id', $psychologistUserId)
            ->where('status', self::PUBLISHED_STATUS)
            ->selectRaw('COUNT(*) as reviews_count, AVG(rating) as rating_avg')
            ->first();

        PsychologistProfile::query()
            ->where('user_id', $psychologistUserId)
            ->update([
                'reviews_count' => (int) ($aggregate?->reviews_count ?? 0),
                'rating_avg' => $aggregate?->rating_avg !== null
                    ? round((float) $aggregate->rating_avg, 2)
                    : null,
            ]);
    }

    /**
     * @return array<string, string>
     */
    private function statusLabels(): array
    {
        return [
            'published' => 'Опубликован',
            'hidden' => 'Скрыт',
            'flagged' => 'Помечен',
        ];
    }
}
