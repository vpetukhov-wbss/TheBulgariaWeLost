import { ApiProperty } from '@nestjs/swagger';
import { ProfileDto } from './profile.dto';
import { RefreshResponseDto } from './refresh-response.dto';

export class LoginResponseDto extends RefreshResponseDto {
  @ApiProperty({ type: () => ProfileDto })
  user: ProfileDto;
}
