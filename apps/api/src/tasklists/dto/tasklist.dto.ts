import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator'

export class TaskListQueryDto {
  @IsOptional()
  @IsIn(['GENERAL','PROJECT'])
  tag?: 'GENERAL' | 'PROJECT'

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean

  @IsOptional()
  @IsString()
  teamId?: string

  @IsOptional()
  @IsIn(['GENERAL', 'ASSIGNED', 'TEAM'])
  pool?: 'GENERAL' | 'ASSIGNED' | 'TEAM'
}

export class CreateTaskListDto {
  @IsString()
  name!: string

  @IsIn(['GENERAL','PROJECT'])
  tag!: 'GENERAL' | 'PROJECT'

  @IsOptional()
  @IsString()
  description?: string
}

export class UpdateTaskListDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsIn(['GENERAL','PROJECT'])
  tag?: 'GENERAL' | 'PROJECT'

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class TaskListTasksQueryDto {
  @IsOptional()
  @IsIn(['GENERAL','PROJECT'])
  tag?: 'GENERAL' | 'PROJECT'

  @IsOptional()
  @IsString()
  taskListId?: string

  @IsOptional()
  @IsString()
  assigneeId?: string

  @IsOptional()
  @IsString()
  teamId?: string

  @IsOptional()
  @IsIn(['GENERAL', 'ASSIGNED', 'TEAM'])
  pool?: 'GENERAL' | 'ASSIGNED' | 'TEAM'

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @IsString()
  createdFrom?: string

  @IsOptional()
  @IsString()
  createdTo?: string

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
}
