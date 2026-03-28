<?php

use App\Http\Controllers\AdminAuthController;
use App\Http\Controllers\AdminTwoFactorController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\ComplaintController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PsychologistModerationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\ReviewController;
use App\Http\Controllers\SpecializationController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/admin/login');

Route::prefix('admin')->middleware('admin.ip')->group(function (): void {
    Route::middleware('admin.guest')->group(function (): void {
        Route::get('/login', [AdminAuthController::class, 'create'])->name('login');
        Route::post('/login', [AdminAuthController::class, 'store'])
            ->middleware('throttle:5,1')
            ->name('login.store');

        Route::middleware('admin.2fa.pending')->group(function (): void {
            Route::get('/2fa/challenge', [AdminTwoFactorController::class, 'challenge'])->name('admin.2fa.challenge');
            Route::post('/2fa/challenge', [AdminTwoFactorController::class, 'verifyChallenge'])
                ->middleware('throttle:10,1')
                ->name('admin.2fa.verify');
        });
    });

    Route::middleware('admin.auth')->group(function (): void {
        Route::get('/', DashboardController::class)->name('admin.dashboard');
        Route::post('/logout', [AdminAuthController::class, 'destroy'])->name('logout');

        Route::get('/security/2fa', [AdminTwoFactorController::class, 'security'])->name('admin.security.2fa');
        Route::post('/security/2fa/setup', [AdminTwoFactorController::class, 'beginSetup'])->name('admin.security.2fa.setup');
        Route::post('/security/2fa/enable', [AdminTwoFactorController::class, 'enable'])->name('admin.security.2fa.enable');
        Route::post('/security/2fa/disable', [AdminTwoFactorController::class, 'disable'])->name('admin.security.2fa.disable');

        Route::get('/users', [UserController::class, 'index'])->name('admin.users.index');
        Route::patch('/users/{user}/status', [UserController::class, 'updateStatus'])->name('admin.users.status');

        Route::get('/psychologists', [PsychologistModerationController::class, 'index'])->name('admin.psychologists.index');
        Route::get('/psychologists/{psychologistProfile}', [PsychologistModerationController::class, 'show'])->name('admin.psychologists.show');
        Route::patch('/psychologists/{psychologistProfile}', [PsychologistModerationController::class, 'update'])->name('admin.psychologists.update');

        Route::get('/specializations', [SpecializationController::class, 'index'])->name('admin.specializations.index');
        Route::post('/specializations', [SpecializationController::class, 'store'])->name('admin.specializations.store');
        Route::patch('/specializations/{specialization}', [SpecializationController::class, 'update'])->name('admin.specializations.update');
        Route::delete('/specializations/{specialization}', [SpecializationController::class, 'destroy'])->name('admin.specializations.destroy');

        Route::get('/reviews', [ReviewController::class, 'index'])->name('admin.reviews.index');
        Route::patch('/reviews/{review}', [ReviewController::class, 'update'])->name('admin.reviews.update');

        Route::get('/reports', [ReportController::class, 'index'])->name('admin.reports.index');

        Route::get('/complaints', [ComplaintController::class, 'index'])->name('admin.complaints.index');
        Route::get('/complaints/{complaint}', [ComplaintController::class, 'show'])->name('admin.complaints.show');
        Route::patch('/complaints/{complaint}', [ComplaintController::class, 'update'])->name('admin.complaints.update');

        Route::get('/payments', [PaymentController::class, 'index'])->name('admin.payments.index');
        Route::get('/audit-logs', [AuditLogController::class, 'index'])->name('admin.audit.index');
    });
});
