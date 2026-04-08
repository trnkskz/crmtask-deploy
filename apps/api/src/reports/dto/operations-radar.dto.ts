import { IsIn, IsOptional, IsString } from 'class-validator'

export class OperationsRadarQueryDto {
  @IsOptional()
  @IsIn(['today', 'day', 'last7', 'last30'])
  mode?: 'today' | 'day' | 'last7' | 'last30'

  @IsOptional()
  @IsString()
  date?: string

  @IsOptional()
  @IsString()
  team?: string

  @IsOptional()
  @IsString()
  userId?: string
}
