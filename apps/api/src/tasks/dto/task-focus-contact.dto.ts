import { IsOptional, IsString, ValidateIf } from 'class-validator'

export class TaskFocusContactDto {
  @IsOptional()
  @IsString()
  name?: string

  @ValidateIf((o: TaskFocusContactDto) => !o.email)
  @IsString()
  phone?: string

  @ValidateIf((o: TaskFocusContactDto) => !o.phone)
  @IsString()
  email?: string
}
