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
// Sidebar (mounted by the in-layout test below) reaches signOutUser through the
// drawer's settings cluster; stub it so the real Firebase SDK stays out.
vi.mock('../../firebase/auth', () => ({ signOutUser: vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ id: 'o1' }),
  useNavigate: () => navigate,
}))

// Imported after the mocks above are registered.
import OrderDetailPage from './OrderDetailPage'
import { renderPageInLayout } from '@/test/renderPageInLayout'

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
    expect(screen.getByRole('combobox', { name: 'Статус заказа' })).toHaveValue('processing')
    // The delivery address lives in the client block (under the phone) — no
    // labelled "Адрес доставки" row anymore.
    expect(screen.getByText('Main St 1')).toBeInTheDocument()
    expect(screen.queryByText('Адрес доставки')).not.toBeInTheDocument()
  })

  it('publishes the order number + date into the mobile top bar (in-layout)', async () => {
    // Mounted inside AppLayout: the page pushes its number/date node through the
    // header-title slot, so the bar names the screen. TWO headings for the order
    // end up in the tree — the bar's (phones) and the content's (desktop) — and
    // CSS alone decides which is visible; jsdom keeps both, so assert the pair.
    renderPageInLayout(<OrderDetailPage />)
    await waitFor(() =>
      expect(screen.getAllByRole('heading', { name: /Заказ №5/ })).toHaveLength(2),
    )
    // The creation date rides along in both spots (bar subtitle + content header).
    expect(screen.getAllByText('01.01.1970')).toHaveLength(2)
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

  it('sums the plants in one bold line with the delivery note under it (no Итого row)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    // The card/form money presentation: the headline is the PLANTS-ONLY sum…
    // (The plants-only sum also appears as the single row's line total in the
    // table, so the amount is asserted via the summary row's own container.)
    const summaryLabel = screen.getByText('Сумма растений')
    expect(summaryLabel.parentElement).toHaveTextContent('299,80 ₽')
    // …with the delivery cost in small type under it (fixture: 30000 minor).
    expect(screen.getByText('+ доставка 300,00 ₽')).toBeInTheDocument()
    // The old three-line breakdown (Итого + full total) is gone.
    expect(screen.queryByText('Итого')).not.toBeInTheDocument()
    expect(screen.queryByText('599,80 ₽')).not.toBeInTheDocument()
  })

  it('omits the delivery note when delivery is free', async () => {
    fetchOrder.mockResolvedValue(order({ deliveryPriceMinor: 0 }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.queryByText(/\+ доставка/)).not.toBeInTheDocument()
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

  it('shows the payment and delivery methods as chips under the address', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    // The logistics left the labelled details rows for the chip row in the
    // client block: quiet outlined pills with the enum labels, each carrying
    // an sr-only field name so a listener still hears what the value means.
    const chips = within(screen.getByTestId('order-chips'))
    expect(chips.getByText('Наличные')).toBeInTheDocument()
    expect(chips.getByText('Почта')).toBeInTheDocument()
    expect(chips.getByText('Способ оплаты:')).toHaveClass('sr-only')
    // No duplicated labelled rows below — the chips ARE the display now.
    expect(screen.queryAllByText('Наличные')).toHaveLength(1)
  })

  it('shows the marketplace source as an accented chip only for a marked order', async () => {
    // An Avito order leads the chip row with an accent-colored "Авито" pill…
    fetchOrder.mockResolvedValue(order({ source: 'avito' }))
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    const avito = within(screen.getByTestId('order-chips')).getByText('Авито')
    expect(avito).toHaveClass('bg-primary')
    unmount()

    // …while a direct order (no stored field) shows no source chip at all.
    fetchOrder.mockResolvedValue(order())
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.queryByText('Авито')).not.toBeInTheDocument()
  })

  it('shows the prepaid amount with the derived remainder while the status is prepaid', async () => {
    // The status select's own "Предоплата" <option> always exists, so the ROW
    // label is the non-option match.
    const prepaidRowLabels = () =>
      screen.queryAllByText('Предоплата').filter((el) => el.tagName !== 'OPTION')

    // The remainder is measured against the PLANTS sum only (delivery is never
    // folded into a displayed total — owner rule, same as the form footer):
    // 2×149,90 = 299,80 ₽; 200 ₽ prepaid → 99,80 left. The 300 ₽ delivery on
    // the fixture must NOT push it to 399,80.
    fetchOrder.mockResolvedValue(order({ paymentStatus: 'prepaid', prepaidAmountMinor: 20000 }))
    const { unmount } = renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(prepaidRowLabels()).toHaveLength(1)
    expect(screen.getByText('200,00 ₽')).toBeInTheDocument()
    expect(screen.getByText(/осталось\s*99,80 ₽/)).toBeInTheDocument()
    expect(screen.queryByText(/399,80/)).not.toBeInTheDocument()
    unmount()

    // Once marked paid the ROW leaves the page entirely (owner request) —
    // the stored amount survives as history, but the display is prepaid-only.
    fetchOrder.mockResolvedValue(order({ paymentStatus: 'paid', prepaidAmountMinor: 20000 }))
    const { unmount: unmountPaid } = renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(prepaidRowLabels()).toHaveLength(0)
    expect(screen.queryByText('200,00 ₽')).not.toBeInTheDocument()
    unmountPaid()

    fetchOrder.mockResolvedValue(order())
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(prepaidRowLabels()).toHaveLength(0)
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
    expect(saved).not.toHaveProperty('status')
    expect(saved).not.toHaveProperty('id')
    // The optimistic value sticks on success.
    expect(screen.getByRole('combobox', { name: 'Статус оплаты' })).toHaveValue('paid')
  })

  it('stamps the completion time when the order is marked delivered', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус заказа' }), 'delivered')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    const saved = patchOrder.mock.calls[0][1]
    expect(saved.status).toBe('delivered')
    expect(typeof saved.completedAt).toBe('number')
    // The completion row appears once stamped.
    expect(await screen.findByText('Завершён')).toBeInTheDocument()
  })

  it('clears the completion time when a completed order leaves a terminal status', async () => {
    const user = userEvent.setup()
    fetchOrder.mockResolvedValue(order({ status: 'delivered', completedAt: 1700 }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    expect(screen.getByText('Завершён')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Статус заказа' }), 'processing')

    await waitFor(() => expect(patchOrder).toHaveBeenCalledTimes(1))
    // Reopened — the patch carries completedAt: null, the signal patchOrder turns
    // into a deleteField() so the stamp is removed.
    expect(patchOrder.mock.calls[0][1].completedAt).toBeNull()
    expect(screen.queryByText('Завершён')).not.toBeInTheDocument()
  })

  it('repeats the order only after an explaining confirm', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.click(screen.getByRole('button', { name: 'Повторить' }))

    // A confirm explains what the jump does BEFORE anything happens: no
    // navigation yet, and the body spells out what carries over vs starts fresh.
    const dialog = await screen.findByRole('dialog', { name: 'Повторить заказ?' })
    expect(within(dialog).getByText(/клиент, растения, адрес/)).toBeInTheDocument()
    expect(within(dialog).getByText(/не переносятся/)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()

    // Cancelling closes the dialog and stays put.
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()

    // Confirming navigates to the create route, carrying the source order as a
    // clone seed (no schema change) — OrderForm prefills the fresh order from it.
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    const dialog2 = await screen.findByRole('dialog', { name: 'Повторить заказ?' })
    await user.click(within(dialog2).getByRole('button', { name: 'Повторить' }))
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

  it('shows photos VIEW-ONLY: the viewer opens, but nothing adds or deletes', async () => {
    fetchOrder.mockResolvedValue(order({ photos: ['orders/owner-1/o1/a.jpg'] }))
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    // The thumbnail is openable, but the page never writes: photos are managed
    // on the edit form now, so there is no per-thumb delete and no add tile.
    expect(screen.getByRole('button', { name: 'Открыть фото' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить фото' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить фото' })).not.toBeInTheDocument()
  })

  it('omits the photos section entirely when the order has none', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })
    // No empty "Фото" heading (and no add tile — the page is view-only).
    expect(screen.queryByRole('heading', { name: 'Фото' })).not.toBeInTheDocument()
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
      expect(screen.getByText('Ожидается')).toBeInTheDocument()
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

    it('shows no purge countdown in the banner — the trash keeps orders until emptied', async () => {
      fetchOrder.mockResolvedValue(order({ deletedAt: Date.now() }))
      renderPage()
      await screen.findByRole('heading', { name: 'Заказ №5' })

      expect(screen.getByText('Этот заказ удалён и находится в корзине.')).toBeInTheDocument()
      expect(screen.queryByText(/Будет навсегда удалён/)).not.toBeInTheDocument()
    })
  })

  it('explains the trash (no auto-deletion) in the delete-confirm dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Заказ №5' })

    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    const dialog = await screen.findByRole('dialog', { name: 'Удалить заказ №5?' })
    // The 30-day auto-purge is gone: the copy promises the trash, not a deadline.
    expect(
      within(dialog).getByText(/можно восстановить или удалить окончательно/),
    ).toBeInTheDocument()
    expect(within(dialog).queryByText(/30 дней/)).not.toBeInTheDocument()
  })
})
