import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { AllConfigType } from '../config/config.type';

@Injectable()
export class MediaServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.header('authorization');
    const supplied = authorization?.match(/^Bearer ([^\s]+)$/)?.[1] ?? '';
    const expected = this.config.getOrThrow('media.serviceToken', {
      infer: true,
    });
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected);
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw new UnauthorizedException({ code: 'invalid_service_token' });
    }
    return true;
  }
}
