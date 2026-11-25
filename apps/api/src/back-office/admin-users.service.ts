import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isEmail, isUUID } from 'class-validator';
import { Model } from 'mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Account, AccountStatus } from '../auth/persistence/account.schema';
import type { AllConfigType } from '../config/config.type';
import type {
  AdminUserDetailDto,
  AdminUserPageDto,
  AdminUserQueryDto,
  AdminUserSummaryDto,
} from './admin-users.dto';

const summaryFields = '_id firstName lastName role status createdAt';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    private readonly config: ConfigService<AllConfigType>,
  ) {}

  async list(query: AdminUserQueryDto): Promise<AdminUserPageDto> {
    const email = query.q?.trim().toLowerCase() || undefined;
    if (email && !isEmail(email)) {
      throw new BadRequestException({ code: 'invalid_user_search' });
    }
    const limit = query.limit ?? 25;
    const filters = [email, query.role, query.status];
    const after = query.cursor
      ? this.readCursor(query.cursor, filters)
      : undefined;
    const accounts = await this.accounts
      .find({
        ...(after ? { _id: { $lt: after } } : {}),
        ...(email ? { email } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
      })
      .select(summaryFields)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();
    const items = accounts
      .slice(0, limit)
      .map((account) => this.summary(account));
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
      .select(summaryFields + ' email mfaEnabled')
      .exec();
    if (!account) throw new NotFoundException({ code: 'account_not_found' });
    const [local, domain] = account.email.split('@');
    return {
      ...this.summary(account),
      mfaEnabled: account.mfaEnabled,
      ...(account.status === AccountStatus.Active && local && domain
        ? { verifiedContactMasked: local[0] + '***@' + domain[0] + '***' }
        : {}),
    };
  }

  private summary(account: Account): AdminUserSummaryDto {
    return {
      id: account._id,
      displayName: [account.firstName, account.lastName].join(' ').trim(),
      role: account.role,
      status: account.status,
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
