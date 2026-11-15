import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, MaxLength } from 'class-validator';

export class AuthConfirmEmailDto {
  @ApiProperty()
  @IsJWT()
  @MaxLength(4096)
  hash: string;
}
