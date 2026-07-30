import { describe, it, expect } from 'vitest'
import { parsePlants, buildOrderPayload } from './payload'
import type { OrderFormFields } from './useOrderFormState'

// Baseline field values a test overrides per case — the shape the reducer holds,
// with every optional-ish input blank so each test asserts exactly one concern.
const fields = (over: Partial<OrderFormFields> = {}): OrderFormFields => ({
  customerMode: 'existing',
  selectedCustomerId: 'c1',
  newName: '',
  newPhone: '',
  address: 'ул. Пушкина, 1',
  items: [{ id: 0, name: 'Кактус', quantity: '2', price: '149,90' }],
  giftName: null,
  deliveryMethod: 'post',
  deliveryPrice: '',
  paymentMethod: 'cash',
  currency: 'RUB',
  paymentStatus: 'pending',
  prepaidAmount: '',
  status: 'processing',
  source: null,
  comment: '',
  ...over,
})

describe('parsePlants', () => {
  it('maps typed rows to stored items: trimmed name, integer quantity, minor-unit price', () => {
    expect(
      parsePlants([{ id: 0, name: '  Кактус  ', quantity: '2', price: '149,90' }]),
    ).toEqual([{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }])
  })

  it('drops unnamed placeholder rows', () => {
    expect(
      parsePlants([
        { id: 0, name: 'Фикус', quantity: '1', price: '500' },
        { id: 1, name: '   ', quantity: '3', price: '100' },
        { id: 2, name: '', quantity: '', price: '' },
      ]),
    ).toEqual([{ name: 'Фикус', quantity: 1, unitPriceMinor: 50000 }])
  })

  it('treats a blank or zero quantity as 1 (matching the live footer total)', () => {
    const plants = parsePlants([
      { id: 0, name: 'A', quantity: '', price: '100' },
      { id: 1, name: 'B', quantity: '0', price: '100' },
    ])
    expect(plants.map((p) => p.quantity)).toEqual([1, 1])
  })
})

describe('buildOrderPayload', () => {
  const base = {
    plants: [{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }],
    ownerId: 'owner-1',
    customerId: 'c1',
    completedAt: undefined,
  }

  it('assembles the required document fields from the form values', () => {
    const order = buildOrderPayload({ ...base, fields: fields({ deliveryPrice: '50' }) })
    expect(order).toEqual({
      ownerId: 'owner-1',
      customerId: 'c1',
      address: 'ул. Пушкина, 1',
      plants: base.plants,
      paymentMethod: 'cash',
      deliveryMethod: 'post',
      deliveryPriceMinor: 5000,
      currency: 'RUB',
      paymentStatus: 'pending',
      status: 'processing',
    })
  })

  it('omits blank optionals entirely (updateOrder then clears them via deleteField)', () => {
    const order = buildOrderPayload({
      ...base,
      // '' giftName = "row added, name not typed" — dropped like an empty plant row.
      fields: fields({ giftName: '', comment: '   ' }),
    })
    expect(order).not.toHaveProperty('gifts')
    expect(order).not.toHaveProperty('comment')
    expect(order).not.toHaveProperty('completedAt')
  })

  it('omits gifts when no gift row was ever added (giftName: null)', () => {
    // null ("no gift row") and '' ("row added, name blank") are DISTINCT states
    // in the form model that the payload folds into the same omission via
    // `giftName?.trim() ?? ''`. Asserting null separately keeps a refactor
    // that splits the two branches from silently changing the null path.
    const order = buildOrderPayload({ ...base, fields: fields({ giftName: null }) })
    expect(order).not.toHaveProperty('gifts')
  })

  it('carries a named gift (free: quantity 1, price 0), trimmed comment and completedAt', () => {
    const order = buildOrderPayload({
      ...base,
      completedAt: 1700,
      fields: fields({ giftName: ' Суккулент ', comment: ' note ' }),
    })
    expect(order.gifts).toEqual([{ name: 'Суккулент', quantity: 1, unitPriceMinor: 0 }])
    expect(order.comment).toBe('note')
    expect(order.completedAt).toBe(1700)
  })

  it('stores the marketplace source when set and omits it for a direct order', () => {
    // Absent field = direct order (the common case stores nothing); on an edit
    // the omission becomes deleteField via CLEARABLE_ORDER_FIELDS.
    expect(buildOrderPayload({ ...base, fields: fields({ source: 'avito' }) }).source).toBe('avito')
    expect(buildOrderPayload({ ...base, fields: fields() })).not.toHaveProperty('source')
  })

  it('stores a typed prepaid amount in minor units, independent of the status', () => {
    // The amount survives a prepaid → paid move (payment history), so the
    // builder must not gate it on the CURRENT status.
    const order = buildOrderPayload({
      ...base,
      fields: fields({ paymentStatus: 'paid', prepaidAmount: '1500' }),
    })
    expect(order.prepaidAmountMinor).toBe(150000)
  })

  it('omits a blank or zero prepaid amount (updateOrder then clears it via deleteField)', () => {
    expect(
      buildOrderPayload({ ...base, fields: fields({ paymentStatus: 'prepaid' }) }),
    ).not.toHaveProperty('prepaidAmountMinor')
    expect(
      buildOrderPayload({
        ...base,
        fields: fields({ paymentStatus: 'prepaid', prepaidAmount: '0' }),
      }),
    ).not.toHaveProperty('prepaidAmountMinor')
  })

  it('never writes a photos field (the photo feature was removed)', () => {
    const order = buildOrderPayload({ ...base, fields: fields() })
    expect(order).not.toHaveProperty('photos')
  })
})
