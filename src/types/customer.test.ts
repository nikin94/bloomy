import { describe, it, expect } from 'vitest'
import { STORED_CUSTOMER_SCHEMA, filterCustomers } from './customer'
import type { Customer } from './customer'

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

describe('filterCustomers', () => {
  const make = (over: Partial<Customer>): Customer => ({
    id: over.id ?? 'c',
    ownerId: 'owner-1',
    name: 'Анна',
    createdAt: 0,
    ...over,
  })
  const anna = make({ id: 'c1', name: 'Анна', phone: '+7 900 111-22-33' })
  const boris = make({ id: 'c2', name: 'Борис', phone: '+7 900 444-55-66' })
  const list = [anna, boris]

  it('returns everything for an empty/whitespace query', () => {
    expect(filterCustomers(list, '')).toEqual(list)
    expect(filterCustomers(list, '   ')).toEqual(list)
  })

  it('matches by name, case- and whitespace-insensitive', () => {
    expect(filterCustomers(list, '  аННа ')).toEqual([anna])
  })

  it('matches by phone', () => {
    expect(filterCustomers(list, '444-55')).toEqual([boris])
  })

  it('matches by address', () => {
    const withAddr = make({ id: 'c4', name: 'Глеб', address: 'ул. Пушкина, 10' })
    expect(filterCustomers([withAddr], 'пушкина')).toEqual([withAddr])
  })

  it('matches by note', () => {
    const withNote = make({ id: 'c5', name: 'Дина', note: 'любит пионы' })
    expect(filterCustomers([withNote], 'пионы')).toEqual([withNote])
  })

  it('returns nothing when no field matches', () => {
    expect(filterCustomers(list, 'нет такого')).toEqual([])
  })

  it('does not match on an absent field (no phone/address/note)', () => {
    const bare = make({ id: 'c3', name: 'Виктор' })
    expect(filterCustomers([bare], '900')).toEqual([])
  })
})
