import { ApiProperty } from '@nestjs/swagger';
import { Account, Role } from '../persistence/account.schema';

export class ProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ required: false })
  mfaEnabled?: boolean;

  static fromAccount(account: Account): ProfileDto {
    return {
      id: account._id,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      role: account.role,
      mfaEnabled: account.mfaEnabled,
    };
  }
}
