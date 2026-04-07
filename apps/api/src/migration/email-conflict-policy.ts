export type EmailConflictPolicy = 'merge' | 'skip' | 'fail'

export function normalizeEmailConflictPolicy(raw?: string): EmailConflictPolicy {
  const value = String(raw || 'merge').trim().toLowerCase()
  if (value === 'merge' || value === 'skip' || value === 'fail') return value
  throw new Error(`Invalid --on-email-conflict policy: ${raw}. Allowed: merge|skip|fail`)
}
