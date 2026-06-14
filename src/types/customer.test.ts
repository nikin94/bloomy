import { describe, it, expect } from 'vitest'
import { STORED_CUSTOMER_SCHEMA } from './customer'

describe('STORED_CUSTOMER_SCHEMA', () => {
  it('accepts a customer with only the required fields', () => {
    const doc = { ownerId: 'user-1', name: 'Анна', createdAt: 0 }
    expect(STORED_CUSTOMER_SCHEMA.safeParse(doc).success).toBe(true)
  })

  it('accepts the optional contact fields', () => {
    const doc = {
      ownerId: 'user-1',
      name: 'Анна',
      phone: '+7 900 000-00-00',
      address: 'ул. Пушкина, 1',
      note: 'любит пионы',
      createdAt: 0,
    }
    expect(STORED_CUSTOMER_SCHEMA.safeParse(doc).success).toBe(true)
  })

  it('rejects a customer with an empty name', () => {
    const doc = { ownerId: 'user-1', name: '', createdAt: 0 }
    expect(STORED_CUSTOMER_SCHEMA.safeParse(doc).success).toBe(false)
  })

  it('rejects a customer with no owner', () => {
    const doc = { name: 'Анна', createdAt: 0 }
    expect(STORED_CUSTOMER_SCHEMA.safeParse(doc).success).toBe(false)
  })
})
