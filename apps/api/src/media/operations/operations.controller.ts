import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { AdministratorGuard } from '../../back-office/administrator.guard';
import { BackOfficeGuard } from '../../back-office/back-office.guard';
import type { RequestWithUser } from '../../utils/types/request-with-user.type';
import { StorageAdminService } from '../storage/storage-admin.service';
import { AdminJobsService } from './admin-jobs.service';
import { BackupOperationsService } from './backup-operations.service';
import { BackupReporterGuard } from './backup-reporter.guard';
import { OperationsStatusService } from './operations-status.service';
import {
  BackupPageDto,
  BackupQueryDto,
  BackupReportDto,
  BackupRunDto,
  JobDetailDto,
  JobPageDto,
  JobQueryDto,
  JobRetryReceiptDto,
  OperationsSummaryDto,
  RetryJobDto,
} from './operations.dto';

type Request = RequestWithUser<SignedInAccount>;
const uuid = new ParseUUIDPipe({ version: '7' });

@ApiTags('Admin operations')
@ApiBearerAuth()
@Controller({ path: 'admin/v1', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class OperationsController {
  constructor(
    private readonly jobs: AdminJobsService,
    private readonly backups: BackupOperationsService,
    private readonly status: OperationsStatusService,
  ) {}

  @Get('jobs')
  @ApiOkResponse({ type: JobPageDto })
  listJobs(@Query() query: JobQueryDto): Promise<JobPageDto> {
    return this.jobs.list(query);
  }

  @Get('jobs/:id')
  @ApiOkResponse({ type: JobDetailDto })
  job(@Param('id', uuid) id: string): Promise<JobDetailDto> {
    return this.jobs.detail(id);
  }

  @Post('jobs/:id/retries')
  @HttpCode(202)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: JobRetryReceiptDto })
  async retry(
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: RetryJobDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<JobRetryReceiptDto> {
    const receipt = await this.jobs.retry(
      id,
      key,
      body,
      request.user,
      request.correlationId,
    );
    response.setHeader('Location', receipt.statusUrl);
    return receipt;
  }

  @Get('backups')
  @ApiOkResponse({ type: BackupPageDto })
  listBackups(@Query() query: BackupQueryDto): Promise<BackupPageDto> {
    return this.backups.list(query);
  }

  @Get('operations-summary')
  @ApiOkResponse({ type: OperationsSummaryDto })
  summary(): Promise<OperationsSummaryDto> {
    return this.status.summary();
  }
}

@ApiTags('Internal operations')
@ApiBearerAuth('backupReporterToken')
@Controller({ path: 'internal/operations/v1', version: VERSION_NEUTRAL })
@UseGuards(BackupReporterGuard)
export class BackupReporterController {
  constructor(
    private readonly backups: BackupOperationsService,
    private readonly status: OperationsStatusService,
    private readonly storage: StorageAdminService,
  ) {}

  @Put('backups/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BackupRunDto })
  async report(
    @Param('id', uuid) id: string,
    @Body() body: BackupReportDto,
    @Req() request: Request,
  ): Promise<BackupRunDto> {
    if (body.storageLocationId)
      await this.storage.detail(body.storageLocationId);
    return this.backups.report(id, body, request.correlationId);
  }

  @Get('alerts')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: OperationsSummaryDto })
  alerts(): Promise<OperationsSummaryDto> {
    return this.status.summary();
  }
}
