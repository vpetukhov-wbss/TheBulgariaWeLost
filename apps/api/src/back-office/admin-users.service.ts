import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isEmail, isUUID } from 'class-validator';
import { Model, type ClientSession } from 'mongoose';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { activeSanctionFilter, isSanctioned } from '../auth/account-access';
import { Account, AccountStatus } from '../auth/persistence/account.schema';
import type { AllConfigType } from '../config/config.type';
import type {
  AccountSanctionDto,
  AccountSanctionPageDto,
  AccountSanctionsQueryDto,
  AdminUserDetailDto,
  AdminUserPageDto,
  AdminUserQueryDto,
  AdminUserSummaryDto,
} from './admin-users.dto';
import { AccountSanction } from './persistence/account-sanction.schema';

const summaryFields =
  '_id firstName lastName displayName role status createdAt activeSanction';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(AccountSanction.name)
    private readonly sanctions: Model<AccountSanction>,
    private readonly config: ConfigService<AllConfigType>,
  ) {}

  static etag(user: AdminUserDetailDto): string {
    const hash = createHash('sha256')
      .update(JSON.stringify(user))
      .digest('hex');
    return '"account-' + hash + '"';
  }

  async list(query: AdminUserQueryDto): Promise<AdminUserPageDto> {
    const email = query.q?.trim().toLowerCase() || undefined;
    if (email && !isEmail(email)) {
      throw new BadRequestException({ code: 'invalid_user_search' });
    }
    const limit = query.limit ?? 25;
    const filters = [email, query.role, query.status];
    const now = new Date();
    const status =
      query.status === 'Banned'
        ? activeSanctionFilter(now)
        : query.status
          ? { status: query.status, $nor: [activeSanctionFilter(now)] }
          : {};
    const after = query.cursor
      ? this.readCursor(query.cursor, filters)
      : undefined;
    const accounts = await this.accounts
      .find({
        ...(after ? { _id: { $lt: after } } : {}),
        ...(email ? { email } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...status,
      })
      .select(summaryFields)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const items = accounts
      .slice(0, limit)
      .map((account) => this.summary(account, now));
    return {
      items,
      ...(accounts.length > limit
        ? { nextCursor: this.cursor(items[limit - 1].id, filters) }
        : {}),
    };
  }

  async get(id: string): Promise<AdminUserDetailDto> {
    const account = await this.accounts
      .findById(id)
      .select(summaryFields + ' email mfaEnabled adminVersion bio')
      .exec();
    if (!account) throw new NotFoundException({ code: 'account_not_found' });
    return this.present(account, new Date());
  }

  async present(
    account: Account,
    now: Date,
    session?: ClientSession,
  ): Promise<AdminUserDetailDto> {
    const activeId = isSanctioned(account, now)
      ? account.activeSanction?.id
      : undefined;
    const active = activeId
      ? await this.sanctions
          .findOne({ _id: activeId, userId: account._id })
          .session(session ?? null)
          .exec()
      : null;
    const [local, domain] = account.email.split('@');
    return {
      ...this.summary(account, now),
      mfaEnabled: account.mfaEnabled,
      version: account.adminVersion,
      ...(account.bio !== undefined ? { bio: account.bio } : {}),
      ...(active ? { activeSanction: this.sanction(active) } : {}),
      ...(account.status === AccountStatus.Active && local && domain
        ? { verifiedContactMasked: local[0] + '***@' + domain[0] + '***' }
        : {}),
    };
  }

  async listSanctions(
    userId: string,
    query: AccountSanctionsQueryDto,
  ): Promise<AccountSanctionPageDto> {
    if (!(await this.accounts.exists({ _id: userId }).exec())) {
      throw new NotFoundException({ code: 'account_not_found' });
    }
    const limit = query.limit ?? 25;
    const filters = ['account-sanctions', userId];
    const after = query.cursor
      ? this.readCursor(query.cursor, filters)
      : undefined;
    const records = await this.sanctions
      .find({ userId, ...(after ? { _id: { $lt: after } } : {}) })
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const items = records
      .slice(0, limit)
      .map((record) => this.sanction(record));
    return {
      items,
      ...(records.length > limit
        ? { nextCursor: this.cursor(items[limit - 1].id, filters) }
        : {}),
    };
  }

  async getSanction(userId: string, id: string): Promise<AccountSanctionDto> {
    const record = await this.sanctions.findOne({ _id: id, userId }).exec();
    if (!record) throw new NotFoundException({ code: 'sanction_not_found' });
    return this.sanction(record);
  }

  sanction(record: AccountSanction): AccountSanctionDto {
    return {
      id: record._id,
      userId: record.userId,
      issuedByUserId: record.issuedByUserId,
      reason: record.reason,
      startsAtUtc: record.startsAt.toISOString(),
      expiresAtUtc: record.expiresAt?.toISOString() ?? null,
      ...(record.revokedAt
        ? {
            revokedAtUtc: record.revokedAt.toISOString(),
            revokedByUserId: record.revokedByUserId,
            revokeReason: record.revokeReason,
          }
        : {}),
    };
  }

  private summary(account: Account, now: Date): AdminUserSummaryDto {
    return {
      id: account._id,
      displayName:
        account.displayName ??
        [account.firstName, account.lastName].join(' ').trim(),
      role: account.role,
      status: isSanctioned(account, now) ? 'Banned' : account.status,
      ...(account.createdAt
        ? { createdAtUtc: account.createdAt.toISOString() }
        : {}),
    };
  }

  private cursor(id: string, filters: (string | undefined)[]): string {
    const key = this.config.getOrThrow('auth.secret', { infer: true });
    const signature = createHmac('sha256', key)
      .update(JSON.stringify(['admin-user-page', id, ...filters]))
      .digest('base64url');
    return id + '.' + signature;
  }

  private readCursor(value: string, filters: (string | undefined)[]): string {
    const [id] = value.split('.');
    const actual = Buffer.from(value);
    const expected = Buffer.from(this.cursor(id, filters));
    if (
      !isUUID(id, '7') ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new BadRequestException({ code: 'invalid_cursor' });
    }
    return id;
  }
}
