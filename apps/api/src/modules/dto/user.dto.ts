import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateUserDto {
  @IsEmail()
  email!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  role?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string

  @IsOptional()
  @IsString()
  managerId?: string

  @IsOptional()
  @IsString()
  team?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  team?: string

  @IsOptional()
  @IsString()
  role?: string

  @IsOptional()
  @IsString()
  managerId?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsObject()
  settings?: Record<string, any>
}

export class ChangeRoleDto {
  @IsString()
  role!: string

  @IsOptional()
  @IsString()
  managerId?: string
}

export class TransferAndDeactivateDto {
  @IsString()
  targetOwnerId!: string

  @IsOptional()
  @IsBoolean()
  isDelete?: boolean
}

export class SetPasswordDto {
  @IsString()
  @MinLength(6)
  password!: string
}
