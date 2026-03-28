import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TwoFactorService {
  private static readonly OTP_DIGITS = 6;
  private static readonly OTP_PERIOD = 30;
  private static readonly OTP_WINDOW = 1;
  private static readonly SECRET_BYTES = 20;
  private static readonly RECOVERY_CODE_COUNT = 8;
  private static readonly RECOVERY_CODE_SEGMENT_LENGTH = 4;
  private static readonly RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

  constructor(private readonly configService: ConfigService) {}

  generateSecret() {
    return this.base32Encode(randomBytes(TwoFactorService.SECRET_BYTES));
  }

  formatSecretForDisplay(secret: string) {
    return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  }

  buildOtpAuthUri(email: string, secret: string) {
    const issuer = this.issuer();
    const label = encodeURIComponent(`${issuer}:${email}`);

    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TwoFactorService.OTP_DIGITS}&period=${TwoFactorService.OTP_PERIOD}`;
  }

  verifyTotp(secret: string, code: string, timestamp = Date.now()) {
    const normalized = (code ?? "").replace(/\D+/g, "");

    if (normalized.length !== TwoFactorService.OTP_DIGITS) {
      return false;
    }

    const unixTime = Math.floor(timestamp / 1000);

    for (let offset = -TwoFactorService.OTP_WINDOW; offset <= TwoFactorService.OTP_WINDOW; offset += 1) {
      const candidate = this.generateCodeAt(secret, unixTime + offset * TwoFactorService.OTP_PERIOD);

      if (this.safeEquals(candidate, normalized)) {
        return true;
      }
    }

    return false;
  }

  generateRecoveryCodes() {
    return Array.from({ length: TwoFactorService.RECOVERY_CODE_COUNT }, () => {
      const left = this.randomAlphabetSegment();
      const right = this.randomAlphabetSegment();
      return `${left}-${right}`;
    });
  }

  hashRecoveryCode(code: string) {
    return createHash("sha256")
      .update(`${this.recoveryPepper()}:${this.normalizeRecoveryCode(code)}`)
      .digest("hex");
  }

  normalizeRecoveryCode(code: string) {
    return (code ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  }

  encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const key = this.encryptionKey();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, ciphertext]).toString("base64");
  }

  decryptSecret(payload: string) {
    const decoded = Buffer.from(payload, "base64");

    if (decoded.length < 29) {
      throw new InternalServerErrorException("Некорректный секрет 2FA");
    }

    const iv = decoded.subarray(0, 12);
    const tag = decoded.subarray(12, 28);
    const ciphertext = decoded.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  issuer() {
    return this.configService.get<string>("AUTH_2FA_ISSUER", "Consultations");
  }

  private generateCodeAt(secret: string, timestampSeconds: number) {
    const counter = Math.floor(timestampSeconds / TwoFactorService.OTP_PERIOD);
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
    counterBytes.writeUInt32BE(counter >>> 0, 4);

    const hash = createHmac("sha1", this.base32Decode(secret)).update(counterBytes).digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    return String(binary % 10 ** TwoFactorService.OTP_DIGITS).padStart(
      TwoFactorService.OTP_DIGITS,
      "0",
    );
  }

  private encryptionKey() {
    const raw =
      this.configService.get<string>("AUTH_2FA_ENCRYPTION_KEY") ||
      this.configService.get<string>("JWT_REFRESH_SECRET") ||
      this.configService.get<string>("JWT_ACCESS_SECRET");

    if (!raw) {
      throw new InternalServerErrorException("Не настроен ключ шифрования для 2FA");
    }

    if (raw.startsWith("base64:")) {
      const decoded = Buffer.from(raw.slice(7), "base64");
      return decoded.length === 32 ? decoded : createHash("sha256").update(decoded).digest();
    }

    return createHash("sha256").update(raw).digest();
  }

  private recoveryPepper() {
    return (
      this.configService.get<string>("AUTH_2FA_RECOVERY_PEPPER") ||
      this.configService.get<string>("JWT_REFRESH_SECRET") ||
      "consultations-2fa-recovery"
    );
  }

  private randomAlphabetSegment() {
    const maxIndex = TwoFactorService.RECOVERY_ALPHABET.length - 1;
    let output = "";

    for (let index = 0; index < TwoFactorService.RECOVERY_CODE_SEGMENT_LENGTH; index += 1) {
      output += TwoFactorService.RECOVERY_ALPHABET[randomBytes(1)[0] % (maxIndex + 1)];
    }

    return output;
  }

  private base32Encode(value: Buffer) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";

    for (const byte of value) {
      bits += byte.toString(2).padStart(8, "0");
    }

    const chunks = bits.match(/.{1,5}/g) ?? [];

    return chunks
      .map((chunk) => alphabet[parseInt(chunk.padEnd(5, "0"), 2)])
      .join("");
  }

  private base32Decode(secret: string) {
    const alphabet = new Map("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split("").map((char, index) => [char, index]));
    const normalized = secret.toUpperCase().replace(/[^A-Z2-7]+/g, "");

    if (!normalized) {
      throw new InternalServerErrorException("Некорректный секрет 2FA");
    }

    let bits = "";

    for (const char of normalized) {
      const value = alphabet.get(char);

      if (value === undefined) {
        throw new InternalServerErrorException("Некорректный секрет 2FA");
      }

      bits += value.toString(2).padStart(5, "0");
    }

    const bytes = bits.match(/.{1,8}/g) ?? [];

    return Buffer.from(
      bytes
        .filter((byte) => byte.length === 8)
        .map((byte) => parseInt(byte, 2)),
    );
  }

  private safeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
