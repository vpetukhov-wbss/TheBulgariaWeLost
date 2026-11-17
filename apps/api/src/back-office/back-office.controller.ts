import {
  Controller,
  Get,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../auth/persistence/account.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import { BackOfficeGuard } from './back-office.guard';

class BackOfficePrincipalDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: [Role.Editor, Role.Administrator] })
  role: Role.Editor | Role.Administrator;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty({ required: false, format: 'date-time' })
  mfaVerifiedAtUtc?: string;
}

@ApiTags('Back office')
@ApiBearerAuth()
// The administrative contract places the version after "admin".
@Controller({ path: 'admin/v1', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard)
export class BackOfficeController {
  @Get('me')
  @ApiOkResponse({ type: BackOfficePrincipalDto })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions or MFA required.',
  })
  me(@Req() request: RequestWithUser<SignedInAccount>): BackOfficePrincipalDto {
    const { profile } = request.user;
    const role =
      profile.role === Role.Administrator ? Role.Administrator : Role.Editor;
    const principal: BackOfficePrincipalDto = {
      id: profile.id,
      displayName: `${profile.firstName} ${profile.lastName}`,
      role,
      permissions:
        role === Role.Administrator
          ? [
              'BackOffice.Access',
              'Editorial.Manage',
              'Users.Manage',
              'Audit.Read',
              'Storage.Manage',
              'SiteSettings.Manage',
            ]
          : ['BackOffice.Access', 'Editorial.Manage'],
      ...(request.user.mfaVerifiedAt
        ? { mfaVerifiedAtUtc: request.user.mfaVerifiedAt.toISOString() }
        : {}),
    };
    return principal;
  }
}
