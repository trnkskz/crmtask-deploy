import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export enum SortOption {
  name_asc = 'name_asc',
  name_desc = 'name_desc',
  newest = 'newest',
  oldest = 'oldest',
}

export class ExtraContactDto {
  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string
}

export class AccountListQueryDto {
  @IsOptional()
  @IsIn(['summary', 'detail'])
  view?: 'summary' | 'detail'

  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @IsEnum(SortOption)
  sort?: SortOption

  @IsOptional()
  @IsString()
  sourceType?: string

  @IsOptional()
  @IsString()
  assignee?: string

  @IsOptional()
  @IsString()
  team?: string

  @IsOptional()
  @IsIn(['all', 'open', 'closed'])
  taskScope?: 'all' | 'open' | 'closed'

  @IsOptional()
  @IsString()
  businessStatus?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  district?: string

  @IsOptional()
  @IsString()
  mainCategory?: string

  @IsOptional()
  @IsString()
  subCategory?: string

  @IsOptional()
  @IsString()
  createdFrom?: string

  @IsOptional()
  @IsString()
  createdTo?: string
}

export class AccountTargetPreviewDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mainCategories?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategories?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  districts?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  years?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  months?: string[]

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeActive?: boolean
}

export class CreateAccountDto {
  @IsString()
  companyName!: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsString()
  contactPerson?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  district?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  mainCategory?: string

  @IsOptional()
  @IsString()
  subCategory?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'PASSIVE'])
  businessStatus?: 'ACTIVE' | 'PASSIVE'

  @IsOptional()
  @IsIn(['QUERY', 'FRESH', 'RAKIP', 'OLD_RAKIP', 'REFERANS', 'OLD', 'OLD_QUERY', 'LEAD'])
  sourceType?: 'QUERY' | 'FRESH' | 'RAKIP' | 'OLD_RAKIP' | 'REFERANS' | 'OLD' | 'OLD_QUERY' | 'LEAD'

  @IsOptional()
  @IsIn(['KEY', 'LONG_TAIL'])
  accountType?: 'KEY' | 'LONG_TAIL'

  // Backward-compat aliases
  @IsOptional()
  @IsString()
  businessName?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsIn(['QUERY', 'FRESH', 'RAKIP', 'OLD_RAKIP', 'REFERANS', 'OLD', 'OLD_QUERY', 'LEAD'])
  source?: 'QUERY' | 'FRESH' | 'RAKIP' | 'OLD_RAKIP' | 'REFERANS' | 'OLD' | 'OLD_QUERY' | 'LEAD'

  @IsOptional()
  @IsIn(['KEY', 'LONG_TAIL'])
  type?: 'KEY' | 'LONG_TAIL'

  @IsOptional()
  @IsIn(['ACTIVE', 'PASSIVE'])
  status?: 'ACTIVE' | 'PASSIVE'

  @IsOptional()
  @IsString()
  contactEmail?: string

  @IsOptional()
  @IsString()
  businessContact?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsString()
  instagram?: string

  @IsOptional()
  @IsString()
  campaignUrl?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraContactDto)
  extraContacts?: ExtraContactDto[]
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  companyName?: string

  @IsOptional()
  @IsString()
  contactPhone?: string

  @IsOptional()
  @IsString()
  contactPerson?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  district?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  mainCategory?: string

  @IsOptional()
  @IsString()
  subCategory?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'PASSIVE'])
  businessStatus?: 'ACTIVE' | 'PASSIVE'

  @IsOptional()
  @IsIn(['QUERY', 'FRESH', 'RAKIP', 'OLD_RAKIP', 'REFERANS', 'OLD', 'OLD_QUERY', 'LEAD'])
  sourceType?: 'QUERY' | 'FRESH' | 'RAKIP' | 'OLD_RAKIP' | 'REFERANS' | 'OLD' | 'OLD_QUERY' | 'LEAD'

  @IsOptional()
  @IsIn(['KEY', 'LONG_TAIL'])
  accountType?: 'KEY' | 'LONG_TAIL'

  // Backward-compat aliases
  @IsOptional()
  @IsString()
  accountName?: string

  @IsOptional()
  @IsString()
  businessName?: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsIn(['QUERY', 'FRESH', 'RAKIP', 'OLD_RAKIP', 'REFERANS', 'OLD', 'OLD_QUERY', 'LEAD'])
  source?: 'QUERY' | 'FRESH' | 'RAKIP' | 'OLD_RAKIP' | 'REFERANS' | 'OLD' | 'OLD_QUERY' | 'LEAD'

  @IsOptional()
  @IsIn(['KEY', 'LONG_TAIL'])
  type?: 'KEY' | 'LONG_TAIL'

  @IsOptional()
  @IsIn(['ACTIVE', 'PASSIVE'])
  status?: 'ACTIVE' | 'PASSIVE'

  @IsOptional()
  @IsString()
  businessContact?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsString()
  instagram?: string

  @IsOptional()
  @IsString()
  campaignUrl?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  contactEmail?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraContactDto)
  extraContacts?: ExtraContactDto[]
}

export class ImportCsvBodyDto {
  @IsArray()
  rows!: any[]

  @IsOptional()
  @IsString()
  userId?: string

  @IsOptional()
  @IsString()
  defaultAssigneeId?: string
}

export class ChangeStatusDto {
  @IsIn(['ACTIVE', 'PASSIVE'])
  businessStatus!: 'ACTIVE' | 'PASSIVE'

  @IsOptional()
  @IsString()
  userId?: string
}

export class CreateContactDto {
  @IsIn(['BUSINESS', 'PERSON'])
  type!: 'BUSINESS' | 'PERSON'

  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  isPrimary?: boolean
}

export class UpdateContactDto {
  @IsOptional()
  @IsIn(['BUSINESS', 'PERSON'])
  type?: 'BUSINESS' | 'PERSON'

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  isPrimary?: boolean
}

export class CreateNoteDto {
  @IsString()
  content!: string

  @IsOptional()
  @IsString()
  createdById?: string
}

export class UpdateNoteDto {
  @IsString()
  content!: string
}

export class DuplicateDto {
  @IsOptional()
  @IsString()
  suffix?: string
}
