<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Models\Consultation;
use App\Models\Payment;
use App\Models\PsychologistProfile;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\View\View;

class ReportController extends Controller
{
    public function index(Request $request): View
    {
        $payload = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $to = isset($payload['to'])
            ? CarbonImmutable::parse($payload['to'], 'UTC')->endOfDay()
            : CarbonImmutable::now('UTC')->endOfDay();
        $from = isset($payload['from'])
            ? CarbonImmutable::parse($payload['from'], 'UTC')->startOfDay()
            : $to->subDays(89)->startOfDay();

        if ($from->greaterThan($to)) {
            [$from, $to] = [$to->startOfDay(), $from->endOfDay()];
        }

        $consultations = Consultation::query()
            ->with(['psychologist.psychologistProfile'])
            ->whereBetween('scheduled_at', [$from, $to])
            ->get();

        $payments = Payment::query()
            ->with(['consultation.psychologist.psychologistProfile'])
            ->whereBetween('created_at', [$from, $to])
            ->get();

        $complaints = Complaint::query()
            ->whereBetween('created_at', [$from, $to])
            ->get();

        $newClients = User::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereHas('roles', fn ($query) => $query->where('code', 'client'))
            ->count();

        $newPsychologists = PsychologistProfile::query()
            ->whereBetween('created_at', [$from, $to])
            ->count();

        return view('reports.index', [
            'filters' => [
                'from' => $from->format('Y-m-d'),
                'to' => $to->format('Y-m-d'),
            ],
            'stats' => [
                'consultationsTotal' => $consultations->count(),
                'consultationsCompleted' => $consultations->where('status', 'completed')->count(),
                'consultationsCancelled' => $consultations->where('status', 'cancelled')->count(),
                'paymentsPaidCount' => $payments->where('status', 'paid')->count(),
                'paymentsPaidAmount' => (int) $payments->where('status', 'paid')->sum('amount'),
                'complaintsCreated' => $complaints->count(),
                'newClients' => $newClients,
                'newPsychologists' => $newPsychologists,
            ],
            'consultationStatusBreakdown' => $consultations
                ->groupBy('status')
                ->map(fn (Collection $items) => $items->count())
                ->sortKeys()
                ->all(),
            'paymentStatusBreakdown' => $payments
                ->groupBy('status')
                ->map(fn (Collection $items) => [
                    'count' => $items->count(),
                    'amount' => (int) $items->sum('amount'),
                ])
                ->sortKeys()
                ->all(),
            'monthlyRevenue' => $this->buildMonthlyRevenue($payments, $from, $to),
            'topPsychologists' => $this->buildTopPsychologists($consultations, $payments),
        ]);
    }

    /**
     * @return array<int, array{month: string, revenue: int, paymentsCount: int}>
     */
    private function buildMonthlyRevenue(Collection $payments, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $months = [];
        $cursor = $from->startOfMonth();
        $lastMonth = $to->startOfMonth();

        while ($cursor->lessThanOrEqualTo($lastMonth)) {
            $months[$cursor->format('Y-m')] = [
                'month' => $cursor->translatedFormat('m.Y'),
                'revenue' => 0,
                'paymentsCount' => 0,
            ];
            $cursor = $cursor->addMonth();
        }

        foreach ($payments->where('status', 'paid') as $payment) {
            $date = $payment->paid_at ?? $payment->created_at;

            if (! $date) {
                continue;
            }

            $bucket = $date->copy()->setTimezone('UTC')->format('Y-m');

            if (! array_key_exists($bucket, $months)) {
                continue;
            }

            $months[$bucket]['revenue'] += (int) $payment->amount;
            $months[$bucket]['paymentsCount']++;
        }

        return array_values($months);
    }

    /**
     * @return array<int, array{name: string, email: string, publicSlug: string|null, consultationsTotal: int, consultationsCompleted: int, paidRevenue: int, paidPaymentsCount: int}>
     */
    private function buildTopPsychologists(Collection $consultations, Collection $payments): array
    {
        $rows = [];

        foreach ($consultations as $consultation) {
            $psychologist = $consultation->psychologist;

            if (! $psychologist) {
                continue;
            }

            $id = $psychologist->id;
            $rows[$id] ??= [
                'name' => $psychologist->displayName(),
                'email' => $psychologist->email,
                'publicSlug' => $psychologist->psychologistProfile?->public_slug,
                'consultationsTotal' => 0,
                'consultationsCompleted' => 0,
                'paidRevenue' => 0,
                'paidPaymentsCount' => 0,
            ];

            $rows[$id]['consultationsTotal']++;

            if ($consultation->status === 'completed') {
                $rows[$id]['consultationsCompleted']++;
            }
        }

        foreach ($payments->where('status', 'paid') as $payment) {
            $consultation = $payment->consultation;
            $psychologist = $consultation?->psychologist;

            if (! $psychologist) {
                continue;
            }

            $id = $psychologist->id;
            $rows[$id] ??= [
                'name' => $psychologist->displayName(),
                'email' => $psychologist->email,
                'publicSlug' => $psychologist->psychologistProfile?->public_slug,
                'consultationsTotal' => 0,
                'consultationsCompleted' => 0,
                'paidRevenue' => 0,
                'paidPaymentsCount' => 0,
            ];

            $rows[$id]['paidRevenue'] += (int) $payment->amount;
            $rows[$id]['paidPaymentsCount']++;
        }

        return collect($rows)
            ->sort(function (array $left, array $right): int {
                return [$right['paidRevenue'], $right['consultationsCompleted'], $right['consultationsTotal']]
                    <=> [$left['paidRevenue'], $left['consultationsCompleted'], $left['consultationsTotal']];
            })
            ->take(8)
            ->values()
            ->all();
    }
}
