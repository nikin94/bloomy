// Mock-based tests for the customers data layer. The Firebase SDK is stubbed, so
// these check OUR code: the owner-scoped query, the mapping of docs to validated
// Customers, and the not-found path.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDoc, getDoc, getDocs, where } from 'firebase/firestore'
import { createCustomer, fetchCustomer, fetchCustomers } from './customers'
import type { NewCustomer } from '../types/customer'

vi.mock('./client', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
}))

const storedCustomer = (overrides: Partial<Record<string, unknown>> = {}) => ({
  ownerId: 'owner-1',
  name: 'Anna',
  createdAt: 1000,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchCustomers', () => {
  it('filters by owner and maps documents to customers', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'c1', data: () => storedCustomer({ name: 'Anna' }) },
        { id: 'c2', data: () => storedCustomer({ name: 'Boris', phone: '+700' }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const customers = await fetchCustomers('owner-1')

    expect(where).toHaveBeenCalledWith('ownerId', '==', 'owner-1')
    expect(customers).toEqual([
      { id: 'c1', ownerId: 'owner-1', name: 'Anna', createdAt: 1000 },
      { id: 'c2', ownerId: 'owner-1', name: 'Boris', phone: '+700', createdAt: 1000 },
    ])
  })
})

describe('fetchCustomer', () => {
  it('returns the customer when it exists', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'c1',
      data: () => storedCustomer(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    expect(await fetchCustomer('c1')).toEqual({
      id: 'c1',
      ownerId: 'owner-1',
      name: 'Anna',
      createdAt: 1000,
    })
  })

  it('returns null when the customer does not exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as any)

    expect(await fetchCustomer('missing')).toBeNull()
  })
})

describe('createCustomer', () => {
  it('writes the customer and returns the generated id', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(addDoc).mockResolvedValue({ id: 'new-id' } as any)
    const customer: NewCustomer = { ownerId: 'owner-1', name: 'Anna', createdAt: 1000 }

    expect(await createCustomer(customer)).toBe('new-id')
    expect(addDoc).toHaveBeenCalledWith(expect.anything(), customer)
  })
})
