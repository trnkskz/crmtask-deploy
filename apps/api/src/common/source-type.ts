export const ACCOUNT_SOURCE_VALUES = [
  'QUERY',
  'FRESH',
  'RAKIP',
  'OLD_RAKIP',
  'REFERANS',
  'OLD',
  'OLD_QUERY',
  'LEAD',
] as const

export type AccountSourceValue = (typeof ACCOUNT_SOURCE_VALUES)[number]

export function normalizeAccountSource(value: unknown, fallback: AccountSourceValue = 'FRESH'): AccountSourceValue {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return fallback
  if (raw.includes('OLD ACCOUNT RAKIP') || raw.includes('OLD_RAKIP')) return 'OLD_RAKIP'
  if (raw.includes('OLD ACCOUNT QUERY') || raw.includes('OLD_QUERY')) return 'OLD_QUERY'
  if (raw === 'QUERY' || raw.startsWith('QUERY ') || raw.includes(' QUERY') || raw.includes('QUERY/')) return 'QUERY'
  if (raw.includes('LEAD')) return 'LEAD'
  if (raw.includes('RAKIP')) return 'RAKIP'
  if (raw.includes('REFERANS')) return 'REFERANS'
  if (raw === 'OLD' || raw.includes('OLD ACCOUNT') || raw.startsWith('OLD ')) return 'OLD'
  if (raw.includes('FRESH')) return 'FRESH'
  if ((ACCOUNT_SOURCE_VALUES as readonly string[]).includes(raw)) return raw as AccountSourceValue
  return fallback
}

export function getAccountSourceLabel(value: unknown) {
  switch (normalizeAccountSource(value)) {
    case 'OLD_RAKIP':
      return 'Old Account Rakip'
    case 'OLD_QUERY':
      return 'Old Account Query'
    case 'QUERY':
      return 'Query'
    case 'LEAD':
      return 'Lead'
    case 'RAKIP':
      return 'Rakip'
    case 'REFERANS':
      return 'Referans'
    case 'OLD':
      return 'Old Account'
    case 'FRESH':
    default:
      return 'Fresh Account'
  }
}
