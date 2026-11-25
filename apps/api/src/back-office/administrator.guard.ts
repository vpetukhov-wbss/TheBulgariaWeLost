import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '../auth/persistence/account.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';

@Injectable()
export class AdministratorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<RequestWithUser<SignedInAccount>>();
    if (user.profile.role !== Role.Administrator) {
      throw new ForbiddenException({ code: 'forbidden' });
    }
    return true;
  }
}
