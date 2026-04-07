import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateIf } from 'class-validator'

export class ActivityLogDto {
  @IsIn(['YETKILIYE_ULASILDI','YETKILIYE_ULASILAMADI','ISLETMEYE_ULASILAMADI','TEKLIF_VERILDI','KARSITEKLIF','TEKLIF_KABUL','TEKLIF_RED','ISLETME_CALISMAK_ISTEMIYOR','GRUPANYA_CALISMAK_ISTEMIYOR','TEKRAR_ARANACAK', 'GORUSME', 'ISLETME_KAPANMIS'])
  reason!: string

  @IsOptional()
  @IsDateString()
  @ValidateIf((o: ActivityLogDto) => o.reason === 'TEKRAR_ARANACAK')
  followUpDate?: string

  @IsOptional()
  @IsString()
  text?: string

  // Offer fields (required when reason is TEKLIF_VERILDI or KARSITEKLIF)
  @ValidateIf((o: ActivityLogDto) => o.reason === 'TEKLIF_VERILDI' || o.reason === 'KARSITEKLIF')
  @IsNumber()
  @Min(0)
  adFee?: number

  @ValidateIf((o: ActivityLogDto) => o.reason === 'TEKLIF_VERILDI' || o.reason === 'KARSITEKLIF')
  @IsNumber()
  @Min(0)
  commission?: number

  @ValidateIf((o: ActivityLogDto) => o.reason === 'TEKLIF_VERILDI' || o.reason === 'KARSITEKLIF')
  @IsNumber()
  @Min(0)
  joker?: number
}

export class TaskStatusDto {
  @IsIn(['NEW','HOT','NOT_HOT','FOLLOWUP','DEAL','COLD'])
  status!: 'NEW' | 'HOT' | 'NOT_HOT' | 'FOLLOWUP' | 'DEAL' | 'COLD'
}
