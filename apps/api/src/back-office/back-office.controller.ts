import {
  Controller,
  ForbiddenException,
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

class BackOfficePrincipalDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: [Role.Editor, Role.Administrator] })
  role: Role.Editor | Role.Administrator;

  @ApiProperty({ type: [String] })
  permissions: string[];
}

@ApiTags('Back office')
@ApiBearerAuth()
// The administrative contract places the version after "admin".
@Controller({ path: 'admin/v1', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'))
export class BackOfficeController {
  @Get('me')
  @ApiOkResponse({ type: BackOfficePrincipalDto })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions or MFA required.',
  })
  me(@Req() request: RequestWithUser<SignedInAccount>): BackOfficePrincipalDto {
    const { profile } = request.user;
    if (profile.role !== Role.Editor) {
      const requiresMfa = profile.role === Role.Administrator;
      throw new ForbiddenException({
        message: requiresMfa ? 'MFA required.' : 'Access denied.',
        code: requiresMfa ? 'mfa_required' : 'forbidden',
      });
    }

    const principal: BackOfficePrincipalDto = {
      id: profile.id,
      displayName: `${profile.firstName} ${profile.lastName}`,
      role: profile.role,
      permissions: ['BackOffice.Access', 'Editorial.Manage'],
    };
    return principal;
  }
}
