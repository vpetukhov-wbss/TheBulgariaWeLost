import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UploadPurpose } from '../persistence/media-upload.schema';

const sha256Pattern = /^[a-f0-9]{64}$/;

export class CreateUploadDto {
  @ApiProperty({ enum: UploadPurpose })
  @IsEnum(UploadPurpose)
  purpose: UploadPurpose;

  @ApiProperty({ minimum: 1, maximum: 33_554_432, format: 'int64' })
  @IsInt()
  @Min(1)
  @Max(33_554_432)
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(sha256Pattern)
  sha256: string;
}

export class UploadSessionDto {
  @ApiProperty({ format: 'uuid' })
  uploadId: string;

  @ApiProperty({ example: '/media/v1/uploads/019ab...' })
  uploadUrl: string;

  @ApiProperty({ description: 'Short-lived bearer grant for the media API.' })
  grant: string;

  @ApiProperty({ format: 'date-time' })
  expiresAtUtc: string;

  @ApiProperty({ format: 'int64' })
  maxBytes: number;

  @ApiProperty()
  attemptVersion: number;
}

export class GrantRequestDto {
  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  grant: string;
}

export class UploadReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7')
  attemptId: string;

  @ApiProperty({ format: 'int64', minimum: 1 })
  @IsInt()
  @Min(1)
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(sha256Pattern)
  sha256: string;

  @ApiProperty({ example: 'image/png', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i)
  contentType: string;
}

export class ObjectReferenceDto {
  @ApiProperty()
  storageLocationId: string;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  fileKey: string;
}

export class UploadClaimDto {
  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty()
  attemptVersion: number;

  @ApiProperty({ type: ObjectReferenceDto })
  object: ObjectReferenceDto;

  @ApiProperty({ format: 'int64' })
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  sha256: string;
}
