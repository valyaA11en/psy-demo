<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Complaint;
use App\Models\Consultation;
use App\Models\Payment;
use App\Models\PsychologistProfile;
use App\Models\Review;
use App\Models\Specialization;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\View\View;

class DashboardController extends Controller
{
    public function __invoke(): View
    {
        $today = CarbonImmutable::now('UTC');

        return view('dashboard.index', [
            'stats' => [
                'pendingPsychologists' => PsychologistProfile::query()
                    ->where('approval_status', 'pending_review')
                    ->count(),
                'openComplaints' => Complaint::query()
                    ->whereIn('status', ['new', 'open', 'in_review'])
                    ->count(),
                'blockedUsers' => User::query()
                    ->where('status', 'blocked')
                    ->count(),
                'pendingPayments' => Payment::query()
                    ->where('status', 'pending')
                    ->count(),
                'activeSpecializations' => Specialization::query()
                    ->where('is_active', true)
                    ->count(),
                'flaggedReviews' => Review::query()
                    ->whereIn('status', ['flagged', 'hidden'])
                    ->count(),
                'consultationsToday' => Consultation::query()
                    ->whereBetween('scheduled_at', [$today->startOfDay(), $today->endOfDay()])
                    ->count(),
            ],
            'recentAuditLogs' => AuditLog::query()
                ->with('actor')
                ->latest('created_at')
                ->limit(8)
                ->get(),
        ]);
    }
}
