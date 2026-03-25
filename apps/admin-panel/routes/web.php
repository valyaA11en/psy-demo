<?php

use App\Http\Controllers\AdminAuthController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\ComplaintController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PsychologistModerationController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/admin/login');

Route::prefix('admin')->middleware('admin.ip')->group(function (): void {
    Route::middleware('admin.guest')->group(function (): void {
        Route::get('/login', [AdminAuthController::class, 'create'])->name('login');
        Route::post('/login', [AdminAuthController::class, 'store'])
            ->middleware('throttle:5,1')
            ->name('login.store');
    });

    Route::middleware('admin.auth')->group(function (): void {
        Route::get('/', DashboardController::class)->name('admin.dashboard');
        Route::post('/logout', [AdminAuthController::class, 'destroy'])->name('logout');

        Route::get('/users', [UserController::class, 'index'])->name('admin.users.index');
        Route::patch('/users/{user}/status', [UserController::class, 'updateStatus'])->name('admin.users.status');

        Route::get('/psychologists', [PsychologistModerationController::class, 'index'])->name('admin.psychologists.index');
        Route::patch('/psychologists/{psychologistProfile}', [PsychologistModerationController::class, 'update'])->name('admin.psychologists.update');

        Route::get('/complaints', [ComplaintController::class, 'index'])->name('admin.complaints.index');
        Route::get('/complaints/{complaint}', [ComplaintController::class, 'show'])->name('admin.complaints.show');
        Route::patch('/complaints/{complaint}', [ComplaintController::class, 'update'])->name('admin.complaints.update');

        Route::get('/payments', [PaymentController::class, 'index'])->name('admin.payments.index');
        Route::get('/audit-logs', [AuditLogController::class, 'index'])->name('admin.audit.index');
    });
});
