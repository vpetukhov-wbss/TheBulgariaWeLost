import {
  Controller,
  Get,
  Req,
  Res,
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
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
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
  me(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Res() response: Response,
  ): void {
    const { profile } = request.user;
    if (profile.role !== Role.Editor) {
      const requiresMfa = profile.role === Role.Administrator;
      response
        .status(403)
        .type('application/problem+json')
        .json({
          type: 'about:blank',
          title: requiresMfa ? 'MFA required' : 'Access denied',
          status: 403,
          code: requiresMfa ? 'mfa_required' : 'forbidden',
          traceId: randomUUID(),
        });
      return;
    }

    const principal: BackOfficePrincipalDto = {
      id: profile.id,
      displayName: `${profile.firstName} ${profile.lastName}`,
      role: profile.role,
      permissions: ['BackOffice.Access', 'Editorial.Manage'],
    };
    response.json(principal);
  }
}
