<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AdminAuditLogger
{
    public function log(
        ?User $actor,
        string $action,
        string $entityType,
        string $entityId,
        array $metadata = [],
        ?Request $request = null,
    ): void {
        AuditLog::query()->create([
            'actor_user_id' => $actor?->id,
            'actor_role' => $actor?->roles->pluck('code')->first(),
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'ip_hash' => $this->hash($request?->ip()),
            'user_agent_hash' => $this->hash($request?->userAgent()),
            'request_id' => $request?->header('x-request-id'),
            'metadata_json' => $metadata,
        ]);
    }

    private function hash(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        return hash('sha256', $value);
    }
}
