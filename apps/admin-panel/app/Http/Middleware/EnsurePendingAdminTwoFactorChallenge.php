<?php

namespace App\Http\Middleware;

use App\Support\AdminSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePendingAdminTwoFactorChallenge
{
    public function __construct(private readonly AdminSession $adminSession)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->adminSession->pendingTwoFactorUser($request)) {
            return redirect()->route('login');
        }

        return $next($request);
    }
}
