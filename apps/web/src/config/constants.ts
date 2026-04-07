export const TASK_STATUS = {
  NEW: 'new',
  HOT: 'hot',
  NOT_HOT: 'nothot',
  FOLLOWUP: 'followup',
  DEAL: 'deal',
  COLD: 'cold',
} as const;

export const USER_ROLES = {
  MANAGER: 'Yonetici',
  TEAM_LEAD: 'Takim Lideri',
  SALES_REP: 'Satis Temsilcisi',
} as const;
