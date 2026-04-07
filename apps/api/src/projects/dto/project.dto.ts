import { Type } from 'class-transformer'
import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export enum ProjectCreationModeDto {
  MANUAL = 'MANUAL',
  DATA_DRIVEN = 'DATA_DRIVEN',
}

export enum ProjectStatusDto {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class ProjectListQueryDto {
  @IsOptional()
  @IsString()
  q?: string

  @IsOptional()
  @IsEnum(ProjectStatusDto)
  status?: ProjectStatusDto

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

export class CreateProjectDto {
  @IsString()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsEnum(ProjectCreationModeDto)
  mode?: ProjectCreationModeDto

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @IsEnum(ProjectStatusDto)
  status?: ProjectStatusDto = ProjectStatusDto.PLANNED

  @IsOptional()
  @IsISO8601()
  startDate?: string

  @IsOptional()
  @IsISO8601()
  endDate?: string
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @IsOptional()
  @IsEnum(ProjectStatusDto)
  status?: ProjectStatusDto

  @IsOptional()
  @IsISO8601()
  startDate?: string

  @IsOptional()
  @IsISO8601()
  endDate?: string
}
