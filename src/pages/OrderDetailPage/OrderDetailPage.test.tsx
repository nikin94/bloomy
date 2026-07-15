import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { AuthContext } from '@/context/authContext'
import type { Order } from '@/types/order'
import { order as baseOrder, customer } from '@/test/factories'

// Firebase-touching modules are mocked so the page never initializes the real
// SDK. We test the page render and the inline status save flow, not Firestore.
const fetchOrder = vi.fn()
const patchOrder = vi.fn()
const softDeleteOrder = vi.fn()
const restoreOrder = vi.fn()
const fetchCustomer = vi.fn()
const navigate = vi.fn()

vi.mock('../../firebase/orders', () => ({
  fetchOrder: (...args: unknown[]) => fetchOrder(...args),
  patchOrder: (...args: unknown[]) => patchOrder(...args),
  softDeleteOrder: (...args: unknown[]) => softDeleteOrder(...args),
  restoreOrder: (...args: unknown[]) => restoreOrder(...args),
}))
vi.mock('../../firebase/customers', () => ({
  fetchCustomer: (...args: unknown[]) => fetchCustomer(...args),
}))
// The photo gallery's storage layer is stubbed so the page never loads the
// Storage SDK; getPhotoUrl never resolves here (orders under test have no photos).
vi.mock('../../firebase/photos', () => ({
  getPhotoUrl: vi.fn(() => new Promise(() => {})),
  uploadOrderPhoto: vi.fn(() => Promise.resolve('orders/owner-1/o1/new.jpg')),
  deleteOrderPhoto: vi.fn(() => Promise.resolve()),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'o1' }),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import OrderDetailPage from './OrderDetailPage'

const USER = { uid: 'owner-1', displayName: 'Tester', email: 't@example.com' } as User

// Same observable defaults as before consolidation: order №5 with a delivery
// fee and a Роза×2 line (the detail page shows the total built from these).
const order = (over: Partial<Order> = {}): Order =>
  baseOrder({
    number: 5,
    dateCreated: 1000,
    address: 'Main St 1',
    plants: [{ name: 'Роза', quantity: 2, unitPriceMinor: 14990 }],
    deliveryPriceMinor: 30000,
    ...over,
  })

const renderPage = () =>
  render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user: USER, loading: false, sessionLost: false }}>
        <MemoryRouter>
          <OrderDetailPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryWrapper>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  fetchOrder.mockResolvedValue(order())
  fetchCustomer.mockResolvedValue(customer())
  patchOrder.mockResolvedValue(undefined)
  softDeleteOrder.mockResolvedValue(undefined)
  restoreOrder.mockResolvedValue(undefined)
})

describe('OrderDetailPage', () => {
  it('shows the order with its statuses editable inline', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Заказ №5' })).toBeInTheDocument()
    // The two statuses render as selects pre-set to the order's current values.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('pending')
    expect(screen.getByRole('combobox', { name: 'Статус отправки' })).toHaveValue('new')
  })

  it('numbers each plant row and shows the quantity as a plain number', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    const itemsTable = screen.getByRole('table')
    // The single plant row is numbered "1" (leading № column)…
    const cells = within(itemsTable).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('1')
    // …and its quantity (2) shows as a bare number, not "×2".
    expect(within(itemsTable).getByText('Роза')).toBeInTheDocument()
    expect(within(itemsTable).getByText('2')).toBeInTheDocument()
    expect(within(itemsTable).queryByText('×2')).not.toBeInTheDocument()
  })

  it('also renders each plant as a stacked card (the phone layout of the table)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    // The mobile card shows "<qty> × <unit price>" — a form that appears only in
    // the card, not the table — so the plant list is readable when the table is
    // hidden on a narrow screen.
    expect(screen.getByText(/2 ×/)).toBeInTheDocument()
  })

  it('shows the gift under the plant list, without price columns', async () => {
    fetchOrder.mockResolvedValue(
      order({ gifts: [{ name: 'Суккулент', quantity: 1, unitPriceMinor: 0 }] }),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    // A labelled line, apart from the priced table rows (a gift is free — no
    // noise zeros in the money columns).
    expect(screen.getByText(/Подарок:/)).toBeInTheDocument()
    expect(screen.getByText('Суккулент')).toBeInTheDocument()
  })

  it('shows no gift line for an order without one', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.queryByText(/Подарок:/)).not.toBeInTheDocument()
  })

  it('saves a status change as a partial patch (only the changed field)', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус оплаты' }), 'paid')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    // A per-field merge: ONLY the changed field is written, so a concurrent edit
    // to another field (on another device) is never clobbered.
    expect(patchOrder).toHaveBeenCalledWith('o1', { paymentStatus: 'paid' })
    const saved = patchOrder.mock.calls[0][1]
    expect(saved).not.toHaveProperty('shipmentStatus')
    expect(saved).not.toHaveProperty('id')
    // The optimistic value sticks on success.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('paid')
  })

  it('stamps the completion time when the order is marked delivered', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'delivered')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    const saved = patchOrder.mock.calls[0][1]
    expect(saved.shipmentStatus).toBe('delivered')
    expect(typeof saved.completedAt).toBe('number')
    // The completion row appears once stamped.
    expect(await screen.findByText('Завершён')).toBeInTheDocument()
  })

  it('clears the completion time when a completed order leaves a terminal status', async () => {
    const user = userEvent.setup()
    fetchOrder.mockResolvedValue(order({ shipmentStatus: 'delivered', completedAt: 1700 }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.getByText('Завершён')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус отправки' }), 'new')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    // Reopened — the patch carries completedAt: null, the signal patchOrder turns
    // into a deleteField() so the stamp is removed.
    expect(patchOrder.mock.calls[0][1].completedAt).toBeNull()
    expect(screen.queryByText('Завершён')).not.toBeInTheDocument()
  })

  it('repeats the order: opens the create form seeded with this order in router state', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    // Navigates to the create route, carrying the source order as a clone seed
    // (no schema change) — OrderForm prefills the fresh order from it.
    expect(navigate).toHaveBeenCalledWith('/orders/new', {
      state: { repeatOrder: expect.objectContaining({ id: 'o1' }) },
    })
  })

  it('soft-deletes the order after confirming and returns to the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    // Delete asks for confirmation in a dialog before doing anything.
    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить заказ №5?' })
    expect(softDeleteOrder).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(softDeleteOrder).toHaveBeenCalledWith('o1'))
    // On success the user is sent back to the list (where it no longer appears).
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders'))
  })

  it('persists a photo removal as a per-field patch of the new list', async () => {
    const user = userEvent.setup()
    fetchOrder.mockResolvedValue(order({ photos: ['orders/owner-1/o1/a.jpg'] }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.click(screen.getByRole('button', { name: 'Удалить фото' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить фото?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))

    // The page writes ONLY the new photos array (per-field merge), and the order
    // is NOT soft-deleted by a photo removal.
    await waitFor(() => expect(patchOrder).toHaveBeenCalledWith('o1', { photos: [] }))
    expect(softDeleteOrder).not.toHaveBeenCalled()
  })

  describe('when the order is in the trash (deleted)', () => {
    beforeEach(() => {
      fetchOrder.mockResolvedValue(order({ isDeleted: true }))
    })

    it('opens a deleted order read-only: banner, Restore, no edit/delete, static statuses', async () => {
      renderPage()
      await screen.findByRole('heading', { name: 'Заказ №5' })

      // The deleted banner is shown, with a Restore action.
      expect(screen.getByText('Этот заказ удалён и находится в корзине.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument()
      // Edit/Repeat/Delete are hidden — a trashed order must be restored first.
      expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Удалить' })).not.toBeInTheDocument()
      // Statuses are plain text, not editable selects; the label still resolves.
      expect(screen.queryByRole('combobox', { name: 'Статус оплаты' })).not.toBeInTheDocument()
      expect(screen.getByText('Ожидает')).toBeInTheDocument()
    })

    it('shows existing photos read-only: no add tile, no per-thumb delete', async () => {
      fetchOrder.mockResolvedValue(order({ isDeleted: true, photos: ['orders/owner-1/o1/a.jpg'] }))
      renderPage()
      await screen.findByRole('heading', { name: 'Заказ №5' })

      // The thumbnail (its open-viewer button) is present...
      expect(screen.getByRole('button', { name: 'Открыть фото' })).toBeInTheDocument()
      // ...but the add tile and the per-thumb delete are gone — nothing can write
      // to the soft-deleted doc or upload an orphan blob under its path.
      expect(screen.queryByRole('button', { name: 'Добавить фото' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Удалить фото' })).not.toBeInTheDocument()
    })

    it('restores the order and returns to the trash', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('heading', { name: 'Заказ №5' })

      await user.click(screen.getByRole('button', { name: 'Восстановить' }))

      await waitFor(() => expect(restoreOrder).toHaveBeenCalledWith('o1'))
      expect(navigate).toHaveBeenCalledWith('/orders/deleted')
    })

    it('shows the auto-purge countdown in the banner when deletedAt is set', async () => {
      // Just deleted → the full 30-day window remains in the countdown.
      fetchOrder.mockResolvedValue(order({ deletedAt: Date.now() }))
      renderPage()
      await screen.findByRole('heading', { name: 'Заказ №5' })

      expect(
        screen.getByText(/Будет навсегда удалён через 30 дней/),
      ).toBeInTheDocument()
    })
  })

  it('warns about the 30-day auto-deletion in the delete-confirm dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить заказ №5?' })
    expect(within(dialog).getByText(/удалён через 30 дней/)).toBeInTheDocument()
  })
})
