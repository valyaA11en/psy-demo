<?php

namespace App\Support;

use App\Models\User;
use RuntimeException;

class AdminTwoFactorService
{
    private const OTP_DIGITS = 6;
    private const OTP_PERIOD = 30;
    private const OTP_WINDOW = 1;
    private const SECRET_BYTES = 20;
    private const RECOVERY_CODE_COUNT = 8;
    private const RECOVERY_CODE_SEGMENT_LENGTH = 4;
    private const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    private const AES_CIPHER = 'aes-256-gcm';

    public function generateSecret(): string
    {
        return $this->base32Encode(random_bytes(self::SECRET_BYTES));
    }

    public function formatSecretForDisplay(string $secret): string
    {
        return trim(chunk_split($secret, self::RECOVERY_CODE_SEGMENT_LENGTH, ' '));
    }

    public function buildOtpAuthUri(User $user, string $secret): string
    {
        $issuer = (string) config('app.admin_2fa_issuer', config('app.name', 'ConsultationsAdmin'));
        $label = rawurlencode($issuer.':'.$user->email);

        return sprintf(
            'otpauth://totp/%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d',
            $label,
            $secret,
            rawurlencode($issuer),
            self::OTP_DIGITS,
            self::OTP_PERIOD,
        );
    }

    public function verifyTotp(string $secret, string $code, ?int $timestamp = null): bool
    {
        $normalized = preg_replace('/\D+/', '', $code) ?? '';

        if (strlen($normalized) !== self::OTP_DIGITS) {
            return false;
        }

        $time = $timestamp ?? time();

        for ($offset = -self::OTP_WINDOW; $offset <= self::OTP_WINDOW; $offset++) {
            if (hash_equals($this->generateCodeAt($secret, $time + ($offset * self::OTP_PERIOD)), $normalized)) {
                return true;
            }
        }

        return false;
    }

    public function generateCodeAt(string $secret, int $timestamp): string
    {
        $counter = intdiv($timestamp, self::OTP_PERIOD);
        $counterBytes = pack('N2', ($counter >> 32) & 0xffffffff, $counter & 0xffffffff);
        $hash = hash_hmac('sha1', $counterBytes, $this->base32Decode($secret), true);

        $offset = ord($hash[19]) & 0x0f;
        $binary = ((ord($hash[$offset]) & 0x7f) << 24)
            | ((ord($hash[$offset + 1]) & 0xff) << 16)
            | ((ord($hash[$offset + 2]) & 0xff) << 8)
            | (ord($hash[$offset + 3]) & 0xff);

        $otp = $binary % (10 ** self::OTP_DIGITS);

        return str_pad((string) $otp, self::OTP_DIGITS, '0', STR_PAD_LEFT);
    }

    /**
     * @return array<int, string>
     */
    public function generateRecoveryCodes(): array
    {
        $codes = [];

        for ($index = 0; $index < self::RECOVERY_CODE_COUNT; $index++) {
            $left = $this->randomAlphabetSegment();
            $right = $this->randomAlphabetSegment();
            $codes[] = $left.'-'.$right;
        }

        return $codes;
    }

    public function hashRecoveryCode(string $code): string
    {
        return hash_hmac('sha256', $this->normalizeRecoveryCode($code), $this->recoveryPepper());
    }

    public function encryptSecret(string $secret): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt(
            $secret,
            self::AES_CIPHER,
            $this->encryptionKey(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
        );

        if (! is_string($ciphertext) || $tag === '') {
            throw new RuntimeException('Unable to encrypt 2FA secret.');
        }

        return base64_encode($iv.$tag.$ciphertext);
    }

    public function decryptSecret(string $payload): string
    {
        $decoded = base64_decode($payload, true);

        if (! is_string($decoded) || strlen($decoded) < 29) {
            throw new RuntimeException('Invalid encrypted 2FA secret payload.');
        }

        $iv = substr($decoded, 0, 12);
        $tag = substr($decoded, 12, 16);
        $ciphertext = substr($decoded, 28);

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::AES_CIPHER,
            $this->encryptionKey(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
        );

        if (! is_string($plaintext) || $plaintext === '') {
            throw new RuntimeException('Unable to decrypt 2FA secret.');
        }

        return $plaintext;
    }

    private function randomAlphabetSegment(): string
    {
        $segment = '';
        $maxIndex = strlen(self::RECOVERY_ALPHABET) - 1;

        for ($index = 0; $index < self::RECOVERY_CODE_SEGMENT_LENGTH; $index++) {
            $segment .= self::RECOVERY_ALPHABET[random_int(0, $maxIndex)];
        }

        return $segment;
    }

    private function normalizeRecoveryCode(string $code): string
    {
        return strtoupper(preg_replace('/[^A-Z0-9]+/i', '', $code) ?? '');
    }

    private function encryptionKey(): string
    {
        $raw = (string) (config('app.admin_2fa_encryption_key') ?: config('app.key'));

        if ($raw === '') {
            throw new RuntimeException('ADMIN_2FA_ENCRYPTION_KEY or APP_KEY must be configured.');
        }

        if (str_starts_with($raw, 'base64:')) {
            $decoded = base64_decode(substr($raw, 7), true);

            if (is_string($decoded) && $decoded !== '') {
                return strlen($decoded) === 32 ? $decoded : hash('sha256', $decoded, true);
            }
        }

        return hash('sha256', $raw, true);
    }

    private function recoveryPepper(): string
    {
        return (string) (config('app.admin_2fa_recovery_pepper') ?: config('app.key') ?: 'admin-2fa-recovery');
    }

    private function base32Encode(string $data): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $binary = '';

        foreach (str_split($data) as $char) {
            $binary .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }

        $chunks = str_split($binary, 5);
        $encoded = '';

        foreach ($chunks as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $encoded .= $alphabet[bindec($chunk)];
        }

        return $encoded;
    }

    private function base32Decode(string $secret): string
    {
        $alphabet = array_flip(str_split('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'));
        $normalized = strtoupper(preg_replace('/[^A-Z2-7]+/', '', $secret) ?? '');

        if ($normalized === '') {
            throw new RuntimeException('Invalid 2FA secret.');
        }

        $binary = '';

        foreach (str_split($normalized) as $char) {
            if (! array_key_exists($char, $alphabet)) {
                throw new RuntimeException('Invalid 2FA secret.');
            }

            $binary .= str_pad(decbin($alphabet[$char]), 5, '0', STR_PAD_LEFT);
        }

        $bytes = str_split($binary, 8);
        $decoded = '';

        foreach ($bytes as $byte) {
            if (strlen($byte) < 8) {
                continue;
            }

            $decoded .= chr(bindec($byte));
        }

        return $decoded;
    }
}
