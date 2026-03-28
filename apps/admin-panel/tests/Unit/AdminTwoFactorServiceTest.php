<?php

namespace Tests\Unit;

use App\Models\User;
use App\Support\AdminTwoFactorService;
use Tests\TestCase;

class AdminTwoFactorServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.admin_2fa_issuer' => 'ConsultationsAdmin',
            'app.admin_2fa_encryption_key' => 'base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
            'app.admin_2fa_recovery_pepper' => 'test-admin-2fa-pepper',
        ]);
    }

    public function test_totp_code_can_be_generated_and_verified(): void
    {
        $service = new AdminTwoFactorService();
        $secret = 'JBSWY3DPEHPK3PXP';
        $timestamp = 1_700_000_000;
        $code = $service->generateCodeAt($secret, $timestamp);

        $this->assertSame(6, strlen($code));
        $this->assertTrue($service->verifyTotp($secret, $code, $timestamp));
        $this->assertFalse($service->verifyTotp($secret, '000000', $timestamp));
    }

    public function test_secret_encryption_round_trip_is_lossless(): void
    {
        $service = new AdminTwoFactorService();
        $secret = $service->generateSecret();
        $encrypted = $service->encryptSecret($secret);

        $this->assertNotSame($secret, $encrypted);
        $this->assertSame($secret, $service->decryptSecret($encrypted));
    }

    public function test_recovery_codes_are_generated_and_hashed_with_normalization(): void
    {
        $service = new AdminTwoFactorService();
        $codes = $service->generateRecoveryCodes();

        $this->assertCount(8, $codes);
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{4}-[A-Z2-9]{4}$/', $codes[0]);
        $this->assertSame(
            $service->hashRecoveryCode($codes[0]),
            $service->hashRecoveryCode(strtolower(str_replace('-', ' ', $codes[0]))),
        );
    }

    public function test_otpauth_uri_contains_issuer_and_user_email(): void
    {
        $service = new AdminTwoFactorService();
        $user = new User([
            'email' => 'admin@example.com',
        ]);
        $secret = 'JBSWY3DPEHPK3PXP';
        $uri = $service->buildOtpAuthUri($user, $secret);

        $this->assertStringContainsString('otpauth://totp/', $uri);
        $this->assertStringContainsString('ConsultationsAdmin', $uri);
        $this->assertStringContainsString('admin%40example.com', $uri);
        $this->assertStringContainsString('secret='.$secret, $uri);
    }
}
