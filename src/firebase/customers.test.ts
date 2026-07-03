// Mock-based tests for the customers data layer. The Firebase SDK is stubbed, so
// these check OUR code: the owner-scoped query, the mapping of docs to validated
// Customers, and the not-found path.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc, getDocs, setDoc, updateDoc, where } from 'firebase/firestore'
import {
  createCustomer,
  fetchCustomer,
  fetchCustomers,
  softDeleteCustomer,
  updateCustomer,
} from './customers'
import type { NewCustomer } from '@/types/customer'

vi.mock('./client', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  // A distinct sentinel so tests can assert a field is removed (deleteField)
  // rather than written.
  deleteField: vi.fn(() => '<<deleted>>'),
  doc: vi.fn(() => ({ ref: 'customer-ref' })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
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
  // createCustomer / updateCustomer fire-and-forget the write and attach a
  // `.catch`, so the mocked setDoc/updateDoc must return a promise.
  vi.mocked(setDoc).mockResolvedValue(undefined)
  vi.mocked(updateDoc).mockResolvedValue(undefined)
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

  it('excludes soft-deleted customers by default', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'c1', data: () => storedCustomer({ name: 'Anna' }) },
        { id: 'c2', data: () => storedCustomer({ name: 'Gone', isDeleted: true }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const customers = await fetchCustomers('owner-1')

    expect(customers.map((c) => c.id)).toEqual(['c1'])
  })

  it('keeps soft-deleted customers when includeDeleted is set', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      docs: [
        { id: 'c1', data: () => storedCustomer({ name: 'Anna' }) },
        { id: 'c2', data: () => storedCustomer({ name: 'Gone', isDeleted: true }) },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const customers = await fetchCustomers('owner-1', { includeDeleted: true })

    expect(customers.map((c) => c.id)).toEqual(['c1', 'c2'])
  })
})

describe('updateCustomer', () => {
  it('writes the trimmed name and present optionals, and removes cleared ones', async () => {
    await updateCustomer('c1', { name: '  Anna  ', phone: ' +700 ', address: '', note: undefined })

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'customers', 'c1')
    expect(updateDoc).toHaveBeenCalledWith(
      { ref: 'customer-ref' },
      {
        name: 'Anna',
        phone: '+700', // present → trimmed value
        address: '<<deleted>>', // empty string → removed
        note: '<<deleted>>', // undefined → removed
      },
    )
  })
})

describe('softDeleteCustomer', () => {
  it('flags the customer as deleted without removing the document', async () => {
    await softDeleteCustomer('c1')

    expect(doc).toHaveBeenCalledWith(expect.anything(), 'customers', 'c1')
    expect(updateDoc).toHaveBeenCalledWith({ ref: 'customer-ref' }, { isDeleted: true })
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
  it('writes the customer and returns the generated id synchronously', () => {
    // The id comes from a locally-generated doc ref (offline-safe: no network),
    // returned at once; the write is fire-and-forget so it isn't awaited.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(doc).mockReturnValueOnce({ id: 'new-id' } as any)
    const customer: NewCustomer = { ownerId: 'owner-1', name: 'Anna', createdAt: 1000 }

    expect(createCustomer(customer)).toBe('new-id')
    expect(setDoc).toHaveBeenCalledWith({ id: 'new-id' }, customer)
  })
})
