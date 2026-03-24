<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminAuthenticated
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->attributes->get('adminUser')) {
            return redirect()->route('login');
        }

        return $next($request);
    }
}
