<?php

use Symfony\Component\HttpFoundation\Request as SymfonyRequest;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use App\Http\Middleware\EnsureAdminAuthenticated;
use App\Http\Middleware\EnsurePendingAdminTwoFactorChallenge;
use App\Http\Middleware\GenerateRequestId;
use App\Http\Middleware\RedirectIfAdminAuthenticated;
use App\Http\Middleware\RestrictAdminAccessByIp;
use App\Http\Middleware\ShareAdminContext;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $trustedProxies = array_values(array_filter(array_map(
            static fn (string $value): string => trim($value),
            explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1,172.16.0.0/12'))
        )));

        $middleware->trustProxies(
            at: $trustedProxies,
            headers: SymfonyRequest::HEADER_X_FORWARDED_FOR
        );

        $middleware->web(append: [
            GenerateRequestId::class,
            ShareAdminContext::class,
        ]);

        $middleware->alias([
            'admin.auth' => EnsureAdminAuthenticated::class,
            'admin.guest' => RedirectIfAdminAuthenticated::class,
            'admin.ip' => RestrictAdminAccessByIp::class,
            'admin.2fa.pending' => EnsurePendingAdminTwoFactorChallenge::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
