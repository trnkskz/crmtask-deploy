import { normalizeEmailConflictPolicy } from './email-conflict-policy'

describe('normalizeEmailConflictPolicy', () => {
  it('defaults to merge when policy is missing', () => {
    expect(normalizeEmailConflictPolicy()).toBe('merge')
  })

  it('accepts merge, skip, fail', () => {
    expect(normalizeEmailConflictPolicy('merge')).toBe('merge')
    expect(normalizeEmailConflictPolicy('skip')).toBe('skip')
    expect(normalizeEmailConflictPolicy('fail')).toBe('fail')
  })

  it('accepts case-insensitive values', () => {
    expect(normalizeEmailConflictPolicy('MERGE')).toBe('merge')
    expect(normalizeEmailConflictPolicy('Skip')).toBe('skip')
  })

  it('throws for invalid values', () => {
    expect(() => normalizeEmailConflictPolicy('replace')).toThrow('Invalid --on-email-conflict policy')
  })
})
