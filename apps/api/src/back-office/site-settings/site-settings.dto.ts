import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export enum SocialPlatform {
  YouTube = 'YouTube',
  Facebook = 'Facebook',
  Instagram = 'Instagram',
  TikTok = 'TikTok',
}

export class SiteLinkDto {
  @ApiProperty({ maxLength: 80 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label: string;

  @ApiProperty({ maxLength: 500 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url: string;
}

export class SiteSocialLinkDto {
  @ApiProperty({ enum: SocialPlatform })
  @IsEnum(SocialPlatform)
  platform: SocialPlatform;

  @ApiProperty({ maxLength: 500 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url: string;
}

export class SiteBannerDto {
  @ApiProperty({ maxLength: 240 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  text: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ type: SiteLinkDto })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => SiteLinkDto)
  link?: SiteLinkDto;
}

export class SitePresentationDto {
  @ApiProperty({ maxLength: 80 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  siteName: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'email',
    maxLength: 254,
  })
  @trim
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  supportContact?: string | null;

  @ApiProperty({ type: [SiteLinkDto], maxItems: 8 })
  @IsArray()
  @ArrayMaxSize(8)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SiteLinkDto)
  footerLinks: SiteLinkDto[];

  @ApiProperty({ type: [SiteSocialLinkDto], maxItems: 4 })
  @IsArray()
  @ArrayMaxSize(4)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SiteSocialLinkDto)
  socialLinks: SiteSocialLinkDto[];

  @ApiProperty({ type: [SiteBannerDto], maxItems: 3 })
  @IsArray()
  @ArrayMaxSize(3)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => SiteBannerDto)
  banners: SiteBannerDto[];
}

export class SiteSettingsInputDto extends SitePresentationDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    maxItems: 6,
  })
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsUUID('7', { each: true })
  featuredMaterialIds: string[];
}

export class UpdateSiteSettingsDto extends SiteSettingsInputDto {
  @ApiProperty({ maxLength: 500 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class FeaturedMaterialDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  slug: string;
}

export class SiteSettingsDto extends SiteSettingsInputDto {
  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAtUtc?: string;
}

export class PublicSiteSettingsDto extends SitePresentationDto {
  @ApiProperty({ type: [FeaturedMaterialDto] })
  featuredMaterials: FeaturedMaterialDto[];
}
