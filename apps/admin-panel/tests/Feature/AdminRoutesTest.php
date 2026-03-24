<?php

namespace Tests\Feature;

use Tests\TestCase;

class AdminRoutesTest extends TestCase
{
    protected function tearDown(): void
    {
        config(['app.admin_allowed_ips' => '']);

        parent::tearDown();
    }

    public function test_root_redirects_to_admin_login(): void
    {
        $response = $this->get('/');

        $response->assertRedirect('/admin/login');
    }

    public function test_admin_login_page_is_available_for_guest(): void
    {
        $response = $this->get('/admin/login');

        $response->assertOk();
        $response->assertSee('Email');
    }

    public function test_admin_dashboard_redirects_guest_to_login(): void
    {
        $response = $this->get('/admin');

        $response->assertRedirect(route('login'));
    }

    public function test_admin_login_is_blocked_for_ip_outside_allowlist(): void
    {
        config(['app.admin_allowed_ips' => '127.0.0.1']);

        $response = $this
            ->withHeader('X-Forwarded-For', '10.10.10.10')
            ->get('/admin/login');

        $response->assertForbidden();
    }
}
