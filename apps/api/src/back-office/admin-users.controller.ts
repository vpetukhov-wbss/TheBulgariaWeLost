import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AdminUserDetailDto,
  AdminUserPageDto,
  AdminUserQueryDto,
} from './admin-users.dto';
import { AdminUsersService } from './admin-users.service';
import { AdministratorGuard } from './administrator.guard';
import { BackOfficeGuard } from './back-office.guard';

@ApiTags('Back office')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/users', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOkResponse({ type: AdminUserPageDto })
  list(@Query() query: AdminUserQueryDto): Promise<AdminUserPageDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminUserDetailDto })
  detail(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
  ): Promise<AdminUserDetailDto> {
    return this.users.get(id);
  }
}
