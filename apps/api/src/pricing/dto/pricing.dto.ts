import { Type } from 'class-transformer'
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export enum PricingCategoryDto {
  COMMISSION = 'COMMISSION',
  SERVICE = 'SERVICE',
  DOPING = 'DOPING',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
}

export enum PricingStatusDto {
  ACTIVE = 'ACTIVE',
  PASSIVE = 'PASSIVE',
}

export class PricingListQueryDto {
  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @IsEnum(PricingCategoryDto)
  category?: PricingCategoryDto

  @IsOptional()
  @IsEnum(PricingStatusDto)
  status?: PricingStatusDto

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20
}

export class CreatePricingDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @IsEnum(PricingCategoryDto)
  category!: PricingCategoryDto

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate?: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string

  @IsOptional()
  @IsEnum(PricingStatusDto)
  status?: PricingStatusDto = PricingStatusDto.ACTIVE
}

export class UpdatePricingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsEnum(PricingCategoryDto)
  category?: PricingCategoryDto

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate?: number

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string

  @IsOptional()
  @IsEnum(PricingStatusDto)
  status?: PricingStatusDto
}

export class PricingCodeBundleDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceInc!: number
}

export class PricingDiscountRuleGroupDto {
  @IsString()
  @MaxLength(200)
  title!: string

  @IsArray()
  @IsString({ each: true })
  rules!: string[]
}

export class UpdatePricingRulesDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingCodeBundleDto)
  codeBundles?: PricingCodeBundleDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingDiscountRuleGroupDto)
  discountCoupons?: PricingDiscountRuleGroupDto[]
}
