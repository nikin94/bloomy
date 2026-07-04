import { describe, it, expect } from 'vitest'
import { asEnum } from './asEnum'

const STATUSES = ['pending', 'paid', 'refunded'] as const

describe('asEnum', () => {
  it('returns the value when it is a member of the allowed set', () => {
    expect(asEnum(STATUSES, 'paid', 'pending')).toBe('paid')
  })

  it('returns the fallback when the value is not a member', () => {
    // A value that could never come from an <option> built off the set — the guard
    // keeps it out of typed state instead of letting the `as` cast wave it through.
    expect(asEnum(STATUSES, 'bogus', 'pending')).toBe('pending')
  })

  it('returns the fallback for an empty string', () => {
    expect(asEnum(STATUSES, '', 'refunded')).toBe('refunded')
  })

  it("supports a fallback of a DIFFERENT type (e.g. '' for a filter's all-option)", () => {
    // The "all" option in a filter select carries value "" — not a status, so it
    // falls through to the '' fallback, and the result type widens to include it.
    const all = '' as const
    expect(asEnum(STATUSES, '', all)).toBe('')
    // A real status still narrows to the member, not the fallback.
    expect(asEnum(STATUSES, 'paid', all)).toBe('paid')
  })

  it('is case- and whitespace-sensitive (exact membership only)', () => {
    expect(asEnum(STATUSES, 'Paid', 'pending')).toBe('pending')
    expect(asEnum(STATUSES, ' paid ', 'pending')).toBe('pending')
  })
})
