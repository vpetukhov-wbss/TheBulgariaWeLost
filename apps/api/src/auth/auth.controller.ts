import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import { AuthService } from './auth.service';
import { AuthConfirmEmailDto } from './dto/auth-confirm-email.dto';
import { AuthEmailLoginDto } from './dto/auth-email-login.dto';
import { AuthForgotPasswordDto } from './dto/auth-forgot-password.dto';
import { AuthRegisterLoginDto } from './dto/auth-register-login.dto';
import { AuthResetPasswordDto } from './dto/auth-reset-password.dto';
import { AuthUpdateDto } from './dto/auth-update.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ProfileDto } from './dto/profile.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import type { SignedInAccount } from './strategies/jwt.strategy';
import type { JwtRefreshPayloadType } from './strategies/types/jwt-refresh-payload.type';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('email/login')
  @ApiOkResponse({ type: LoginResponseDto })
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  @HttpCode(200)
  login(@Body() dto: AuthEmailLoginDto): Promise<LoginResponseDto> {
    return this.auth.validateLogin(dto);
  }

  @Post('email/register')
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @HttpCode(204)
  register(@Body() dto: AuthRegisterLoginDto): Promise<void> {
    return this.auth.register(dto);
  }

  @Post('email/confirm')
  @HttpCode(204)
  confirmEmail(@Body() dto: AuthConfirmEmailDto): Promise<void> {
    return this.auth.confirmEmail(dto.hash);
  }

  @Post('email/confirm/new')
  @HttpCode(204)
  confirmNewEmail(@Body() dto: AuthConfirmEmailDto): Promise<void> {
    return this.auth.confirmNewEmail(dto.hash);
  }

  @Post('forgot/password')
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @HttpCode(204)
  forgot(@Body() dto: AuthForgotPasswordDto): Promise<void> {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('reset/password')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  @HttpCode(204)
  reset(@Body() dto: AuthResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.hash, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: ProfileDto })
  @UseGuards(AuthGuard('jwt'))
  me(@Request() request: RequestWithUser<SignedInAccount>): ProfileDto {
    return request.user.profile;
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: ProfileDto })
  @UseGuards(AuthGuard('jwt'))
  update(
    @Request() request: RequestWithUser<SignedInAccount>,
    @Body() dto: AuthUpdateDto,
  ): Promise<ProfileDto> {
    return this.auth.update(request.user.profile.id, dto);
  }

  @Post('refresh')
  @ApiBearerAuth()
  @ApiOkResponse({ type: RefreshResponseDto })
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(200)
  refresh(
    @Request() request: RequestWithUser<JwtRefreshPayloadType>,
  ): Promise<RefreshResponseDto> {
    return this.auth.refreshToken(request.user);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(204)
  logout(@Request() request: RequestWithUser<SignedInAccount>): Promise<void> {
    return this.auth.logout(request.user.sessionId);
  }
}
