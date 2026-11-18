import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import { isUUID } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { Model, mongo } from 'mongoose';
import ms from 'ms';
import { AllConfigType } from '../config/config.type';
import { MailService } from '../mail/mail.service';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ProfileDto } from './dto/profile.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { Account, AccountStatus } from './persistence/account.schema';
import { Session } from './persistence/session.schema';
import { JwtPayloadType } from './strategies/types/jwt-payload.type';
import { JwtRefreshPayloadType } from './strategies/types/jwt-refresh-payload.type';

const dummyPasswordHash = bcrypt.hashSync('unused-login-password', 10);

type EmailLink = {
  purpose: 'confirm-email' | 'change-email';
  sub: string;
  email: string;
  authVersion: number;
  newEmail?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  async validateLogin(dto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    const account = await this.accounts
      .findOne({ email: dto.email })
      .select('+passwordHash')
      .exec();
    const valid = await bcrypt.compare(
      dto.password,
      account?.passwordHash ?? dummyPasswordHash,
    );
    if (!account || !valid || account.status !== AccountStatus.Active) {
      throw this.invalid('password', 'incorrectEmailOrPassword');
    }

    const session = await this.sessions.create({
      accountId: account._id,
      authVersion: account.authVersion,
      hash: randomBytes(32).toString('hex'),
      expiresAt: this.refreshExpiry(),
    });
    return {
      ...(await this.issueTokens(account, session)),
      user: ProfileDto.fromAccount(account),
    };
  }

  async register(dto: AuthRegisterLoginDto): Promise<void> {
    const { email, firstName, lastName, password } = dto;
    let account: Account;
    try {
      account = await this.accounts.create({
        email,
        firstName,
        lastName,
        passwordHash: await bcrypt.hash(password, 10),
      });
    } catch (error: unknown) {
      if (!this.isDuplicateEmail(error)) throw error;
      const pending = await this.accounts
        .findOne({ email, status: AccountStatus.Pending })
        .select('+passwordHash')
        .exec();
      const matches = await bcrypt.compare(
        password,
        pending?.passwordHash ?? dummyPasswordHash,
      );
      if (!pending || !matches) return;
      account = pending;
    }

    const hash = await this.signEmailLink({
      purpose: 'confirm-email',
      sub: account._id,
      email: account.email,
      authVersion: account.authVersion,
    });
    await this.mail.userSignUp({ to: account.email, data: { hash } });
  }

  async confirmEmail(hash: string): Promise<void> {
    const link = await this.readEmailLink(hash, 'confirm-email');
    const result = await this.accounts.updateOne(
      {
        _id: link.sub,
        email: link.email,
        authVersion: link.authVersion,
        status: AccountStatus.Pending,
      },
      { $set: { status: AccountStatus.Active } },
    );
    if (!result.modifiedCount) throw this.invalid('hash', 'invalidHash');
  }

  async confirmNewEmail(hash: string): Promise<void> {
    const link = await this.readEmailLink(hash, 'change-email');
    if (!link.newEmail) throw this.invalid('hash', 'invalidHash');
    try {
      const result = await this.accounts.updateOne(
        {
          _id: link.sub,
          email: link.email,
          authVersion: link.authVersion,
          status: AccountStatus.Active,
        },
        { $set: { email: link.newEmail }, $inc: { authVersion: 1 } },
      );
      if (!result.modifiedCount) throw this.invalid('hash', 'invalidHash');
    } catch (error: unknown) {
      if (this.isDuplicateEmail(error))
        throw this.invalid('email', 'emailAlreadyExists');
      throw error;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const account = await this.accounts
      .findOne({ email, status: AccountStatus.Active })
      .select('+passwordHash')
      .exec();
    if (!account) return;

    const expiresIn = this.configService.getOrThrow('auth.forgotExpires', {
      infer: true,
    });
    const hash = await this.jwt.signAsync(
      { sub: account._id },
      { secret: this.forgotSecret(account), expiresIn },
    );
    await this.mail.forgotPassword({
      to: email,
      data: { hash, tokenExpires: Date.now() + ms(expiresIn) },
    });
  }

  async resetPassword(hash: string, password: string): Promise<void> {
    const claims = this.jwt.decode<{ sub?: string } | null>(hash);
    if (!claims?.sub || !isUUID(claims.sub, '7'))
      throw this.invalid('hash', 'invalidHash');
    const account = await this.accounts
      .findOne({ _id: claims.sub, status: AccountStatus.Active })
      .select('+passwordHash')
      .exec();
    if (!account) throw this.invalid('hash', 'invalidHash');
    try {
      await this.jwt.verifyAsync(hash, {
        secret: this.forgotSecret(account),
        algorithms: ['HS256'],
      });
    } catch {
      throw this.invalid('hash', 'invalidHash');
    }

    // Compare-and-swap makes parallel uses of the same link mutually exclusive.
    const changed = await this.accounts.updateOne(
      {
        _id: account._id,
        authVersion: account.authVersion,
        status: AccountStatus.Active,
      },
      {
        $set: { passwordHash: await bcrypt.hash(password, 10) },
        $inc: { authVersion: 1 },
      },
    );
    if (!changed.modifiedCount) throw this.invalid('hash', 'invalidHash');
  }

  async activeSession(
    sessionId: string,
    accountId?: string,
  ): Promise<{ profile: ProfileDto; mfaVerifiedAt?: Date }> {
    const session = await this.sessions
      .findOne({ _id: sessionId, expiresAt: { $gt: new Date() } })
      .exec();
    if (!session || (accountId && session.accountId !== accountId))
      throw new UnauthorizedException();
    const account = await this.activeAccount(session);
    return {
      profile: ProfileDto.fromAccount(account),
      ...(session.mfaVerifiedAt
        ? { mfaVerifiedAt: session.mfaVerifiedAt }
        : {}),
    };
  }

  async update(id: string, dto: AuthUpdateDto): Promise<ProfileDto> {
    const account = await this.accounts
      .findOne({ _id: id, status: AccountStatus.Active })
      .select('+passwordHash')
      .exec();
    if (!account) throw new UnauthorizedException();

    const newEmail = dto.email !== account.email ? dto.email : undefined;
    if (
      (newEmail || dto.password) &&
      (!dto.oldPassword ||
        !(await bcrypt.compare(dto.oldPassword, account.passwordHash)))
    ) {
      throw this.invalid('oldPassword', 'incorrectOldPassword');
    }
    if (newEmail && (await this.accounts.exists({ email: newEmail }))) {
      throw this.invalid('email', 'emailAlreadyExists');
    }

    const names: Partial<Pick<Account, 'firstName' | 'lastName'>> = {};
    if (dto.firstName !== undefined) names.firstName = dto.firstName;
    if (dto.lastName !== undefined) names.lastName = dto.lastName;

    let updated = account;
    if (dto.password || Object.keys(names).length) {
      const change = dto.password
        ? {
            $set: {
              ...names,
              passwordHash: await bcrypt.hash(dto.password, 10),
            },
            $inc: { authVersion: 1 },
          }
        : { $set: names };
      const result = await this.accounts
        .findOneAndUpdate(
          {
            _id: id,
            authVersion: account.authVersion,
            status: AccountStatus.Active,
          },
          change,
          { new: true },
        )
        .exec();
      if (!result) throw new UnauthorizedException();
      updated = result;
    }

    if (newEmail) {
      const hash = await this.signEmailLink({
        purpose: 'change-email',
        sub: id,
        email: account.email,
        authVersion: updated.authVersion,
        newEmail,
      });
      await this.mail.confirmNewEmail({ to: newEmail, data: { hash } });
    }

    return ProfileDto.fromAccount(updated);
  }

  async refreshToken(data: JwtRefreshPayloadType): Promise<RefreshResponseDto> {
    const session = await this.sessions
      .findOneAndUpdate(
        {
          _id: data.sessionId,
          hash: data.hash,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            hash: randomBytes(32).toString('hex'),
            expiresAt: this.refreshExpiry(),
          },
        },
        { new: true },
      )
      .exec();
    if (!session) throw new UnauthorizedException();
    return this.issueTokens(await this.activeAccount(session), session);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.deleteOne({ _id: sessionId });
  }

  async logoutAll(accountId: string): Promise<void> {
    const revoked = await this.accounts.updateOne(
      { _id: accountId, status: AccountStatus.Active },
      { $inc: { authVersion: 1 } },
    );
    if (!revoked.modifiedCount) throw new UnauthorizedException();
    await this.sessions.deleteMany({ accountId });
  }

  private async activeAccount(session: Session): Promise<Account> {
    const account = await this.accounts
      .findOne({
        _id: session.accountId,
        authVersion: session.authVersion,
        status: AccountStatus.Active,
      })
      .exec();
    if (!account) throw new UnauthorizedException();
    return account;
  }

  private refreshExpiry(): Date {
    const lifetime = this.configService.getOrThrow('auth.refreshExpires', {
      infer: true,
    });
    return new Date(Date.now() + ms(lifetime));
  }

  private async issueTokens(
    account: Account,
    session: Session,
  ): Promise<RefreshResponseDto> {
    const access: JwtPayloadType = {
      id: account._id,
      role: account.role,
      sessionId: session._id,
    };
    const refresh: JwtRefreshPayloadType = {
      sessionId: session._id,
      hash: session.hash,
    };
    const expiresIn = this.configService.getOrThrow('auth.expires', {
      infer: true,
    });
    const tokenExpires = Date.now() + ms(expiresIn);
    const [token, refreshToken] = await Promise.all([
      this.jwt.signAsync(access, {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
        expiresIn,
      }),
      this.jwt.signAsync(refresh, {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.refreshExpires', {
          infer: true,
        }),
      }),
    ]);
    return { token, refreshToken, tokenExpires };
  }

  private signEmailLink(link: EmailLink): Promise<string> {
    return this.jwt.signAsync(link, {
      secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
        infer: true,
      }),
      expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
        infer: true,
      }),
    });
  }

  private async readEmailLink(
    hash: string,
    purpose: EmailLink['purpose'],
  ): Promise<EmailLink> {
    try {
      const link = await this.jwt.verifyAsync<EmailLink>(hash, {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
        algorithms: ['HS256'],
      });
      if (link.purpose === purpose) return link;
    } catch {
      throw this.invalid('hash', 'invalidHash');
    }
    throw this.invalid('hash', 'invalidHash');
  }

  private forgotSecret(account: Account): string {
    const secret = this.configService.getOrThrow('auth.forgotSecret', {
      infer: true,
    });
    return `${secret}:${account.passwordHash}:${account.authVersion}`;
  }

  private isDuplicateEmail(error: unknown): boolean {
    return error instanceof mongo.MongoServerError && error.code === 11000;
  }

  private invalid(field: string, error: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      status: 422,
      errors: { [field]: error },
    });
  }
}
