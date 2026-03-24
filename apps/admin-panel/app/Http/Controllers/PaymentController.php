<?php

namespace App\Http\Controllers;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PaymentController extends Controller
{
    public function index(Request $request): View
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'max:64'],
            'provider' => ['nullable', 'string', 'max:64'],
            'q' => ['nullable', 'string', 'max:255'],
        ]);

        $query = Payment::query()
            ->with([
                'consultation.client.clientProfile',
                'consultation.psychologist.psychologistProfile',
            ]);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['provider'])) {
            $query->where('provider', $filters['provider']);
        }

        if (! empty($filters['q'])) {
            $search = trim($filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('id', 'ilike', "%{$search}%")
                    ->orWhere('provider_payment_id', 'ilike', "%{$search}%")
                    ->orWhereHas('consultation.client', fn ($clientQuery) => $clientQuery->where('email', 'ilike', "%{$search}%"))
                    ->orWhereHas('consultation.psychologist', fn ($psychologistQuery) => $psychologistQuery->where('email', 'ilike', "%{$search}%"));
            });
        }

        return view('payments.index', [
            'payments' => $query
                ->latest('created_at')
                ->paginate(15)
                ->withQueryString(),
            'filters' => $filters,
        ]);
    }
}
