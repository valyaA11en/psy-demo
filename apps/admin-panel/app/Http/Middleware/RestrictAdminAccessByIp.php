<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RestrictAdminAccessByIp
{
    public function handle(Request $request, Closure $next): Response
    {
        $allowedIps = collect(explode(',', (string) config('app.admin_allowed_ips', '')))
            ->map(static fn (string $value): string => trim($value))
            ->filter()
            ->values();

        if ($allowedIps->isEmpty()) {
            return $next($request);
        }

        $clientIp = $this->resolveClientIp($request);

        if (! $clientIp || ! $allowedIps->contains($clientIp)) {
            abort(Response::HTTP_FORBIDDEN, 'Access to admin panel is restricted from this IP address.');
        }

        return $next($request);
    }

    private function resolveClientIp(Request $request): ?string
    {
        $ip = $request->ip();

        return is_string($ip) && $ip !== '' ? $ip : null;
    }
}
