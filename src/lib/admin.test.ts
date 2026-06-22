import { describe, it, expect } from 'vitest'
import { ADMIN_UIDS, isAdmin } from './admin'

describe('isAdmin', () => {
  it('is true for a configured admin uid', () => {
    expect(isAdmin(ADMIN_UIDS[0])).toBe(true)
  })

  it('is false for a non-admin uid', () => {
    expect(isAdmin('some-other-user')).toBe(false)
  })

  it('is false for an undefined uid (signed-out / still resolving)', () => {
    expect(isAdmin(undefined)).toBe(false)
  })
})
