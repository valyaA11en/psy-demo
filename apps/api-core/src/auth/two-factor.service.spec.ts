import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { TwoFactorService } from "./two-factor.service";

describe("TwoFactorService", () => {
  let service: TwoFactorService;

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      switch (key) {
        case "AUTH_2FA_ISSUER":
          return "Consultations";
        case "AUTH_2FA_ENCRYPTION_KEY":
          return "base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
        case "AUTH_2FA_RECOVERY_PEPPER":
          return "recovery-pepper";
        default:
          return defaultValue;
      }
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  it("encrypts and decrypts secrets", () => {
    const secret = service.generateSecret();
    const encrypted = service.encryptSecret(secret);

    expect(encrypted).not.toBe(secret);
    expect(service.decryptSecret(encrypted)).toBe(secret);
  });

  it("verifies valid totp codes", () => {
    const secret = service.generateSecret();
    const timestamp = 1_700_000_000_000;
    const code = (service as any).generateCodeAt(secret, Math.floor(timestamp / 1000));

    expect(service.verifyTotp(secret, code, timestamp)).toBe(true);
    expect(service.verifyTotp(secret, "000000", timestamp)).toBe(false);
  });

  it("builds otpauth uri and hashes recovery codes", () => {
    const secret = service.generateSecret();
    const uri = service.buildOtpAuthUri("psychologist@example.com", secret);
    const codes = service.generateRecoveryCodes();

    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("psychologist%40example.com");
    expect(codes).toHaveLength(8);
    expect(service.hashRecoveryCode(codes[0])).toHaveLength(64);
  });
});
