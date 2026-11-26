import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../auth/persistence/account.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { AllConfigType } from '../config/config.type';
import type { RequestWithUser } from '../utils/types/request-with-user.type';

@Injectable()
export class BackOfficeGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AllConfigType>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser<SignedInAccount>>();
    this.requireAccess(request.user);
    return true;
  }

  requireAccess(
    principal: Pick<SignedInAccount, 'profile' | 'mfaVerifiedAt'>,
  ): void {
    if (
      principal.profile.role !== Role.Editor &&
      principal.profile.role !== Role.Administrator
    ) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Back-office access is not allowed.',
      });
    }
    if (principal.profile.role === Role.Administrator) {
      const verifiedAt = principal.mfaVerifiedAt?.getTime() ?? 0;
      const maxAge = this.config.getOrThrow('auth.mfaVerifiedMaxAgeMs', {
        infer: true,
      });
      if (!principal.profile.mfaEnabled || verifiedAt < Date.now() - maxAge) {
        throw new ForbiddenException({
          code: 'mfa_required',
          message: 'A recent MFA verification is required.',
        });
      }
    }
  }
}
