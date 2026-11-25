import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import {
  Connection,
  Model,
  mongo,
  type ClientSession,
  type HydratedDocument,
} from 'mongoose';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { AuditOutcome, AuditTargetType } from './audit-event.types';
import { availableAccount, isSanctioned } from '../auth/account-access';
import { AuthService } from '../auth/auth.service';
import {
  Account,
  AccountStatus,
  Role,
} from '../auth/persistence/account.schema';
import { Session } from '../auth/persistence/session.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { AllConfigType } from '../config/config.type';
import {
  PublishingAuditEvent,
  PublishingOutboxEvent,
} from '../publishing/persistence/publishing-event.schema';
import type {
  AccountSanctionDto,
  AdminUserDecisionDto,
  AdminUserDetailDto,
  ChangeAdminUserRoleDto,
  CreateAccountSanctionDto,
  EditAdminUserDto,
  PasswordResetAcceptedDto,
  PasswordResetOperationDto,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';
import { AccountSanction } from './persistence/account-sanction.schema';
import { AdministratorAccess } from './persistence/administrator-access.schema';
import { AdminUserCommand } from './persistence/admin-user-command.schema';
import {
  PasswordResetOperation,
  ResetOperationStatus,
} from './persistence/password-reset-operation.schema';

export type AdminUserActor = SignedInAccount & { correlationId: string };

type Change = {
  action: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  revokeSessions?: boolean;
};

type Command = {
  key: string | undefined;
  name: string;
  input: unknown[];
};

function digest(input: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

const passwordResetAction = 'AccountPasswordResetRequested';
const administratorLock = 'active-administrator';
const resetWindowMs = 60 * 60_000;
const maximumResetsPerUser = 3;
const maximumResetsPerAdministrator = 12;
const resetDispatchDeadlineMs = 5 * 60_000;

@Injectable()
export class AdminUserActionsService {
  constructor(
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(AccountSanction.name)
    private readonly sanctions: Model<AccountSanction>,
    @InjectModel(AdministratorAccess.name)
    private readonly adminAccess: Model<AdministratorAccess>,
    @InjectModel(AdminUserCommand.name)
    private readonly commands: Model<AdminUserCommand>,
    @InjectModel(PasswordResetOperation.name)
    private readonly resets: Model<PasswordResetOperation>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
    @InjectModel(PublishingOutboxEvent.name)
    private readonly outbox: Model<PublishingOutboxEvent>,
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<AllConfigType>,
    private readonly users: AdminUsersService,
    private readonly auth: AuthService,
  ) {}

  async edit(
    actor: AdminUserActor,
    id: string,
    ifMatch: string | undefined,
    dto: EditAdminUserDto,
  ): Promise<AdminUserDetailDto> {
    if (!ifMatch)
      throw new HttpException({ code: 'precondition_required' }, 428);
    if (dto.displayName === undefined && dto.bio === undefined) {
      throw new UnprocessableEntityException({
        code: 'profile_fields_required',
      });
    }
    const { detail } = await this.commit(actor, id, ifMatch, (account) => {
      const fields: string[] = [];
      if (dto.displayName !== undefined) {
        account.displayName = dto.displayName.trim();
        fields.push('displayName');
      }
      if (dto.bio !== undefined) {
        account.bio = dto.bio.trim();
        fields.push('bio');
      }
      return { action: 'AccountProfileUpdated', metadata: { fields } };
    });
    return detail;
  }

  async changeRole(
    actor: AdminUserActor,
    id: string,
    key: string | undefined,
    dto: ChangeAdminUserRoleDto,
  ): Promise<AdminUserDetailDto> {
    const reason = this.reason(dto.reason);
    const { detail } = await this.commit(
      actor,
      id,
      dto.expectedVersion,
      async (account, now, session) => {
        if (account.role === dto.role)
          throw new ConflictException({ code: 'role_unchanged' });
        await this.guardAdministratorAccess(actor, account, now, session);
        const previousRole = account.role;
        account.role = dto.role;
        return {
          action: 'AccountRoleChanged',
          reason,
          revokeSessions: true,
          metadata: { previousRole, role: dto.role },
        };
      },
      { key, name: 'role', input: [dto.role, reason] },
    );
    return detail;
  }

  async ban(
    actor: AdminUserActor,
    id: string,
    key: string | undefined,
    dto: CreateAccountSanctionDto,
  ): Promise<AccountSanctionDto> {
    const reason = this.reason(dto.reason);
    const expiresAt =
      dto.expiresAtUtc === null ? null : new Date(dto.expiresAtUtc);
    const { change } = await this.commit(
      actor,
      id,
      dto.expectedVersion,
      async (account, now, session) => {
        if (
          expiresAt &&
          (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)
        ) {
          throw new UnprocessableEntityException({
            code: 'sanction_expiry_invalid',
          });
        }
        if (isSanctioned(account, now))
          throw new ConflictException({ code: 'sanction_already_active' });
        await this.guardAdministratorAccess(actor, account, now, session);
        const [record] = await this.sanctions.create(
          [
            {
              userId: id,
              issuedByUserId: actor.profile.id,
              reason,
              startsAt: now,
              expiresAt,
            },
          ],
          { session },
        );
        account.activeSanction = { id: record._id, expiresAt };
        return {
          action: 'AccountSanctionIssued',
          reason,
          revokeSessions: true,
          metadata: { sanctionId: record._id, expiresAtUtc: dto.expiresAtUtc },
          sanction: this.users.sanction(record),
        };
      },
      { key, name: 'ban', input: [dto.expiresAtUtc, reason] },
    );
    return change.sanction;
  }

  async unban(
    actor: AdminUserActor,
    id: string,
    sanctionId: string,
    key: string | undefined,
    dto: AdminUserDecisionDto,
  ): Promise<AdminUserDetailDto> {
    const reason = this.reason(dto.reason);
    const { detail } = await this.commit(
      actor,
      id,
      dto.expectedVersion,
      async (account, now, session) => {
        const sanction = await this.sanctions
          .findOne({ _id: sanctionId, userId: id })
          .session(session)
          .exec();
        if (!sanction)
          throw new NotFoundException({ code: 'sanction_not_found' });
        if (
          account.activeSanction?.id !== sanctionId ||
          !isSanctioned(account, now) ||
          sanction.revokedAt
        ) {
          throw new ConflictException({ code: 'sanction_inactive' });
        }
        sanction.revokedAt = now;
        sanction.revokedByUserId = actor.profile.id;
        sanction.revokeReason = reason;
        await sanction.save({ session });
        account.activeSanction = undefined;
        return {
          action: 'AccountSanctionRevoked',
          reason,
          metadata: { sanctionId },
        };
      },
      { key, name: 'unban', input: [sanctionId, reason] },
    );
    return detail;
  }

  async revokeSessions(
    actor: AdminUserActor,
    id: string,
    key: string | undefined,
    dto: AdminUserDecisionDto,
  ): Promise<void> {
    const reason = this.reason(dto.reason);
    await this.commit(
      actor,
      id,
      dto.expectedVersion,
      () => ({
        action: 'AccountSessionsRevoked',
        reason,
        revokeSessions: true,
      }),
      { key, name: 'sessions', input: [reason] },
    );
  }

  async requestPasswordReset(
    actor: AdminUserActor,
    id: string,
    key: string | undefined,
    dto: AdminUserDecisionDto,
  ): Promise<PasswordResetAcceptedDto> {
    const reason = this.reason(dto.reason);
    const operationId = uuidv7();
    const metadata = { operationId };
    const { change } = await this.commit(
      actor,
      id,
      dto.expectedVersion,
      async (account, now, session) => {
        if (
          account.status !== AccountStatus.Active ||
          isSanctioned(account, now)
        ) {
          throw new ConflictException({ code: 'account_recovery_unavailable' });
        }
        await this.enforceResetLimit(actor.profile.id, id, now, session);
        await this.resets.create(
          [
            {
              _id: operationId,
              requestedByUserId: actor.profile.id,
              targetId: id,
              targetVersion: account.adminVersion + 1,
              targetAuthVersion: account.authVersion,
              traceId: actor.correlationId,
              status: ResetOperationStatus.Queued,
              requestedAt: now,
            },
          ],
          { session },
        );
        await this.outbox.create(
          [
            {
              eventType: passwordResetAction,
              aggregateId: id,
              aggregateVersion: account.adminVersion + 1,
              occurredAt: now,
              payload: {
                userId: id,
                actorId: actor.profile.id,
                correlationId: actor.correlationId,
                operationId,
              },
            },
          ],
          { session },
        );
        return { action: passwordResetAction, reason, metadata, operationId };
      },
      { key, name: 'password-reset', input: [reason] },
    );

    await this.dispatchPasswordReset(change.operationId);
    return {
      operationId: change.operationId,
      statusUrl: '/api/admin/v1/operations/' + change.operationId,
    };
  }

  async passwordResetOperation(
    actorId: string,
    id: string,
  ): Promise<PasswordResetOperationDto> {
    const operation = await this.resets
      .findOne({ _id: id, requestedByUserId: actorId })
      .exec();
    if (!operation)
      throw new NotFoundException({ code: 'operation_not_found' });
    const expired =
      operation.status === ResetOperationStatus.Running &&
      operation.startedAt &&
      Date.now() - operation.startedAt.getTime() >= resetDispatchDeadlineMs;
    const finishedAt =
      expired && operation.startedAt
        ? new Date(operation.startedAt.getTime() + resetDispatchDeadlineMs)
        : operation.finishedAt;
    return {
      id,
      kind: 'AccountPasswordReset',
      status: expired ? ResetOperationStatus.Failed : operation.status,
      requestedByUserId: operation.requestedByUserId,
      targetId: operation.targetId,
      requestedAtUtc: operation.requestedAt.toISOString(),
      traceId: operation.traceId,
      ...(finishedAt ? { finishedAtUtc: finishedAt.toISOString() } : {}),
    };
  }

  private async dispatchPasswordReset(id: string): Promise<void> {
    // SMTP delivery runs outside the retryable transaction and claims each request once.
    const operation = await this.resets
      .findOneAndUpdate(
        { _id: id, status: ResetOperationStatus.Queued },
        {
          $set: { status: ResetOperationStatus.Running, startedAt: new Date() },
        },
        { new: true },
      )
      .exec();
    if (!operation) return;
    let dispatched: boolean;
    try {
      dispatched = await this.auth.requestPasswordResetForAccount(
        operation.targetId,
        operation.targetAuthVersion,
      );
    } catch {
      dispatched = false;
    }
    const finishedAt = new Date();
    await this.connection.transaction(async (session) => {
      await this.resets
        .updateOne(
          { _id: id, status: ResetOperationStatus.Running },
          {
            $set: {
              status: dispatched
                ? ResetOperationStatus.Succeeded
                : ResetOperationStatus.Failed,
              finishedAt,
            },
          },
          { session },
        )
        .exec();
      await this.audit.create(
        [
          {
            action: dispatched
              ? 'AccountPasswordResetDispatched'
              : 'AccountPasswordResetFailed',
            actorId: operation.requestedByUserId,
            actorRole: Role.Administrator,
            targetType: AuditTargetType.Account,
            outcome: dispatched ? AuditOutcome.Succeeded : AuditOutcome.Failed,
            targetId: operation.targetId,
            targetVersion: operation.targetVersion,
            occurredAt: finishedAt,
            correlationId: operation.traceId,
            metadata: { operationId: id },
          },
        ],
        { session },
      );
    });
  }

  private async commit<T extends Change>(
    actor: AdminUserActor,
    id: string,
    expected: number | string,
    mutate: (
      account: HydratedDocument<Account>,
      now: Date,
      session: ClientSession,
    ) => T | Promise<T>,
    command?: Command,
  ): Promise<{ change: T; detail: AdminUserDetailDto }> {
    const receipt = command
      ? this.commandReceipt(actor, id, expected, command)
      : undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.connection.transaction(async (session) => {
          const now = new Date();
          await this.verifyAdministrator(actor, now, session);
          const account = await this.accounts
            .findById(id)
            .session(session)
            .exec();
          if (!account)
            throw new NotFoundException({ code: 'account_not_found' });
          if (receipt) {
            const replay = await this.commands
              .findById(receipt.id)
              .session(session)
              .exec();
            if (replay) {
              if (replay.requestHash !== receipt.requestHash)
                throw new ConflictException({ code: 'idempotency_key_reused' });
              return {
                detail: replay.response.detail,
                change: replay.response.change as T,
              };
            }
          }
          if (typeof expected === 'number') {
            if (account.adminVersion !== expected)
              throw new ConflictException({ code: 'version_conflict' });
          } else if (
            expected !==
            AdminUsersService.etag(
              await this.users.present(account, now, session),
            )
          ) {
            throw new PreconditionFailedException({ code: 'version_conflict' });
          }
          const change = await mutate(account, now, session);
          account.adminVersion++;
          if (change.revokeSessions) {
            account.authVersion++;
            await this.sessions
              .deleteMany({ accountId: id }, { session })
              .exec();
          }
          await account.save({ session });
          await this.audit.create(
            [
              {
                actorId: actor.profile.id,
                actorRole: actor.profile.role,
                targetType: AuditTargetType.Account,
                targetId: id,
                targetVersion: account.adminVersion,
                action: change.action,
                correlationId: actor.correlationId,
                occurredAt: now,
                ...(change.reason ? { reason: change.reason } : {}),
                ...(change.metadata ? { metadata: change.metadata } : {}),
              },
            ],
            { session },
          );
          const response = {
            change,
            detail: await this.users.present(account, now, session),
          };
          if (receipt) {
            await this.commands.create(
              [
                {
                  _id: receipt.id,
                  requestHash: receipt.requestHash,
                  response,
                  expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
                },
              ],
              { session },
            );
          }
          return response;
        });
      } catch (error: unknown) {
        // The first concurrent upsert of the shared administrator lock can collide.
        if (
          !(error instanceof mongo.MongoServerError) ||
          error.code !== 11000 ||
          (error.keyValue as { _id?: string } | undefined)?._id !==
            administratorLock
        ) {
          throw error;
        }
      }
    }
    throw new ConflictException({ code: 'administrator_update_in_progress' });
  }

  private commandReceipt(
    actor: AdminUserActor,
    id: string,
    expected: number | string,
    command: Command,
  ) {
    if (!command.key || !isUUID(command.key, '4'))
      throw new BadRequestException({ code: 'idempotency_key_required' });
    return {
      id: digest([actor.profile.id, command.key.toLowerCase()]),
      requestHash: digest([command.name, id, expected, ...command.input]),
    };
  }

  private async verifyAdministrator(
    actor: AdminUserActor,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    const account = await this.accounts
      .findOneAndUpdate(
        {
          _id: actor.profile.id,
          role: Role.Administrator,
          mfaEnabled: true,
          ...availableAccount(now),
        },
        { $inc: { administrationAccessVersion: 1 } },
        { new: true, session, timestamps: false },
      )
      .exec();
    if (!account) throw new ForbiddenException({ code: 'forbidden' });
    const maxAge = this.config.getOrThrow('auth.mfaVerifiedMaxAgeMs', {
      infer: true,
    });
    const written = await this.sessions
      .updateOne(
        {
          _id: actor.sessionId,
          accountId: account._id,
          authVersion: account.authVersion,
          expiresAt: { $gt: now },
          mfaVerifiedAt: { $gte: new Date(now.getTime() - maxAge), $lte: now },
        },
        { $inc: { administrationAccessVersion: 1 } },
        { session, timestamps: false },
      )
      .exec();
    if (!written.matchedCount)
      throw new ForbiddenException({ code: 'mfa_required' });
  }

  private async guardAdministratorAccess(
    actor: AdminUserActor,
    target: Account,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    if (
      target.role === Role.Administrator &&
      target.status === AccountStatus.Active &&
      !isSanctioned(target, now)
    ) {
      await this.adminAccess
        .updateOne(
          { _id: administratorLock },
          { $inc: { version: 1 } },
          { session, upsert: true },
        )
        .exec();
      const active = await this.accounts
        .countDocuments({ role: Role.Administrator, ...availableAccount(now) })
        .session(session)
        .exec();
      if (active <= 1)
        throw new ConflictException({ code: 'last_active_admin' });
    }
    if (actor.profile.id === target._id)
      throw new ConflictException({ code: 'self_management_forbidden' });
  }

  private async enforceResetLimit(
    actorId: string,
    targetId: string,
    now: Date,
    session: ClientSession,
  ): Promise<void> {
    const match = {
      action: passwordResetAction,
      occurredAt: { $gt: new Date(now.getTime() - resetWindowMs) },
    };
    const targetRequests = await this.audit
      .countDocuments({ ...match, targetId })
      .session(session)
      .exec();
    const operatorRequests = await this.audit
      .countDocuments({ ...match, actorId })
      .session(session)
      .exec();
    if (
      targetRequests >= maximumResetsPerUser ||
      operatorRequests >= maximumResetsPerAdministrator
    ) {
      throw new HttpException({ code: 'password_reset_rate_limited' }, 429);
    }
  }

  private reason(value: string): string {
    const reason = value.trim();
    if (reason.length < 3)
      throw new UnprocessableEntityException({ code: 'reason_required' });
    return reason;
  }
}
