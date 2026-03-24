<?php

namespace App\Http\Middleware;

use App\Support\AdminSession;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

class ShareAdminContext
{
    public function __construct(private readonly AdminSession $adminSession)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $admin = $this->adminSession->currentUser($request);

        $request->attributes->set('adminUser', $admin);
        View::share('currentAdmin', $admin);

        return $next($request);
    }
}
