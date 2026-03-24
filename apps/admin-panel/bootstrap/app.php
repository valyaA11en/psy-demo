<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\EnsureAdminAuthenticated;
use App\Http\Middleware\RedirectIfAdminAuthenticated;
use App\Http\Middleware\ShareAdminContext;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            ShareAdminContext::class,
        ]);

        $middleware->alias([
            'admin.auth' => EnsureAdminAuthenticated::class,
            'admin.guest' => RedirectIfAdminAuthenticated::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
