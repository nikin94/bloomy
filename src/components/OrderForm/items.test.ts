import { describe, it, expect } from 'vitest'
import { emptyItem, initialItems } from './items'
import type { Order } from '@/types/order'

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 1,
  dateCreated: 0,
  ownerId: 'owner-1',
  customerId: 'c1',
  address: 'ул. Пушкина, 1',
  plants: [{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }],
  paymentMethod: 'cash',
  deliveryMethod: 'post',
  deliveryPriceMinor: 0,
  currency: 'RUB',
  paymentStatus: 'pending',
  shipmentStatus: 'new',
  ...over,
})

describe('emptyItem', () => {
  it('starts blank with the given id (quantity/price empty, not "1"/"0")', () => {
    expect(emptyItem(5)).toEqual({ id: 5, name: '', quantity: '', price: '' })
  })
})

describe('initialItems', () => {
  it('returns a single blank row when there is no order (create)', () => {
    expect(initialItems(undefined)).toEqual([{ id: 0, name: '', quantity: '', price: '' }])
  })

  it('converts stored plants back into input strings, ids by index', () => {
    const seeded = initialItems(
      order({
        plants: [
          { name: 'Кактус', quantity: 2, unitPriceMinor: 14990 },
          { name: 'Фиалка', quantity: 1, unitPriceMinor: 30000 },
        ],
      }),
    )
    expect(seeded).toEqual([
      { id: 0, name: 'Кактус', quantity: '2', price: '149,90' },
      { id: 1, name: 'Фиалка', quantity: '1', price: '300' },
    ])
  })
})
