import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { AllConfigType } from '../../config/config.type';

@Injectable()
export class BackupReporterGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const supplied =
      request.header('authorization')?.match(/^Bearer ([^\s]+)$/u)?.[1] ?? '';
    const expected = this.config.getOrThrow('media.backupReportToken', {
      infer: true,
    });
    const actualBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (
      !expected ||
      actualBytes.length !== expectedBytes.length ||
      !timingSafeEqual(actualBytes, expectedBytes)
    ) {
      throw new UnauthorizedException({
        code: 'invalid_backup_reporter_token',
      });
    }
    return true;
  }
}
