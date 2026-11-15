import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsJWT,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AuthResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @IsByteLength(6, 72)
  password: string;

  @ApiProperty()
  @IsJWT()
  @MaxLength(4096)
  hash: string;
}
