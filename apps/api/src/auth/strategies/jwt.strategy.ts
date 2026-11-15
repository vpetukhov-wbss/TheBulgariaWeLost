import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { isUUID } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AllConfigType } from '../../config/config.type';
import { AuthService } from '../auth.service';
import { ProfileDto } from '../dto/profile.dto';
import { JwtPayloadType } from './types/jwt-payload.type';

export type SignedInAccount = { profile: ProfileDto; sessionId: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AllConfigType>,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow('auth.secret', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayloadType): Promise<SignedInAccount> {
    if (!isUUID(payload.id, '7') || !isUUID(payload.sessionId, '7')) {
      throw new UnauthorizedException();
    }
    return {
      profile: await this.auth.activeProfile(payload.sessionId, payload.id),
      sessionId: payload.sessionId,
    };
  }
}
