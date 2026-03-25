<?php

namespace App\Http\Controllers;

use App\Models\Specialization;
use App\Support\AdminAuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

class SpecializationController extends Controller
{
    public function __construct(private readonly AdminAuditLogger $auditLogger)
    {
    }

    public function index(Request $request): View
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'in:active,inactive'],
        ]);

        $query = Specialization::query()->withCount('psychologists');

        if (! empty($filters['q'])) {
            $search = trim($filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('name', 'ilike', "%{$search}%")
                    ->orWhere('slug', 'ilike', "%{$search}%");
            });
        }

        if (($filters['status'] ?? null) === 'active') {
            $query->where('is_active', true);
        }

        if (($filters['status'] ?? null) === 'inactive') {
            $query->where('is_active', false);
        }

        return view('specializations.index', [
            'specializations' => $query
                ->orderByDesc('is_active')
                ->orderBy('name')
                ->paginate(12)
                ->withQueryString(),
            'filters' => $filters,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $payload = $this->validatePayload($request);
        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $specialization = Specialization::query()->create($payload);

        $this->auditLogger->log(
            $admin,
            'admin.specializations.create',
            'specialization',
            $specialization->id,
            [
                'slug' => $specialization->slug,
                'is_active' => $specialization->is_active,
            ],
            $request,
        );

        return redirect()
            ->route('admin.specializations.index')
            ->with('success', 'Специализация создана.');
    }

    public function update(Request $request, Specialization $specialization): RedirectResponse
    {
        $payload = $this->validatePayload($request, $specialization);
        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $before = [
            'name' => $specialization->name,
            'slug' => $specialization->slug,
            'is_active' => $specialization->is_active,
        ];

        $specialization->fill($payload);
        $specialization->save();

        $this->auditLogger->log(
            $admin,
            'admin.specializations.update',
            'specialization',
            $specialization->id,
            [
                'from' => $before,
                'to' => [
                    'name' => $specialization->name,
                    'slug' => $specialization->slug,
                    'is_active' => $specialization->is_active,
                ],
            ],
            $request,
        );

        return back()->with('success', 'Специализация обновлена.');
    }

    public function destroy(Request $request, Specialization $specialization): RedirectResponse
    {
        $admin = $this->admin($request);

        if (! $admin) {
            abort(403);
        }

        $specialization->loadCount('psychologists');

        if ($specialization->psychologists_count > 0) {
            return back()->with('error', 'Нельзя удалить специализацию, которая уже назначена психологам.');
        }

        $snapshot = [
            'name' => $specialization->name,
            'slug' => $specialization->slug,
            'is_active' => $specialization->is_active,
        ];

        $specializationId = $specialization->id;
        $specialization->delete();

        $this->auditLogger->log(
            $admin,
            'admin.specializations.delete',
            'specialization',
            $specializationId,
            $snapshot,
            $request,
        );

        return back()->with('success', 'Специализация удалена.');
    }

    /**
     * @return array{name: string, slug: string, is_active: bool}
     */
    private function validatePayload(Request $request, ?Specialization $specialization = null): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:128'],
            'slug' => [
                'required',
                'string',
                'min:2',
                'max:128',
                'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('specializations', 'slug')->ignore($specialization?->id),
            ],
            'is_active' => ['nullable', 'in:0,1'],
        ]);

        return [
            'name' => trim($validated['name']),
            'slug' => strtolower(trim($validated['slug'])),
            'is_active' => ($validated['is_active'] ?? '1') === '1',
        ];
    }
}
