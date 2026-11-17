import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Model } from 'mongoose';
import type { AllConfigType } from '../config/config.type';
import { Account, AccountStatus, Role } from './persistence/account.schema';
import { Session } from './persistence/session.schema';

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const recoveryCodes = 10;

@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    private readonly config: ConfigService<AllConfigType>,
  ) {
    this.encryptionKey = createHash('sha256')
      .update(
        config.getOrThrow('auth.mfaEncryptionKey', {
          infer: true,
        }),
      )
      .digest();
  }

  async startEnrollment(
    accountId: string,
    currentPassword: string,
  ): Promise<{ secret: string; provisioningUri: string }> {
    const account = await this.accounts
      .findOne({ _id: accountId, status: AccountStatus.Active })
      .select('+passwordHash +mfaSecretEncrypted')
      .exec();
    this.requireAdministrator(account);
    if (account.mfaEnabled || account.mfaSecretEncrypted) {
      throw new ConflictException({
        code: 'mfa_already_enabled',
        message: 'MFA is already enabled.',
      });
    }
    if (!(await bcrypt.compare(currentPassword, account.passwordHash))) {
      throw this.invalid('currentPassword', 'incorrectPassword');
    }

    const secret = this.base32(randomBytes(20));
    await this.accounts.updateOne(
      { _id: accountId, mfaEnabled: false },
      { $set: { mfaPendingSecretEncrypted: this.encrypt(secret) } },
    );
    const issuer = this.config.getOrThrow('app.name', { infer: true });
    const label = `${issuer}:${account.email}`;
    return {
      secret,
      provisioningUri:
        `otpauth://totp/${encodeURIComponent(label)}` +
        `?secret=${secret}&issuer=${encodeURIComponent(issuer)}` +
        '&algorithm=SHA1&digits=6&period=30',
    };
  }

  async confirmEnrollment(
    accountId: string,
    sessionId: string,
    code: string,
  ): Promise<string[]> {
    const account = await this.accounts
      .findOne({ _id: accountId, status: AccountStatus.Active })
      .select('+mfaPendingSecretEncrypted')
      .exec();
    this.requireAdministrator(account);
    if (!account.mfaPendingSecretEncrypted) {
      throw this.invalid('code', 'mfaEnrollmentMissing');
    }
    const secret = this.decrypt(account.mfaPendingSecretEncrypted);
    const step = this.validStep(secret, code);
    if (step === undefined) throw this.invalid('code', 'invalidMfaCode');

    const plainCodes = Array.from({ length: recoveryCodes }, () =>
      this.formatRecoveryCode(this.base32(randomBytes(10))),
    );
    const result = await this.accounts.updateOne(
      {
        _id: accountId,
        status: AccountStatus.Active,
        mfaEnabled: false,
        mfaPendingSecretEncrypted: account.mfaPendingSecretEncrypted,
      },
      {
        $set: {
          mfaEnabled: true,
          mfaSecretEncrypted: account.mfaPendingSecretEncrypted,
          mfaRecoveryCodeHashes: plainCodes.map((value) =>
            this.recoveryHash(value),
          ),
          mfaLastUsedStep: step,
        },
        $unset: { mfaPendingSecretEncrypted: 1 },
      },
    );
    if (!result.modifiedCount) throw this.invalid('code', 'invalidMfaCode');
    await this.markVerified(accountId, sessionId);
    return plainCodes;
  }

  async verifyTotp(
    accountId: string,
    sessionId: string,
    code: string,
  ): Promise<void> {
    const account = await this.accounts
      .findOne({
        _id: accountId,
        status: AccountStatus.Active,
        mfaEnabled: true,
      })
      .select('+mfaSecretEncrypted +mfaLastUsedStep')
      .exec();
    this.requireAdministrator(account);
    if (!account.mfaSecretEncrypted)
      throw this.invalid('code', 'mfaEnrollmentMissing');
    const step = this.validStep(this.decrypt(account.mfaSecretEncrypted), code);
    if (step === undefined || step <= (account.mfaLastUsedStep ?? -1)) {
      throw this.invalid('code', 'invalidMfaCode');
    }
    const consumed = await this.accounts.updateOne(
      {
        _id: accountId,
        mfaEnabled: true,
        $or: [
          { mfaLastUsedStep: { $lt: step } },
          { mfaLastUsedStep: { $exists: false } },
        ],
      },
      { $set: { mfaLastUsedStep: step } },
    );
    if (!consumed.modifiedCount) throw this.invalid('code', 'invalidMfaCode');
    await this.markVerified(accountId, sessionId);
  }

  async verifyRecoveryCode(
    accountId: string,
    sessionId: string,
    recoveryCode: string,
  ): Promise<void> {
    const hash = this.recoveryHash(recoveryCode);
    const consumed = await this.accounts.updateOne(
      {
        _id: accountId,
        role: Role.Administrator,
        status: AccountStatus.Active,
        mfaEnabled: true,
        mfaRecoveryCodeHashes: hash,
      },
      { $pull: { mfaRecoveryCodeHashes: hash } },
    );
    if (!consumed.modifiedCount) {
      throw this.invalid('recoveryCode', 'invalidRecoveryCode');
    }
    await this.markVerified(accountId, sessionId);
  }

  private async markVerified(
    accountId: string,
    sessionId: string,
  ): Promise<void> {
    const result = await this.sessions.updateOne(
      {
        _id: sessionId,
        accountId,
        expiresAt: { $gt: new Date() },
      },
      { $set: { mfaVerifiedAt: new Date() } },
    );
    if (!result.modifiedCount) throw new UnauthorizedException();
  }

  private requireAdministrator(
    account: Account | null,
  ): asserts account is Account {
    if (!account) throw new UnauthorizedException();
    if (account.role !== Role.Administrator) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Administrator access is required.',
      });
    }
  }

  private validStep(secret: string, code: string): number | undefined {
    const current = Math.floor(Date.now() / 30_000);
    for (const step of [current, current - 1, current + 1]) {
      const expected = Buffer.from(this.totp(secret, step));
      const actual = Buffer.from(code);
      if (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      )
        return step;
    }
    return undefined;
  }

  private totp(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac('sha1', this.base32Decode(secret))
      .update(counter)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      (((digest[offset] & 0x7f) << 24) |
        (digest[offset + 1] << 16) |
        (digest[offset + 2] << 8) |
        digest[offset + 3]) >>>
      0;
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private base32(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += base32Alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits) output += base32Alphabet[(value << (5 - bits)) & 31];
    return output;
  }

  private base32Decode(input: string): Buffer {
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const character of input.toUpperCase().replaceAll('=', '')) {
      const index = base32Alphabet.indexOf(character);
      if (index < 0) throw new Error('Invalid encrypted MFA secret.');
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return ['v1', iv, cipher.getAuthTag(), encrypted]
      .map((part) =>
        typeof part === 'string' ? part : part.toString('base64url'),
      )
      .join('.');
  }

  private decrypt(value: string): string {
    const [version, iv, tag, encrypted] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted)
      throw new Error('Invalid encrypted MFA secret.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private formatRecoveryCode(value: string): string {
    return value.match(/.{1,4}/g)?.join('-') ?? value;
  }

  private recoveryHash(value: string): string {
    const normalized = value.toUpperCase().replaceAll('-', '');
    return createHmac('sha256', this.encryptionKey)
      .update(normalized)
      .digest('hex');
  }

  private invalid(field: string, error: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'invalid_mfa_challenge',
      status: 422,
      errors: { [field]: error },
    });
  }
}
