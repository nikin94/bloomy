import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { AuthContext } from '@/context/authContext'
import { SettingsContext } from '@/context/settingsContext'
import { QueryWrapper } from '@/test/queryWrapper'
import type { SettingsState } from '@/context/settingsContext'
import type { Order } from '@/types/order'
import { order as baseOrder, customer } from '@/test/factories'

// The order form is exercised end-to-end through NewOrderPage/EditOrderPage (the
// page wrappers own create-vs-edit persistence + navigation). These tests cover
// the SHARED component's own contract directly: heading, cancel wiring, prefill
// from initialOrder/seed, and that a valid form hands a built order to onSubmit.
const createCustomer = vi.fn()
const fetchCustomer = vi.fn()
const fetchCustomers = vi.fn()
const fetchOrders = vi.fn()

vi.mock('../../firebase/customers', () => ({
  createCustomer: (...a: unknown[]) => createCustomer(...a),
  fetchCustomer: (...a: unknown[]) => fetchCustomer(...a),
  fetchCustomers: (...a: unknown[]) => fetchCustomers(...a),
}))
vi.mock('../../firebase/orders', () => ({
  // OrderForm fetches orders only to build the plant-name autocomplete list, and
  // pre-generates the create order's id so photos can be stored under it up front.
  fetchOrders: (...a: unknown[]) => fetchOrders(...a),
  newOrderId: () => 'pre-generated-order-id',
}))
// The create form's photo picker holds files locally and uploads them on SUBMIT;
// stub the Storage layer so no real Firebase is touched, and expose the mocks so
// the deferred-upload flow can be asserted.
const uploadOrderPhoto = vi.fn()
const deleteOrderPhoto = vi.fn().mockResolvedValue(undefined)
const getPhotoUrl = vi.fn()
vi.mock('../../firebase/photos', () => ({
  uploadOrderPhoto: (...a: unknown[]) => uploadOrderPhoto(...a),
  getPhotoUrl: (...a: unknown[]) => getPhotoUrl(...a),
  deleteOrderPhoto: (...a: unknown[]) => deleteOrderPhoto(...a),
}))
// Stub signOutUser so the real Firebase SDK stays out of the test.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
// Capture observability so the best-effort rollback branches can be asserted: when
// a rollback deleteOrderPhoto itself rejects, that failure must be swallowed and
// routed to reportError with the right tag — never surfaced to the user or crash.
const reportError = vi.fn()
vi.mock('../../observability/reportError', () => ({
  reportError: (...a: unknown[]) => reportError(...a),
}))

// Imported after the mocks above are registered.
import OrderForm from './OrderForm'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Same observable defaults as before consolidation: this file's order fixture
// used a real timestamp, a street address, and a Кактус×2 line.
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    dateCreated: 1700000000000,
    address: 'ул. Пушкина, 1',
    plants: [{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }],
    ...over,
  })

const settings = (): SettingsState => ({
  fontScale: 1,
  theme: 'dark',
  language: 'ru',
  defaultDeliveryMethod: 'post',
  defaultPaymentMethod: 'cash',
  defaultCurrency: 'RUB',
  saveSettings: vi.fn(),
})

// QueryWrapper outermost: the form reads its customer options / plant history
// through the shared TanStack hooks now, so the tree needs a QueryClient (fresh
// per render — no cache leaks between cases).
const renderForm = (props: Partial<React.ComponentProps<typeof OrderForm>> = {}) =>
  render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <SettingsContext.Provider value={settings()}>
          <MemoryRouter>
            <OrderForm
              heading="Новый заказ"
              onSubmit={props.onSubmit ?? vi.fn().mockResolvedValue(undefined)}
              onCancel={props.onCancel ?? vi.fn()}
              initialOrder={props.initialOrder}
              seed={props.seed}
            />
          </MemoryRouter>
        </SettingsContext.Provider>
      </AuthContext.Provider>
    </QueryWrapper>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchCustomers.mockResolvedValue([])
  fetchCustomer.mockResolvedValue(null)
  fetchOrders.mockResolvedValue([])
  createCustomer.mockResolvedValue('new-customer-id')
  deleteOrderPhoto.mockResolvedValue(undefined)
  // The edit form resolves thumbnails for the order's SAVED photos.
  getPhotoUrl.mockImplementation((path: string) => Promise.resolve(`https://cdn/${path}`))
  // jsdom has no object-URL support; the local photo previews need it.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
  // The create form persists a local draft; a leftover from a previous test
  // must not restore into the next one's fresh form.
  localStorage.clear()
})

// The localStorage key the create form's draft lands under (see draft.ts).
const DRAFT_KEY = 'bloomy:order-draft:v1:owner-1'

describe('OrderForm', () => {
  it('renders the heading and starts in new-customer mode with no initial order', async () => {
    renderForm()
    // Gated on the customer fetch; the name input appears once it resolves.
    expect(await screen.findByLabelText('Имя клиента')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Новый заказ' })).toBeInTheDocument()
  })

  it('calls onCancel when the Cancel button is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderForm({ onCancel })
    await screen.findByLabelText('Имя клиента')

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('asks for confirmation on cancel once the form has been touched', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    renderForm({ onCancel })
    await screen.findByLabelText('Имя клиента')

    // Touch the form, then cancel — a confirmation dialog appears instead of
    // leaving (the pristine-form case above still leaves at once).
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('dialog', { name: 'Выйти без сохранения?' }),
    ).toBeInTheDocument()

    // "Остаться" dismisses the dialog and keeps everything typed intact.
    await user.click(screen.getByRole('button', { name: 'Остаться' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Название')).toHaveValue('Роза')

    // Cancelling again and confirming actually leaves.
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    await user.click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('mounts the local photo picker on a create form', async () => {
    renderForm()
    await screen.findByLabelText('Имя клиента')
    // The picker renders its "Фото" heading + an add-photo tile.
    expect(screen.getByRole('heading', { name: 'Фото' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить фото' })).toBeInTheDocument()
  })

  it('holds picked photos locally and only uploads them on submit, saving their paths', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    uploadOrderPhoto.mockResolvedValue('orders/owner-1/pre-generated-order-id/p.jpg')
    const { container } = renderForm({ onSubmit })
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')

    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    // Nothing uploaded yet — the pick is deferred to submit.
    expect(uploadOrderPhoto).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Uploaded under the pre-generated order id, and the paths ride on the order.
    expect(uploadOrderPhoto).toHaveBeenCalledWith('owner-1', 'pre-generated-order-id', file)
    const [orderArg, orderIdArg] = onSubmit.mock.calls[0]
    expect(orderArg.photos).toEqual(['orders/owner-1/pre-generated-order-id/p.jpg'])
    expect(orderIdArg).toBe('pre-generated-order-id')
  })

  it('rolls back a partially-uploaded set on failure, shows an error, and does not submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // First file uploads, second fails — the succeeded one must be rolled back so
    // no orphan is left behind an order that never gets created.
    uploadOrderPhoto
      .mockResolvedValueOnce('orders/owner-1/pre-generated-order-id/a.jpg')
      .mockRejectedValueOnce(new Error('offline'))
    const { container } = renderForm({ onSubmit })
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(deleteOrderPhoto).toHaveBeenCalledWith('orders/owner-1/pre-generated-order-id/a.jpg'),
    )
  })

  it('rolls back uploaded photos when every upload succeeds but the order write fails', async () => {
    // All uploads land, but onSubmit throws (rules-reject / quota / transient during
    // finalize). The order doc never exists, so cloud-cleanup would never fire — the
    // catch must delete the just-uploaded photos itself to avoid a permanent orphan.
    const onSubmit = vi.fn().mockRejectedValue(new Error('order write failed'))
    const user = userEvent.setup()
    uploadOrderPhoto.mockResolvedValue('orders/owner-1/pre-generated-order-id/p.jpg')
    const { container } = renderForm({ onSubmit })
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')

    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(deleteOrderPhoto).toHaveBeenCalledWith('orders/owner-1/pre-generated-order-id/p.jpg'),
    )
  })

  it('reports and swallows a rollback failure on the partial-upload path', async () => {
    // a.jpg uploads, b.jpg fails → the succeeded a.jpg is rolled back, but that
    // rollback delete ALSO rejects. The failure must be swallowed (no crash) and
    // routed to reportError — the user still sees the upload error, a.jpg stays
    // orphaned but the flow does not blow up.
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    uploadOrderPhoto
      .mockResolvedValueOnce('orders/owner-1/pre-generated-order-id/a.jpg')
      .mockRejectedValueOnce(new Error('offline'))
    deleteOrderPhoto.mockRejectedValue(new Error('delete failed'))
    const { container } = renderForm({ onSubmit })
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')

    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ])
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    // The upload error still surfaces; the failed rollback did not crash the flow.
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'orderFormPhotoRollback'),
    )
  })

  it('reports and swallows a rollback failure on the submit-throw path', async () => {
    // Every upload lands, onSubmit throws → the catch rolls the photos back, but
    // the rollback delete ALSO rejects. That failure must be swallowed and routed
    // to reportError — the user sees the write error, the app does not crash.
    const onSubmit = vi.fn().mockRejectedValue(new Error('order write failed'))
    const user = userEvent.setup()
    uploadOrderPhoto.mockResolvedValue('orders/owner-1/pre-generated-order-id/p.jpg')
    deleteOrderPhoto.mockRejectedValue(new Error('delete failed'))
    const { container } = renderForm({ onSubmit })
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')

    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'orderFormSubmitPhotoRollback'),
    )
  })

  it('mounts the photo picker when editing and appends new uploads to the existing photos', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    uploadOrderPhoto.mockResolvedValue('orders/owner-1/o1/new.jpg')
    const { container } = renderForm({
      onSubmit,
      initialOrder: order({ id: 'o1', customerId: 'c1', photos: ['orders/owner-1/o1/old.jpg'] }),
    })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(screen.getByRole('heading', { name: 'Фото' })).toBeInTheDocument()

    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' })
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file)
    // Deferred like create: nothing uploads until the save.
    expect(uploadOrderPhoto).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Uploaded under the EDITED order's own id (not a pre-generated create id),
    // and the saved list keeps the existing photo with the new one appended.
    expect(uploadOrderPhoto).toHaveBeenCalledWith('owner-1', 'o1', file)
    const [orderArg, orderIdArg] = onSubmit.mock.calls[0]
    expect(orderArg.photos).toEqual(['orders/owner-1/o1/old.jpg', 'orders/owner-1/o1/new.jpg'])
    // The pre-generated id still rides along only on CREATE.
    expect(orderIdArg).toBeUndefined()
  })

  it('re-sends the kept photo list unchanged on an edit that adds and removes none', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({
      onSubmit,
      initialOrder: order({ id: 'o1', customerId: 'c1', photos: ['orders/owner-1/o1/old.jpg'] }),
    })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Nothing uploads and nothing is deleted; the saved list is the stored one
    // verbatim (the form owns the photo list now, so the key is always sent
    // while it's non-empty).
    expect(uploadOrderPhoto).not.toHaveBeenCalled()
    expect(deleteOrderPhoto).not.toHaveBeenCalled()
    expect(onSubmit.mock.calls[0][0].photos).toEqual(['orders/owner-1/o1/old.jpg'])
  })

  it('stages an existing-photo removal: dropped from the payload, Storage delete only after the save', async () => {
    let resolveSubmit!: () => void
    // Typed with args so `mock.calls[0][0]` is reachable; resolution is held by
    // the test to observe the delete-after-save ordering.
    const onSubmit = vi.fn<(...args: unknown[]) => Promise<void>>(
      () =>
        new Promise<void>((res) => {
          resolveSubmit = res
        }),
    )
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({
      onSubmit,
      initialOrder: order({ id: 'o1', customerId: 'c1', photos: ['orders/owner-1/o1/old.jpg'] }),
    })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })

    // The saved photo shows as a thumbnail; its × asks for confirmation first
    // (its endpoint is a permanent Storage delete), and only the confirm drops
    // it from the strip — WITHOUT touching Storage: the removal is staged
    // until the save.
    await user.click(await screen.findByRole('button', { name: 'Удалить фото' }))
    const removeDialog = await screen.findByRole('dialog', { name: 'Удалить фото?' })
    expect(deleteOrderPhoto).not.toHaveBeenCalled()
    await user.click(within(removeDialog).getByRole('button', { name: 'Удалить' }))
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).not.toBeInTheDocument()
    expect(deleteOrderPhoto).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // The last photo was removed → the key is omitted, so updateOrder CLEARS
    // the stored field (photos is a clearable field)…
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('photos')
    // …and the Storage file is deleted only once the save has landed.
    expect(deleteOrderPhoto).not.toHaveBeenCalled()
    resolveSubmit()
    await waitFor(() =>
      expect(deleteOrderPhoto).toHaveBeenCalledWith('orders/owner-1/o1/old.jpg'),
    )
  })

  it('prefills the plant rows and existing-customer selection from initialOrder', async () => {
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ initialOrder: order({ customerId: 'c1', plants: [{ name: 'Фиалка', quantity: 3, unitPriceMinor: 50000 }] }) })

    // The customer picker resolves to the existing customer, and the plant row
    // is seeded with the stored plant's name.
    expect(await screen.findByRole('combobox', { name: 'Существующий клиент' })).toHaveValue('c1')
    expect(screen.getByLabelText('Название')).toHaveValue('Фиалка')
  })

  it('hands a built order to onSubmit when a prefilled (valid) form is saved', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ onSubmit, initialOrder: order({ customerId: 'c1' }) })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.customerId).toBe('c1')
    expect(payload.plants).toEqual([{ name: 'Кактус', quantity: 2, unitPriceMinor: 14990 }])
    // The caller owns dateCreated (create stamps it, edit preserves it).
    expect(payload).not.toHaveProperty('dateCreated')
  })

  it('saves the Avito source when the checkbox is ticked, omits it when not', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ onSubmit, initialOrder: order({ customerId: 'c1' }) })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })

    // Unchecked by default (no source on the order) → the payload omits the
    // field entirely, so a direct order stores nothing. One submit per mount:
    // a successful save keeps the form in its `saving` state (the caller
    // navigates away in the app), so the ticked case gets a fresh mount.
    const checkbox = screen.getByRole('checkbox', { name: 'Заказ с Авито' })
    expect(checkbox).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('source')
  })

  it('saves source: "avito" when the checkbox is ticked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    renderForm({ onSubmit, initialOrder: order({ customerId: 'c1' }) })
    await screen.findByRole('combobox', { name: 'Существующий клиент' })

    await user.click(screen.getByRole('checkbox', { name: 'Заказ с Авито' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].source).toBe('avito')
  })

  it('prefills the Avito checkbox from an edited order and from a repeat seed', async () => {
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    // Edit: the order's own source checks the box.
    const { unmount } = renderForm({ initialOrder: order({ customerId: 'c1', source: 'avito' }) })
    expect(await screen.findByRole('checkbox', { name: 'Заказ с Авито' })).toBeChecked()
    unmount()

    // Repeat: the source rides the CONTENTS — the same customer repeating an
    // Avito order almost always comes through the same channel again.
    renderForm({ seed: order({ customerId: 'c1', source: 'avito' }) })
    expect(await screen.findByRole('checkbox', { name: 'Заказ с Авито' })).toBeChecked()
  })

  it('drops a dangling customer FK when the seeded customer no longer exists', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // The address book has one OTHER customer; the repeated order points at a
    // customer that has been hard-deleted, so fetchCustomer resolves null.
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    fetchCustomer.mockResolvedValue(null)
    renderForm({ onSubmit, seed: order({ customerId: 'gone' }) })

    // The picker must NOT keep the dangling id — it falls back to "no selection"
    // rather than silently carrying a broken customer reference.
    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(picker).toHaveValue('')

    // Saving is blocked by the select-customer guard, so a broken FK never
    // persists — everything else in the form was validly prefilled from the seed.
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('drops a dangling customer FK when the seeded-customer fetch throws', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // Same dangling-FK scenario, but fetchCustomer REJECTS (transient network /
    // rules change) instead of resolving null. A throw must be treated the same
    // as "unresolved" — the stale id is dropped, not left to save a broken FK.
    fetchCustomers.mockResolvedValue([customer({ id: 'c1', name: 'Анна' })])
    fetchCustomer.mockRejectedValue(new Error('network'))
    renderForm({ onSubmit, seed: order({ customerId: 'gone' }) })

    const picker = await screen.findByRole('combobox', { name: 'Существующий клиент' })
    expect(picker).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('OrderForm draft (create only, localStorage)', () => {
  it('announces a restored draft (photos are not part of it) and stays silent on a fresh form', async () => {
    const user = userEvent.setup()
    // A fresh create form: no notice.
    const first = renderForm()
    await screen.findByLabelText('Имя клиента')
    expect(screen.queryByText(/Восстановлен черновик/)).not.toBeInTheDocument()

    // Leave a draft behind, then open the create form again: the notice shows,
    // warning that photos never ride in the draft and must be re-attached —
    // the fix for "saved the restored form, photos silently gone".
    await user.type(screen.getByLabelText('Название'), 'Роза')
    first.unmount()
    renderForm()
    await screen.findByLabelText('Имя клиента')
    // findBy: the text is inserted into the status region a beat AFTER the
    // form paints (that's what makes screen readers announce it).
    expect(await screen.findByText(/Восстановлен черновик/)).toBeInTheDocument()
  })

  it('drops the restored-draft notice once the last plant name is cleared', async () => {
    const user = userEvent.setup()
    const first = renderForm()
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    first.unmount()

    renderForm()
    expect(await screen.findByText(/Восстановлен черновик/)).toBeInTheDocument()
    // Clearing the only named plant deletes the stored draft — a notice about
    // a draft that no longer exists must not linger.
    await user.clear(screen.getByLabelText('Название'))
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
    expect(screen.queryByText(/Восстановлен черновик/)).not.toBeInTheDocument()
  })

  it('persists a draft once a plant is named, but not for stray typing without one', async () => {
    const user = userEvent.setup()
    renderForm()
    await screen.findByLabelText('Имя клиента')

    // Address/name alone are below the bar: no named plant → no draft.
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Адрес доставки'), 'ул. Ленина, 1')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()

    // Naming a plant crosses it: the draft appears, carrying everything typed.
    await user.type(screen.getByLabelText('Название'), 'Роза')
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) as string)
    expect(draft.items).toEqual([{ name: 'Роза', quantity: '', price: '' }])
    expect(draft.newName).toBe('Борис')
    expect(draft.address).toBe('ул. Ленина, 1')

    // Clearing the only plant name drops back below the bar: draft removed.
    await user.clear(screen.getByLabelText('Название'))
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('restores the draft into the next create form, and cancel asks before discarding', async () => {
    const user = userEvent.setup()
    const first = renderForm()
    await screen.findByLabelText('Имя клиента')
    await user.type(screen.getByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '149,90')
    first.unmount()

    // A fresh create form seeds itself from the stored draft.
    const onCancel = vi.fn()
    renderForm({ onCancel })
    expect(await screen.findByLabelText('Название')).toHaveValue('Роза')
    expect(screen.getByLabelText('Цена')).toHaveValue('149,90')
    expect(screen.getByLabelText('Имя клиента')).toHaveValue('Борис')

    // A restored draft counts as unsaved input: cancel confirms, and STAYING
    // keeps both the form and the stored draft intact.
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    await user.click(await screen.findByRole('button', { name: 'Остаться' }))
    expect(onCancel).not.toHaveBeenCalled()
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()

    // Confirming the cancel discards the draft along with the form.
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    await user.click(await screen.findByRole('button', { name: 'Выйти' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('clears the draft after a successful save', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull())
  })

  it('keeps the draft when the save fails, so the input still survives a leave', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('Не удалось сохранить'))
    renderForm({ onSubmit })
    await user.type(await screen.findByLabelText('Имя клиента'), 'Борис')
    await user.type(screen.getByLabelText('Название'), 'Роза')
    await user.type(screen.getByLabelText('Цена'), '100')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    await screen.findByRole('alert')
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it('does not write a draft from an edit form, and does not restore one into it', async () => {
    const user = userEvent.setup()
    fetchCustomers.mockResolvedValue([customer()])
    // A stored draft from an abandoned create session…
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        customerMode: 'new',
        selectedCustomerId: '',
        newName: 'Черновик',
        newPhone: '',
        address: 'черновой адрес',
        items: [{ name: 'Фикус', quantity: '', price: '5' }],
        giftName: null,
        deliveryMethod: 'post',
        deliveryPrice: '',
        paymentMethod: 'cash',
        currency: 'RUB',
        paymentStatus: 'pending',
        status: 'processing',
        comment: '',
      }),
    )

    // …must not leak into an EDIT form (its truth is the order itself)…
    renderForm({ initialOrder: order() })
    expect(await screen.findByLabelText('Название')).toHaveValue('Кактус')
    expect(screen.getByLabelText('Адрес доставки')).toHaveValue('ул. Пушкина, 1')

    // …and typing in the edit form must not overwrite the stored create draft.
    await user.type(screen.getByLabelText('Название'), '!')
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) as string)
    expect(stored.items[0].name).toBe('Фикус')
  })
})
