import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class NewContactDto {
  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string
}
export class CreateTaskDto {
  @IsOptional()
  @IsString()
  taskListId?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsString()
  accountId!: string

  @IsIn(['ISTANBUL_CORE','ANADOLU_CORE','TRAVEL'])
  category!: 'ISTANBUL_CORE' | 'ANADOLU_CORE' | 'TRAVEL'

  @IsIn(['GENERAL','PROJECT'])
  type!: 'GENERAL' | 'PROJECT'

  @IsIn(['LOW','MEDIUM','HIGH','CRITICAL'])
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

  @IsIn(['KEY','LONG_TAIL'])
  accountType!: 'KEY' | 'LONG_TAIL'

  @IsOptional()
  @IsIn(['REQUEST_FLOW', 'MANUAL_TASK_CREATE', 'PROJECT_GENERATED', 'UNKNOWN'])
  creationChannel?: 'REQUEST_FLOW' | 'MANUAL_TASK_CREATE' | 'PROJECT_GENERATED' | 'UNKNOWN'

  @IsIn(['QUERY','FRESH','RAKIP','OLD_RAKIP','REFERANS','OLD','OLD_QUERY','LEAD'])
  source!: 'QUERY' | 'FRESH' | 'RAKIP' | 'OLD_RAKIP' | 'REFERANS' | 'OLD' | 'OLD_QUERY' | 'LEAD'

  @IsString()
  mainCategory!: string

  @IsString()
  subCategory!: string

  @IsOptional()
  @IsString()
  contact?: string

  @IsOptional()
  @IsString()
  details?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  district?: string

  @IsOptional()
  @IsString()
  externalRef?: string

  @IsOptional()
  @IsString()
  historicalAssignee?: string

  @IsOptional()
  @IsString()
  creationDate?: string

  // Optionally create as assigned immediately
  @IsOptional()
  @IsString()
  ownerId?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number

  @IsOptional()
  @IsIn(['NEW','HOT','NOT_HOT','FOLLOWUP','DEAL','COLD'])
  status?: 'NEW'|'HOT'|'NOT_HOT'|'FOLLOWUP'|'DEAL'|'COLD'

  @IsOptional()
  @IsIn(['OPEN','CLOSED'])
  generalStatus?: 'OPEN'|'CLOSED'

  @IsOptional()
  @ValidateNested()
  @Type(() => NewContactDto)
  newContact?: NewContactDto

  @IsOptional()
  @IsArray()
  offers?: any[]

  @IsOptional()
  @IsString()
  campaignUrl?: string

  @IsOptional()
  @IsString()
  systemLogText?: string
}

export class AssignTaskDto {
  @IsString()
  ownerId!: string

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number

  @IsOptional()
  @IsString()
  note?: string
}

export class SetTaskPoolDto {
  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  taskListId?: string

  @IsIn(['GENERAL', 'TEAM_1', 'TEAM_2'])
  poolTeam!: 'GENERAL' | 'TEAM_1' | 'TEAM_2'
}

export class UpdateStatusDto {
  @IsIn(['LOW','MEDIUM','HIGH','CRITICAL'])
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

  @IsOptional()
  @IsIn(['GENERAL','PROJECT'])
  type?: 'GENERAL' | 'PROJECT'
}
