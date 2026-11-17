import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class MfaEnrollmentRequestDto {
  @ApiProperty({ format: 'password', writeOnly: true })
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  currentPassword: string;
}

export class MfaEnrollmentDto {
  @ApiProperty({ description: 'Base32 secret shown only during enrollment.' })
  secret: string;

  @ApiProperty({ description: 'URI accepted by standard authenticator apps.' })
  provisioningUri: string;
}

export class MfaCodeDto {
  @ApiProperty({ pattern: '^\\d{6}$' })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class MfaRecoveryCodeDto {
  @ApiProperty({ example: 'ABCD-EFGH-JKLM-NPQR' })
  @IsString()
  @Matches(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/i)
  recoveryCode: string;
}

export class MfaRecoveryCodesDto {
  @ApiProperty({ type: [String] })
  recoveryCodes: string[];
}
