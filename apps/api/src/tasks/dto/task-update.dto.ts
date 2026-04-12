import { Type } from 'class-transformer'
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'
import { ActivityLogDto } from './task-activity.dto'

class UpdateTaskActivityDto extends ActivityLogDto {}

export class UpdateTaskDto {
  @IsOptional() @IsIn(['ISTANBUL_CORE','ANADOLU_CORE','TRAVEL']) category?: any
  @IsOptional() @IsIn(['GENERAL','PROJECT']) type?: any
  @IsOptional() @IsIn(['LOW','MEDIUM','HIGH','CRITICAL']) priority?: any
  @IsOptional() @IsIn(['KEY','LONG_TAIL']) accountType?: any
  @IsOptional() @IsIn(['QUERY','FRESH','RAKIP','OLD_RAKIP','REFERANS','OLD','OLD_QUERY','LEAD']) source?: any
  @IsOptional() @IsString() mainCategory?: string
  @IsOptional() @IsString() subCategory?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() district?: string
  @IsOptional() @IsString() contact?: string
  @IsOptional() @IsString() details?: string
  @IsOptional() status?: any
  @IsOptional() dealDetails?: any
  @IsOptional() nextCallDate?: any
  @IsOptional() createdAt?: any
  @IsOptional() assignee?: any
  @IsOptional() @IsString() campaignUrl?: string
  @IsOptional() offers?: any[]
  @IsOptional() @IsString() projectId?: string
  @IsOptional() @IsString() taskListId?: string
  @IsOptional() @ValidateNested() @Type(() => UpdateTaskActivityDto) activity?: UpdateTaskActivityDto
}
