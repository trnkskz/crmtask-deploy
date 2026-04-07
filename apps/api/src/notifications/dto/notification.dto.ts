import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator'

export class NotificationListQueryDto {
  @IsOptional()
  @IsString()
  toUserId?: string

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  unread?: boolean

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

export class CreateNotificationDto {
  @IsString()
  taskId!: string

  @IsString()
  toUserId!: string

  @IsString()
  message!: string
}
