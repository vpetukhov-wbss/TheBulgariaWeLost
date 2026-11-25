import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import {
  AdminUserActionsService,
  type AdminUserActor,
} from './admin-user-actions.service';
import {
  AccountSanctionDto,
  AccountSanctionPageDto,
  AccountSanctionsQueryDto,
  AdminUserDecisionDto,
  AdminUserDetailDto,
  AdminUserPageDto,
  AdminUserQueryDto,
  ChangeAdminUserRoleDto,
  CreateAccountSanctionDto,
  EditAdminUserDto,
  PasswordResetAcceptedDto,
  PasswordResetOperationDto,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';
import { AdministratorGuard } from './administrator.guard';
import { BackOfficeGuard } from './back-office.guard';

type AdminRequest = RequestWithUser<SignedInAccount>;
const uuid = new ParseUUIDPipe({ version: '7' });

function actor(request: AdminRequest): AdminUserActor {
  return { ...request.user, correlationId: request.correlationId };
}

@ApiTags('Admin users')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/users', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly actions: AdminUserActionsService,
  ) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOkResponse({ type: AdminUserPageDto })
  list(@Query() query: AdminUserQueryDto): Promise<AdminUserPageDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminUserDetailDto })
  async detail(
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminUserDetailDto> {
    return this.tag(response, await this.users.get(id));
  }

  @Patch(':id')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: AdminUserDetailDto })
  async edit(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: EditAdminUserDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminUserDetailDto> {
    return this.tag(
      response,
      await this.actions.edit(actor(request), id, ifMatch, dto),
    );
  }

  @Post(':id/role-changes')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminUserDetailDto })
  async changeRole(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ChangeAdminUserRoleDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminUserDetailDto> {
    return this.tag(
      response,
      await this.actions.changeRole(actor(request), id, key, dto),
    );
  }

  @Get(':id/sanctions')
  @ApiOkResponse({ type: AccountSanctionPageDto })
  listSanctions(
    @Param('id', uuid) id: string,
    @Query() query: AccountSanctionsQueryDto,
  ): Promise<AccountSanctionPageDto> {
    return this.users.listSanctions(id, query);
  }

  @Get(':id/sanctions/:sanctionId')
  @ApiOkResponse({ type: AccountSanctionDto })
  sanction(
    @Param('id', uuid) id: string,
    @Param('sanctionId', uuid) sanctionId: string,
  ): Promise<AccountSanctionDto> {
    return this.users.getSanction(id, sanctionId);
  }

  @Post(':id/sanctions')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: AccountSanctionDto })
  async ban(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateAccountSanctionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccountSanctionDto> {
    const sanction = await this.actions.ban(actor(request), id, key, dto);
    response.location(
      '/api/admin/v1/users/' + id + '/sanctions/' + sanction.id,
    );
    return sanction;
  }

  @Post(':id/sanctions/:sanctionId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminUserDetailDto })
  async unban(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Param('sanctionId', uuid) sanctionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: AdminUserDecisionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminUserDetailDto> {
    return this.tag(
      response,
      await this.actions.unban(actor(request), id, sanctionId, key, dto),
    );
  }

  @Post(':id/session-revocations')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiNoContentResponse()
  revokeSessions(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: AdminUserDecisionDto,
  ): Promise<void> {
    return this.actions.revokeSessions(actor(request), id, key, dto);
  }

  @Post(':id/password-reset-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: PasswordResetAcceptedDto })
  async requestPasswordReset(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: AdminUserDecisionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PasswordResetAcceptedDto> {
    try {
      const result = await this.actions.requestPasswordReset(
        actor(request),
        id,
        key,
        dto,
      );
      response.location(result.statusUrl);
      return result;
    } catch (error: unknown) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        response.setHeader('Retry-After', '3600');
      }
      throw error;
    }
  }

  private tag(
    response: Response,
    user: AdminUserDetailDto,
  ): AdminUserDetailDto {
    response.setHeader('ETag', AdminUsersService.etag(user));
    return user;
  }
}

@ApiTags('Admin users')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/operations', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class PasswordResetOperationsController {
  constructor(private readonly actions: AdminUserActionsService) {}

  @Get(':id')
  @ApiOkResponse({ type: PasswordResetOperationDto })
  get(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
  ): Promise<PasswordResetOperationDto> {
    return this.actions.passwordResetOperation(request.user.profile.id, id);
  }
}
